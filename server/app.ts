import express, { type Request, type Response, type NextFunction } from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { resolve } from 'node:path'
import {
  registerSchema,
  loginSchema,
  passwordSchema,
  settingsSchema,
  publicFormSchema,
  programmeSchema,
  lessonSchema,
  scheduleSchema,
  projectSchema,
  roles,
  staffRoles,
  text,
  enquiryStatuses,
  donationStatuses,
  volunteerStatuses,
} from '../shared/domain.ts'
import { authentication, digest, hashPassword, HttpError, verifyPassword } from './auth.ts'
import { audit, id, notify, transaction, type Database } from './db.ts'
import { programmeService } from './programmes.ts'
import { integrationStatus } from './integrations.ts'
import { installOperations } from './operations.ts'
import { ensureProviderReady, providerReady } from './operational-rules.ts'
import { csvCell } from './exports.ts'
import { installReviewAccess, type ReviewAccess } from './review-access.ts'

interface AppOptions {
  origin: string
  production?: boolean
  trustProxy?: boolean
  staticDirectory?: string
  rateLimit?: number
  reviewAccess?: ReviewAccess
}
const param = (req: Request, key = 'id') => z.uuid().parse(req.params[key])
export function createApp(db: Database, options: AppOptions) {
  const app = express()
  app.disable('x-powered-by')
  if (options.trustProxy) app.set('trust proxy', 1)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  )
  installReviewAccess(app, options.reviewAccess)
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '100kb' }), cookieParser())
  const auth = authentication(db, !!options.production)
  const programmes = programmeService(db, auth.user)
  app.use('/api', auth.middleware)
  app.use(
    '/api',
    (req, _res, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (req.get('origin') !== options.origin)
          throw new HttpError(403, 'This request did not originate from this website.')
        if (!req.is('application/json')) throw new HttpError(415, 'Send JSON content.')
      }
      next()
    },
    auth.csrf,
  )
  const publicLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.rateLimit ?? 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in 15 minutes.' },
  })
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.rateLimit ?? 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please wait 15 minutes.' },
  })
  const readSettings = () =>
    settingsSchema.parse(
      JSON.parse(String(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data)),
    )
  const managers = (req: Request) => auth.requireRole(req, ['admin', 'manager'])
  const finance = (req: Request) => auth.requireRole(req, ['admin', 'finance'])
  function enquiryPermission(req: Request, kind: string) {
    return kind === 'donation' ? finance(req) : managers(req)
  }
  function getEnquiry(req: Request, enquiryId: string) {
    const row = db.prepare('SELECT * FROM enquiries WHERE id=?').get(enquiryId)
    if (!row) throw new HttpError(404, 'Submission not found.')
    enquiryPermission(req, String(row.kind))
    return row
  }
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok' })
  })
  app.get('/api/settings', (_req, res) =>
    res.json({
      settings: readSettings(),
      integrations: integrationStatus,
      reviewMode: !!options.reviewAccess,
    }),
  )
  app.put('/api/settings', (req, res) => {
    const account = auth.requireRole(req, ['admin'])
    const settings = settingsSchema.parse(req.body)
    transaction(db, () => {
      db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(settings))
      audit(db, account.id, 'settings.updated', 'site')
    })
    res.json({ settings })
  })
  app.get('/api/auth/me', (req, res) => res.json(auth.identity(req) ?? { user: null, csrf: null }))
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = registerSchema.parse(req.body)
    if (db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
      throw new HttpError(
        409,
        'Unable to create an account with this email. Try signing in or contact the team.',
      )
    const userId = id()
    const hash = await hashPassword(input.password)
    db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
      userId,
      input.name,
      input.email,
      hash,
      'learner',
    )
    const csrf = auth.establish(res, userId)
    res
      .status(201)
      .json({ user: { id: userId, name: input.name, email: input.email, role: 'learner' }, csrf })
  })
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = loginSchema.parse(req.body)
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(input.email)
    const valid = await verifyPassword(input.password, row ? String(row.password_hash) : undefined)
    if (!row || !valid) throw new HttpError(401, 'Email or password is incorrect.')
    auth.logout(req, res)
    res.json({
      user: {
        id: String(row.id),
        name: String(row.name),
        email: String(row.email),
        role: String(row.role),
        permissions: auth.grants(String(row.id)),
      },
      csrf: auth.establish(res, String(row.id)),
    })
  })
  app.post('/api/auth/logout', (req, res) => {
    auth.logout(req, res)
    res.json({ ok: true })
  })
  app.post('/api/auth/reset', authLimit, async (req, res) => {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
      .parse(req.body)
    const hash = await hashPassword(input.password)
    transaction(db, () => {
      const row = db
        .prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?')
        .get(digest(input.token), Date.now())
      if (!row) throw new HttpError(400, 'This recovery link is invalid or expired.')
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id)
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.user_id)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id)
      audit(db, String(row.user_id), 'account.password-reset', String(row.user_id))
    })
    auth.logout(req, res)
    res.json({ message: 'Password changed. Sign in with your new password.' })
  })
  app.delete('/api/account', async (req, res) => {
    const account = auth.user(req)
    const input = z.object({ password: z.string().max(128) }).parse(req.body)
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(account.id)
    if (!(await verifyPassword(input.password, String(row?.password_hash))))
      throw new HttpError(403, 'Your password is incorrect.')
    if (account.role === 'admin')
      throw new HttpError(
        409,
        'An administrator must first transfer duties and change this account to a learner.',
      )
    transaction(db, () => {
      if (
        db
          .prepare('SELECT 1 FROM concerns WHERE reporter_id=? OR assigned_to=?')
          .get(account.id, account.id) ||
        db
          .prepare('SELECT 1 FROM financial_actions WHERE proposed_by=? OR reviewed_by=?')
          .get(account.id, account.id) ||
        db.prepare('SELECT 1 FROM provider_agreements WHERE user_id=?').get(account.id)
      )
        throw new HttpError(
          409,
          'A privacy officer must review safeguarding and financial retention obligations before account deletion.',
        )
      audit(db, account.id, 'account.deleted', account.id)
      db.prepare('DELETE FROM users WHERE id=?').run(account.id)
    })
    auth.logout(req, res)
    res.json({
      message:
        'Your account and linked learning records were deleted. Separate public enquiries require a privacy request.',
    })
  })

  app.post('/api/enquiries', publicLimit, (req, res) => {
    const input = publicFormSchema.parse(req.body)
    if (input.website) throw new HttpError(400, 'Submission could not be accepted.')
    const enquiryId = id()
    db.prepare('INSERT INTO enquiries(id,kind,data,status) VALUES(?,?,?,?)').run(
      enquiryId,
      input.kind,
      JSON.stringify(input),
      input.kind === 'donation' ? 'pending' : 'new',
    )
    res.status(201).json({
      id: enquiryId,
      message:
        input.kind === 'donation'
          ? 'Your offer of support has been saved for follow-up. No payment has been taken or confirmed. No email was sent.'
          : 'Your submission has been saved for the team to review. No email was sent. Please keep this reference.',
    })
  })
  app.get('/api/programmes', (_req, res) => {
    const all = db
      .prepare('SELECT id FROM programmes ORDER BY created_at DESC')
      .all()
      .map((row) => programmes.get(String(row.id)))
    res.json({ programmes: all.filter(programmes.published).map(programmes.publicView) })
  })
  app.get('/api/programmes/:id', (req, res) => {
    const p = programmes.get(param(req))
    if (!programmes.published(p)) throw new HttpError(404, 'Programme not found.')
    res.json({ programme: programmes.publicView(p) })
  })
  app.post('/api/programmes/:id/apply', publicLimit, (req, res) =>
    res.status(201).json(programmes.apply(req, param(req))),
  )
  app.get('/api/dashboard', (req, res) => {
    const account = auth.user(req)
    const applications = programmes.applications(undefined, account.id)
    const assignments = ['admin', 'manager', 'instructor'].includes(account.role)
      ? db.prepare('SELECT programme_id,role FROM programme_staff WHERE user_id=?').all(account.id)
      : []
    const assigned = assignments.map((row) => String(row.programme_id))
    const allowed = new Set([
      ...assignments
        .filter(
          (row) =>
            row.role !== 'judge' &&
            (account.role !== 'instructor' ||
              providerReady(db, String(row.programme_id), account.id)),
        )
        .map((row) => String(row.programme_id)),
      ...applications
        .filter(
          (a) =>
            programmes.enrolled(account.id, a.programmeId) &&
            programmes.published(programmes.get(a.programmeId)),
        )
        .map((a) => a.programmeId),
    ])
    const schedule = db
      .prepare(
        'SELECT s.*,p.data FROM scheduled_sessions s JOIN programmes p ON p.id=s.programme_id ORDER BY starts_at',
      )
      .all()
      .filter((row) => allowed.has(String(row.programme_id)))
      .map((row) => ({
        id: String(row.id),
        programmeId: String(row.programme_id),
        programmeTitle: programmeSchema.parse(JSON.parse(String(row.data))).title,
        title: String(row.title),
        startsAt: String(row.starts_at),
        endsAt: String(row.ends_at),
        location: String(row.location),
        joiningUrl: String(row.joining_url),
      }))
    const notifications = db
      .prepare(
        'SELECT id,message,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
      )
      .all(account.id)
    res.json({
      applications,
      assigned: assigned.map((programmeId) => programmes.publicView(programmes.get(programmeId))),
      schedule,
      notifications,
      integrations: integrationStatus,
    })
  })
  app.post('/api/notifications/:id/read', (req, res) => {
    const result = db
      .prepare(
        "UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?",
      )
      .run(param(req), auth.user(req).id)
    if (!result.changes) throw new HttpError(404, 'Notification not found.')
    res.json({ ok: true })
  })
  app.get('/api/staff/overview', (req, res) => {
    const account = auth.requireRole(req, ['admin', 'manager', 'finance'])
    const counts = (sql: string) => Number(db.prepare(sql).get()?.n ?? 0)
    const canManage = ['admin', 'manager'].includes(account.role)
    const canFinance = ['admin', 'finance'].includes(account.role)
    res.json({
      programmes: canManage
        ? db
            .prepare('SELECT id FROM programmes')
            .all()
            .map((row) => programmes.get(String(row.id)))
            .filter(programmes.published).length
        : null,
      pendingApplications: canManage
        ? counts("SELECT count(*) AS n FROM applications WHERE status IN ('pending','waitlisted')")
        : null,
      approvedParticipants: canManage
        ? counts("SELECT count(*) AS n FROM applications WHERE status='approved'")
        : null,
      enquiries: canManage
        ? counts(
            "SELECT count(*) AS n FROM enquiries WHERE kind!='donation' AND status NOT IN ('closed','declined','completed')",
          )
        : null,
      donations: canFinance
        ? db
            .prepare('SELECT status,count(*) AS count FROM enquiries WHERE kind=? GROUP BY status')
            .all('donation')
        : null,
      money: canFinance
        ? db
            .prepare(
              `SELECT CASE WHEN status='pending' THEN json_extract(data,'$.currency') ELSE receipt_currency END AS currency,status,
        sum(CASE WHEN status='pending' THEN json_extract(data,'$.amountMinor') ELSE received_minor END) AS amountMinor
        FROM enquiries WHERE kind='donation' AND status!='declined' AND json_extract(data,'$.donationType')='money' GROUP BY currency,status`,
            )
            .all()
        : null,
    })
  })
  app.get('/api/staff/users', (req, res) => {
    const account = auth.requireRole(req, ['admin', 'manager', 'finance'])
    res.json({
      users: db
        .prepare(
          account.role === 'finance'
            ? "SELECT id,name,email,role FROM users WHERE role IN ('admin','finance') ORDER BY name"
            : "SELECT id,name,email,role FROM users WHERE role IN ('admin','manager','finance','instructor') ORDER BY name",
        )
        .all(),
    })
  })
  app.patch('/api/staff/users/:id', (req, res) => {
    const account = auth.requireRole(req, ['admin'])
    const input = z.object({ email: z.email(), role: z.enum(roles) }).parse(req.body)
    const userId = param(req)
    const target = db
      .prepare('SELECT role FROM users WHERE id=? AND email=?')
      .get(userId, input.email.toLowerCase())
    if (!target)
      throw new HttpError(
        404,
        'User not found. Use the staff CLI to promote an existing learner by email.',
      )
    if (
      target.role === 'admin' &&
      input.role !== 'admin' &&
      Number(db.prepare("SELECT count(*) AS n FROM users WHERE role='admin'").get()?.n) <= 1
    )
      throw new HttpError(409, 'At least one administrator is required.')
    transaction(db, () => {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(input.role, userId)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId)
      audit(db, account.id, 'user.role-updated', userId)
    })
    res.json({ ok: true })
  })
  app.get('/api/staff/programmes', (req, res) => {
    const account = auth.requireRole(req, ['admin', 'manager', 'instructor'])
    const rows = ['admin', 'manager'].includes(account.role)
      ? db.prepare('SELECT id FROM programmes ORDER BY created_at DESC').all()
      : db.prepare('SELECT programme_id AS id FROM programme_staff WHERE user_id=?').all(account.id)
    const result = rows.map((row) => programmes.get(String(row.id)))
    res.json({ programmes: account.role === 'admin' ? result : result.map(programmes.publicView) })
  })
  app.post('/api/staff/programmes', (req, res) => {
    const account = managers(req)
    res.status(201).json({ programme: programmes.save(programmeSchema.parse(req.body), account) })
  })
  app.get('/api/staff/programmes/:id', (req, res) => {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId, [...staffRoles])
    const programme = programmes.get(programmeId)
    res.json({
      programme: account.role === 'admin' ? programme : programmes.publicView(programme),
      assignment: db
        .prepare('SELECT role FROM programme_staff WHERE programme_id=? AND user_id=?')
        .get(programmeId, account.id)?.role,
    })
  })
  app.put('/api/staff/programmes/:id', (req, res) => {
    const account = managers(req)
    const programmeId = param(req)
    programmes.get(programmeId)
    res.json({ programme: programmes.save(programmeSchema.parse(req.body), account, programmeId) })
  })
  app.get('/api/staff/programmes/:id/applications', (req, res) => {
    const account = managers(req)
    res.json({
      applications: programmes.applications(param(req), undefined, account.role === 'admin'),
    })
  })
  app.patch('/api/staff/applications/:id', (req, res) => {
    programmes.review(req, param(req))
    res.json({ ok: true })
  })
  app.get('/api/finance/applications', (req, res) => {
    finance(req)
    res.json({
      applications: programmes
        .applications()
        .filter((a) => ['paid', 'subsidised'].includes(a.mode))
        .map((a) => ({
          id: a.id,
          title: a.title,
          participantName: a.participantName,
          paymentStatus: a.paymentStatus,
          paymentReference: String(
            db.prepare('SELECT payment_reference FROM applications WHERE id=?').get(a.id)
              ?.payment_reference ?? '',
          ),
          feeMinor: programmes.get(a.programmeId).funding.find((f) => f.mode === a.mode)?.feeMinor,
          currency: programmes.get(a.programmeId).funding.find((f) => f.mode === a.mode)?.currency,
        })),
    })
  })
  app.patch('/api/finance/applications/:id', (req, res) => {
    const account = finance(req)
    const input = z
      .object({
        paymentStatus: z.enum(['pending', 'verified', 'failed', 'refunded']),
        reference: text(300),
      })
      .parse(req.body)
    const applicationId = param(req)
    const row = db.prepare('SELECT * FROM applications WHERE id=?').get(applicationId)
    if (!row || !['paid', 'subsidised'].includes(String(row.mode)))
      throw new HttpError(404, 'Paid application not found.')
    transaction(db, () => {
      db.prepare('UPDATE applications SET payment_status=?,payment_reference=? WHERE id=?').run(
        input.paymentStatus,
        input.reference,
        applicationId,
      )
      notify(
        db,
        String(row.user_id),
        `Payment review updated: ${input.paymentStatus}. Programme access still requires approval.`,
      )
      audit(db, account.id, `payment.${input.paymentStatus}`, applicationId)
    })
    res.json({ ok: true })
  })
  app.get('/api/staff/programmes/:id/assignments', (req, res) => {
    const programmeId = param(req)
    programmes.staff(req, programmeId)
    res.json({
      assignments: db
        .prepare(
          'SELECT u.id AS userId,u.name,ps.role FROM programme_staff ps JOIN users u ON u.id=ps.user_id WHERE ps.programme_id=?',
        )
        .all(programmeId),
    })
  })
  app.post('/api/staff/programmes/:id/assignments', (req, res) => {
    const account = managers(req)
    const programmeId = param(req)
    programmes.get(programmeId)
    const input = z.object({ userId: z.uuid(), role: z.enum(staffRoles) }).parse(req.body)
    const target = db
      .prepare("SELECT id FROM users WHERE id=? AND role IN ('admin','manager','instructor')")
      .get(input.userId)
    if (!target) throw new HttpError(400, 'Assign an instructor or programme staff account.')
    transaction(db, () => {
      ensureProviderReady(db, programmeId, input.userId)
      const conflict = db
        .prepare(
          `SELECT 1 FROM scheduled_sessions a JOIN scheduled_sessions b ON a.starts_at<b.ends_at AND a.ends_at>b.starts_at
        JOIN programme_staff s ON s.programme_id=b.programme_id WHERE a.programme_id=? AND s.user_id=? AND a.programme_id!=b.programme_id`,
        )
        .get(programmeId, input.userId)
      if (conflict)
        throw new HttpError(
          409,
          'This provider is assigned to another programme with a conflicting session.',
        )
      db.prepare(
        'INSERT INTO programme_staff(programme_id,user_id,role) VALUES(?,?,?) ON CONFLICT(programme_id,user_id) DO UPDATE SET role=excluded.role',
      ).run(programmeId, input.userId, input.role)
      audit(db, account.id, `assignment.${input.role}`, programmeId)
      notify(
        db,
        input.userId,
        `You have been assigned as ${input.role} to ${programmes.get(programmeId).title}.`,
      )
    })
    res.json({ ok: true })
  })
  app.delete('/api/staff/programmes/:id/assignments/:userId', (req, res) => {
    const account = managers(req)
    const programmeId = param(req)
    transaction(db, () => {
      db.prepare('DELETE FROM programme_staff WHERE programme_id=? AND user_id=?').run(
        programmeId,
        param(req, 'userId'),
      )
      audit(db, account.id, 'assignment.removed', programmeId)
    })
    res.json({ ok: true })
  })

  app.get('/api/staff/enquiries', (req, res) => {
    const kind = z.enum(['contact', 'partner', 'volunteer', 'donation']).parse(req.query.kind)
    enquiryPermission(req, kind)
    const rows = db
      .prepare('SELECT * FROM enquiries WHERE kind=? ORDER BY created_at DESC LIMIT 500')
      .all(kind)
    res.json({
      enquiries: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        data: publicFormSchema.parse(JSON.parse(String(row.data))),
        status: row.status,
        notes: row.notes,
        assignedTo: row.assigned_to,
        programmeId: row.programme_id,
        createdAt: row.created_at,
        receivedAmountMinor: row.received_minor,
        receiptCurrency: row.receipt_currency,
        receiptReference: row.receipt_reference,
      })),
    })
  })
  app.get('/api/staff/enquiries/:id/history', (req, res) => {
    const enquiryId = param(req)
    getEnquiry(req, enquiryId)
    res.json({
      history: db
        .prepare(
          'SELECT h.status,h.note,h.created_at AS createdAt,u.name FROM enquiry_history h LEFT JOIN users u ON u.id=h.user_id WHERE enquiry_id=? ORDER BY h.created_at',
        )
        .all(enquiryId),
    })
  })
  app.patch('/api/staff/enquiries/:id', (req, res) => {
    const enquiryId = param(req)
    const row = getEnquiry(req, enquiryId)
    const account = auth.user(req)
    const statuses =
      row.kind === 'donation'
        ? donationStatuses
        : row.kind === 'volunteer'
          ? volunteerStatuses
          : enquiryStatuses
    const input = z
      .object({
        status: z.enum(statuses),
        notes: z.string().max(5000),
        assignedTo: z.uuid().nullable(),
        receivedAmountMinor: z.number().int().min(0).max(1000000000).optional(),
        receiptCurrency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        receiptReference: z.string().trim().max(300).optional(),
      })
      .parse(req.body)
    if (input.assignedTo) {
      const target = db.prepare('SELECT role FROM users WHERE id=?').get(input.assignedTo)
      if (
        !target ||
        !(row.kind === 'donation' ? ['admin', 'finance'] : ['admin', 'manager']).includes(
          String(target.role),
        )
      )
        throw new HttpError(400, 'Assign a staff member with permission for this queue.')
    }
    const transitions = ['pending', 'received', 'verified', 'allocated']
    if (
      row.kind === 'donation' &&
      input.status !== 'declined' &&
      input.status !== 'pending' &&
      transitions.indexOf(input.status) > transitions.indexOf(String(row.status)) + 1
    )
      throw new HttpError(
        409,
        'Record receipt, then verification, then allocation. A pledge is not money received.',
      )
    const received = input.receivedAmountMinor ?? Number(row.received_minor)
    const receiptCurrency = input.receiptCurrency ?? String(row.receipt_currency)
    const receiptReference = input.receiptReference ?? String(row.receipt_reference)
    if (
      row.kind === 'donation' &&
      db.prepare('SELECT 1 FROM funding_awards WHERE donation_id=?').get(enquiryId) &&
      (input.status !== row.status ||
        received !== row.received_minor ||
        receiptCurrency !== row.receipt_currency ||
        receiptReference !== row.receipt_reference)
    )
      throw new HttpError(
        409,
        'This receipt is in the funding register. Use a separately approved receipt adjustment; the original receipt reference and currency are locked.',
      )
    if (
      row.kind === 'donation' &&
      receiptReference &&
      db
        .prepare(
          "SELECT 1 FROM enquiries WHERE kind='donation' AND id!=? AND upper(trim(receipt_reference))=upper(trim(?))",
        )
        .get(enquiryId, receiptReference)
    )
      throw new HttpError(409, 'This donation receipt reference is already recorded.')
    if (
      row.kind === 'donation' &&
      receiptReference &&
      db
        .prepare('SELECT 1 FROM financial_actions WHERE reference=upper(trim(?))')
        .get(receiptReference)
    )
      throw new HttpError(409, 'This reference already exists in the funding register.')
    if (row.kind === 'donation' && ['received', 'verified', 'allocated'].includes(input.status)) {
      const details = publicFormSchema.parse(JSON.parse(String(row.data)))
      if (!receiptReference || (details.donationType === 'money' && received <= 0))
        throw new HttpError(
          400,
          'Record an actual receipt reference and, for money, the actual amount received.',
        )
    }
    transaction(db, () => {
      db.prepare('UPDATE enquiries SET status=?,notes=?,assigned_to=? WHERE id=?').run(
        input.status,
        input.notes,
        input.assignedTo,
        enquiryId,
      )
      if (row.kind === 'donation')
        db.prepare(
          'UPDATE enquiries SET received_minor=?,receipt_currency=?,receipt_reference=? WHERE id=?',
        ).run(received, receiptCurrency, receiptReference, enquiryId)
      db.prepare(
        'INSERT INTO enquiry_history(id,enquiry_id,status,note,user_id) VALUES(?,?,?,?,?)',
      ).run(id(), enquiryId, input.status, input.notes, account.id)
      audit(db, account.id, `enquiry.${input.status}`, enquiryId)
    })
    res.json({ ok: true })
  })
  app.post('/api/staff/enquiries/:id/convert', (req, res) => {
    const account = managers(req)
    const row = getEnquiry(req, param(req))
    if (row.kind !== 'partner' || row.status !== 'accepted')
      throw new HttpError(409, 'Only accepted partner enquiries can become programmes.')
    if (row.programme_id) throw new HttpError(409, 'This enquiry is already linked to a programme.')
    const input = programmeSchema.parse(req.body)
    input.status = 'draft'
    const programme = transaction(db, () => {
      const created = programmes.save(input, account)
      db.prepare('UPDATE enquiries SET programme_id=? WHERE id=?').run(created.id, row.id)
      audit(db, account.id, 'enquiry.converted', String(row.id))
      return created
    })
    res.status(201).json({ programme })
  })
  app.delete('/api/staff/enquiries/:id', (req, res) => {
    const account = auth.requireRole(req, ['admin'])
    const enquiryId = param(req)
    getEnquiry(req, enquiryId)
    if (db.prepare('SELECT 1 FROM funding_awards WHERE donation_id=?').get(enquiryId))
      throw new HttpError(409, 'Funding-linked receipts must be retained for reconciliation.')
    transaction(db, () => {
      db.prepare('DELETE FROM enquiries WHERE id=?').run(enquiryId)
      audit(db, account.id, 'enquiry.deleted', enquiryId)
    })
    res.json({ ok: true })
  })
  app.get('/api/staff/export', (req, res) => {
    const kind = z.enum(['contact', 'partner', 'volunteer', 'donation']).parse(req.query.kind)
    const account = enquiryPermission(req, kind)
    const rows = db
      .prepare('SELECT * FROM enquiries WHERE kind=? ORDER BY created_at DESC')
      .all(kind)
    const output = [
      ['reference', 'name', 'email', 'status', 'created_at'],
      ...rows.map((row) => {
        const data = publicFormSchema.parse(JSON.parse(String(row.data)))
        return [row.id, data.name, data.email, row.status, row.created_at]
      }),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
    audit(db, account.id, `export.${kind}`, kind)
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${kind}.csv"`,
      })
      .send(output)
  })
  app.get('/api/staff/audit', (req, res) => {
    auth.requireRole(req, ['admin'])
    res.json({
      events: db
        .prepare(
          'SELECT a.id,a.action,a.resource_id AS resourceId,a.created_at AS createdAt,u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200',
        )
        .all(),
    })
  })

  app.get('/api/programmes/:id/lessons', (req, res) => {
    const programmeId = param(req)
    const account = programmes.contentAccess(req, programmeId)
    const privileged =
      ['admin', 'manager'].includes(account.role) ||
      (account.role === 'instructor' &&
        !!db
          .prepare(
            "SELECT 1 FROM programme_staff WHERE programme_id=? AND user_id=? AND role!='judge'",
          )
          .get(programmeId, account.id))
    const lessons = db
      .prepare(
        `SELECT l.*,p.completed_at FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.programme_id=? ${privileged ? '' : 'AND l.published=1'} ORDER BY l.position,l.id`,
      )
      .all(account.id, programmeId)
    res.json({
      lessons: lessons.map((row) => ({
        id: row.id,
        title: row.title,
        module: row.module,
        body: row.body,
        position: row.position,
        published: row.published === 1,
        done: !!row.completed_at,
      })),
    })
  })
  app.post('/api/staff/programmes/:id/lessons', (req, res) => {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId)
    const input = lessonSchema.parse(req.body)
    const lessonId = id()
    transaction(db, () => {
      db.prepare(
        'INSERT INTO lessons(id,programme_id,title,module,body,position,published) VALUES(?,?,?,?,?,?,?)',
      ).run(
        lessonId,
        programmeId,
        input.title,
        input.module,
        input.body,
        input.position,
        Number(input.published),
      )
      audit(db, account.id, 'lesson.created', lessonId)
    })
    res.status(201).json({ id: lessonId })
  })
  app.put('/api/staff/programmes/:id/lessons/:lessonId', (req, res) => {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId)
    const input = lessonSchema.parse(req.body)
    const lessonId = param(req, 'lessonId')
    transaction(db, () => {
      const result = db
        .prepare(
          'UPDATE lessons SET title=?,module=?,body=?,position=?,published=? WHERE id=? AND programme_id=?',
        )
        .run(
          input.title,
          input.module,
          input.body,
          input.position,
          Number(input.published),
          lessonId,
          programmeId,
        )
      if (!result.changes) throw new HttpError(404, 'Lesson not found.')
      audit(db, account.id, 'lesson.updated', lessonId)
    })
    res.json({ ok: true })
  })
  app.post('/api/programmes/:id/lessons/:lessonId/complete', (req, res) => {
    const programmeId = param(req)
    const account = programmes.contentAccess(req, programmeId)
    if (!programmes.enrolled(account.id, programmeId))
      throw new HttpError(403, 'Only approved participants may record learning progress.')
    const lessonId = param(req, 'lessonId')
    if (
      !db
        .prepare('SELECT id FROM lessons WHERE id=? AND programme_id=? AND published=1')
        .get(lessonId, programmeId)
    )
      throw new HttpError(404, 'Published lesson not found.')
    db.prepare('INSERT OR IGNORE INTO progress(lesson_id,user_id) VALUES(?,?)').run(
      lessonId,
      account.id,
    )
    res.json({ ok: true })
  })
  app.post('/api/programmes/:id/rating', (req, res) => {
    const programmeId = param(req)
    const account = programmes.contentAccess(req, programmeId)
    const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body)
    const total = Number(
      db
        .prepare('SELECT count(*) AS n FROM lessons WHERE programme_id=? AND published=1')
        .get(programmeId)?.n,
    )
    const completed = Number(
      db
        .prepare(
          'SELECT count(*) AS n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.programme_id=? AND l.published=1 AND p.user_id=?',
        )
        .get(programmeId, account.id)?.n,
    )
    if (!programmes.enrolled(account.id, programmeId) || !total || total !== completed)
      throw new HttpError(403, 'Complete all published lessons before leaving a rating.')
    db.prepare(
      'INSERT INTO ratings(programme_id,user_id,rating) VALUES(?,?,?) ON CONFLICT(programme_id,user_id) DO UPDATE SET rating=excluded.rating',
    ).run(programmeId, account.id, rating)
    res.json({ ok: true })
  })
  app.get('/api/programmes/:id/schedule', (req, res) => {
    const programmeId = param(req)
    programmes.contentAccess(req, programmeId)
    res.json({
      sessions: db
        .prepare(
          'SELECT id,programme_id AS programmeId,title,starts_at AS startsAt,ends_at AS endsAt,location,joining_url AS joiningUrl FROM scheduled_sessions WHERE programme_id=? ORDER BY starts_at',
        )
        .all(programmeId),
    })
  })
  function saveSession(req: Request, res: Response, updating: boolean) {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId)
    const input = scheduleSchema.parse(req.body)
    const sessionId = updating ? param(req, 'sessionId') : id()
    if (
      updating &&
      !db
        .prepare('SELECT id FROM scheduled_sessions WHERE id=? AND programme_id=?')
        .get(sessionId, programmeId)
    )
      throw new HttpError(404, 'Session not found.')
    const starts = new Date(input.startsAt).toISOString()
    const ends = new Date(input.endsAt).toISOString()
    transaction(db, () => {
      const conflict = db
        .prepare(
          `SELECT s.id FROM scheduled_sessions s WHERE s.id!=? AND s.starts_at<? AND s.ends_at>? AND (
        s.programme_id=? OR
        EXISTS(SELECT 1 FROM programme_staff a JOIN programme_staff b ON a.user_id=b.user_id WHERE a.programme_id=s.programme_id AND b.programme_id=?) OR
        EXISTS(SELECT 1 FROM applications a JOIN applications b ON a.user_id=b.user_id WHERE a.programme_id=s.programme_id AND b.programme_id=? AND a.status='approved' AND b.status='approved')
      )`,
        )
        .get(sessionId, ends, starts, programmeId, programmeId, programmeId)
      if (conflict)
        throw new HttpError(
          409,
          'This session conflicts with the programme, an assigned provider or an approved participant.',
        )
      db.prepare(
        'INSERT INTO scheduled_sessions(id,programme_id,title,starts_at,ends_at,location,joining_url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,joining_url=excluded.joining_url',
      ).run(sessionId, programmeId, input.title, starts, ends, input.location, input.joiningUrl)
      const users = db
        .prepare(
          "SELECT user_id FROM applications WHERE programme_id=? AND status='approved' UNION SELECT user_id FROM programme_staff WHERE programme_id=?",
        )
        .all(programmeId, programmeId)
      for (const row of users)
        notify(
          db,
          String(row.user_id),
          `${programmes.get(programmeId).title}: session "${input.title}" ${updating ? 'updated' : 'scheduled'}. Check your schedule.`,
        )
      audit(db, account.id, updating ? 'session.updated' : 'session.created', sessionId)
    })
    res.status(updating ? 200 : 201).json({ id: sessionId })
  }
  app.post('/api/staff/programmes/:id/schedule', (req, res) => saveSession(req, res, false))
  app.put('/api/staff/programmes/:id/schedule/:sessionId', (req, res) =>
    saveSession(req, res, true),
  )
  app.get('/api/staff/programmes/:id/attendance', (req, res) => {
    const programmeId = param(req)
    programmes.staff(req, programmeId)
    res.json({
      participants: programmes
        .applications(programmeId)
        .filter((a) => a.status === 'approved')
        .map((a) => ({ userId: a.userId, name: a.participantName })),
      attendance: db
        .prepare(
          'SELECT a.session_id AS sessionId,a.user_id AS userId,a.status FROM attendance a JOIN scheduled_sessions s ON s.id=a.session_id WHERE s.programme_id=?',
        )
        .all(programmeId),
    })
  })
  app.post('/api/staff/programmes/:id/attendance', (req, res) => {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId)
    const input = z
      .object({
        sessionId: z.uuid(),
        userId: z.uuid(),
        status: z.enum(['present', 'absent', 'excused']),
      })
      .parse(req.body)
    if (
      !db
        .prepare('SELECT 1 FROM scheduled_sessions WHERE id=? AND programme_id=?')
        .get(input.sessionId, programmeId) ||
      !programmes.enrolled(input.userId, programmeId)
    )
      throw new HttpError(400, 'Select an approved participant and a session from this programme.')
    transaction(db, () => {
      db.prepare(
        'INSERT INTO attendance(session_id,user_id,status) VALUES(?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET status=excluded.status',
      ).run(input.sessionId, input.userId, input.status)
      audit(db, account.id, 'attendance.updated', input.sessionId)
    })
    res.json({ ok: true })
  })
  app.get('/api/staff/programmes/:id/report', (req, res) => {
    const programmeId = param(req)
    programmes.staff(req, programmeId)
    const p = programmes.get(programmeId)
    const totalLessons = Number(
      db
        .prepare('SELECT count(*) AS n FROM lessons WHERE programme_id=? AND published=1')
        .get(programmeId)?.n,
    )
    const applications = programmes.applications(programmeId)
    const count = (sql: string) => Number(db.prepare(sql).get(programmeId)?.n ?? 0)
    const completed = totalLessons
      ? count(`SELECT count(*) AS n FROM applications a WHERE a.programme_id=? AND a.status='approved' AND
      (SELECT count(*) FROM progress r JOIN lessons l ON l.id=r.lesson_id WHERE r.user_id=a.user_id AND l.programme_id=a.programme_id AND l.published=1)=${totalLessons}`)
      : 0
    res.json({
      title: p.title,
      applications: applications.length,
      approved: p.enrolled,
      completed,
      attended: count(
        "SELECT count(*) AS n FROM attendance a JOIN scheduled_sessions s ON s.id=a.session_id WHERE s.programme_id=? AND a.status='present'",
      ),
      projects: count('SELECT count(*) AS n FROM projects WHERE programme_id=?'),
      funding: p.funding.map((f) => ({ mode: f.mode, capacity: f.capacity, approved: f.approved })),
      financials: auth.user(req).role === 'admin' ? p.funding : undefined,
      note: 'Actual recorded activity, not estimates. Attendance counts participant-session records. Completion means all currently published lessons.',
    })
  })

  function eventAccess(req: Request, programmeId: string, staffAllowed = false) {
    const account = auth.user(req)
    const p = programmes.get(programmeId)
    if (!['hackathon', 'competition'].includes(p.type))
      throw new HttpError(409, 'This programme is not an innovation event.')
    if (staffAllowed) {
      try {
        programmes.staff(req, programmeId, [...staffRoles])
        return { account, p, staff: true }
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 403) throw error
      }
    }
    programmes.contentAccess(req, programmeId)
    if (!programmes.enrolled(account.id, programmeId))
      throw new HttpError(403, 'Approved participation is required.')
    return { account, p, staff: false }
  }
  const openSubmissions = (deadline: string | null, status: string) => {
    if (
      !['open', 'scheduled', 'full', 'closed'].includes(status) ||
      (deadline && Date.parse(deadline) < Date.now())
    )
      throw new HttpError(409, 'The submission window is closed.')
  }
  app.get('/api/programmes/:id/team', (req, res) => {
    const programmeId = param(req)
    const { account } = eventAccess(req, programmeId)
    const row = db
      .prepare(
        'SELECT t.* FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=? AND m.programme_id=?',
      )
      .get(account.id, programmeId)
    if (!row) {
      res.json({ team: null })
      return
    }
    res.json({
      team: {
        id: row.id,
        name: row.name,
        leaderId: row.leader_id,
        joinCode: row.leader_id === account.id ? row.join_code : undefined,
        members: db
          .prepare(
            "SELECT m.user_id AS userId,json_extract(a.data,'$.participantName') AS name FROM team_members m JOIN applications a ON a.user_id=m.user_id AND a.programme_id=m.programme_id WHERE m.team_id=?",
          )
          .all(row.id),
      },
    })
  })
  app.post('/api/programmes/:id/team', (req, res) => {
    const programmeId = param(req)
    const { account, p } = eventAccess(req, programmeId)
    openSubmissions(p.event.deadline, p.status)
    if (!p.event.teamsEnabled) throw new HttpError(409, 'Teams are not enabled for this event.')
    const input = z
      .object({ name: text(100).optional(), joinCode: z.string().max(100).optional() })
      .refine((v) => !!v.name !== !!v.joinCode, 'Provide a team name or a join code, not both.')
      .parse(req.body)
    transaction(db, () => {
      if (
        db
          .prepare('SELECT 1 FROM team_members WHERE user_id=? AND programme_id=?')
          .get(account.id, programmeId)
      )
        throw new HttpError(409, 'You already belong to a team for this event.')
      if (input.joinCode) {
        const team = db
          .prepare('SELECT * FROM teams WHERE programme_id=? AND join_code=?')
          .get(programmeId, input.joinCode)
        if (!team) throw new HttpError(404, 'Team invite not found.')
        const members = Number(
          db.prepare('SELECT count(*) AS n FROM team_members WHERE team_id=?').get(team.id)?.n,
        )
        if (members >= p.event.teamSize) throw new HttpError(409, 'This team is full.')
        db.prepare('INSERT INTO team_members(team_id,programme_id,user_id) VALUES(?,?,?)').run(
          team.id,
          programmeId,
          account.id,
        )
      } else {
        const teamId = id()
        db.prepare(
          'INSERT INTO teams(id,programme_id,leader_id,name,join_code) VALUES(?,?,?,?,?)',
        ).run(teamId, programmeId, account.id, input.name!, id())
        db.prepare('INSERT INTO team_members(team_id,programme_id,user_id) VALUES(?,?,?)').run(
          teamId,
          programmeId,
          account.id,
        )
      }
      audit(db, account.id, input.joinCode ? 'team.joined' : 'team.created', programmeId)
    })
    res.status(201).json({ ok: true })
  })
  app.get('/api/programmes/:id/projects', (req, res) => {
    const programmeId = param(req)
    const { account, p, staff } = eventAccess(req, programmeId, true)
    const rows = db
      .prepare('SELECT * FROM projects WHERE programme_id=?')
      .all(programmeId)
      .filter(
        (row) =>
          staff ||
          row.user_id === account.id ||
          !!db
            .prepare('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?')
            .get(row.team_id, account.id),
      )
    res.json({
      projects: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        teamId: row.team_id,
        title: row.title,
        description: row.description,
        url: row.url,
        winner:
          p.event.resultsPublished || ['admin', 'manager'].includes(account.role)
            ? row.winner === 1
            : false,
        scores:
          p.event.resultsPublished || staff
            ? db
                .prepare('SELECT * FROM scores WHERE project_id=?')
                .all(row.id)
                .filter(
                  (score) =>
                    p.event.resultsPublished ||
                    ['admin', 'manager'].includes(account.role) ||
                    score.judge_id === account.id,
                )
                .map((score) => ({
                  ...z
                    .object({ values: z.array(z.number()), feedback: z.string() })
                    .parse(JSON.parse(String(score.data))),
                  judgeId: staff ? String(score.judge_id) : '',
                }))
            : undefined,
      })),
    })
  })
  app.post('/api/programmes/:id/projects', (req, res) => {
    const programmeId = param(req)
    const { account, p } = eventAccess(req, programmeId)
    openSubmissions(p.event.deadline, p.status)
    const input = projectSchema.parse(req.body)
    const team = db
      .prepare(
        'SELECT t.* FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=? AND m.programme_id=?',
      )
      .get(account.id, programmeId)
    if (p.event.teamsEnabled && (!team || team.leader_id !== account.id))
      throw new HttpError(403, 'Only a team leader can submit for a team event.')
    const existing = db
      .prepare('SELECT id FROM projects WHERE programme_id=? AND user_id=?')
      .get(programmeId, account.id)
    if (existing && db.prepare('SELECT 1 FROM scores WHERE project_id=?').get(existing.id))
      throw new HttpError(409, 'A judged submission cannot be changed.')
    const projectId = existing ? String(existing.id) : id()
    transaction(db, () => {
      db.prepare(
        'INSERT INTO projects(id,programme_id,user_id,team_id,title,description,url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(programme_id,user_id) DO UPDATE SET title=excluded.title,description=excluded.description,url=excluded.url',
      ).run(
        projectId,
        programmeId,
        account.id,
        team?.id ?? null,
        input.title,
        input.description,
        input.url,
      )
      audit(db, account.id, 'project.submitted', projectId)
    })
    res.status(201).json({ id: projectId })
  })
  app.post('/api/staff/programmes/:id/projects/:projectId/score', (req, res) => {
    const programmeId = param(req)
    const account = programmes.staff(req, programmeId, ['judge'])
    const p = programmes.get(programmeId)
    if (p.event.resultsPublished)
      throw new HttpError(409, 'Unpublish results before changing scores.')
    const projectId = param(req, 'projectId')
    const project = db
      .prepare('SELECT * FROM projects WHERE id=? AND programme_id=?')
      .get(projectId, programmeId)
    if (!project) throw new HttpError(404, 'Project not found.')
    if (
      project.user_id === account.id ||
      db
        .prepare('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?')
        .get(project.team_id, account.id)
    )
      throw new HttpError(403, 'You cannot judge your own project or team.')
    const input = z
      .object({ values: z.array(z.number().min(0)).min(1), feedback: text(4000) })
      .parse(req.body)
    if (
      input.values.length !== p.event.criteria.length ||
      input.values.some((value, i) => value > p.event.criteria[i].maxScore)
    )
      throw new HttpError(400, 'Scores must match the configured rubric and maximum scores.')
    transaction(db, () => {
      db.prepare(
        'INSERT INTO scores(project_id,judge_id,data) VALUES(?,?,?) ON CONFLICT(project_id,judge_id) DO UPDATE SET data=excluded.data',
      ).run(projectId, account.id, JSON.stringify(input))
      audit(db, account.id, 'project.scored', projectId)
    })
    res.json({ ok: true })
  })
  app.patch('/api/staff/programmes/:id/projects/:projectId/winner', (req, res) => {
    const account = managers(req)
    const programmeId = param(req)
    const { winner } = z.object({ winner: z.boolean() }).parse(req.body)
    const projectId = param(req, 'projectId')
    transaction(db, () => {
      const result = db
        .prepare('UPDATE projects SET winner=? WHERE id=? AND programme_id=?')
        .run(Number(winner), projectId, programmeId)
      if (!result.changes) throw new HttpError(404, 'Project not found.')
      audit(db, account.id, 'project.winner-updated', projectId)
    })
    res.json({ ok: true })
  })
  installOperations(app, db, auth, programmes)
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')))
  if (options.staticDirectory) {
    app.use(
      express.static(resolve(options.staticDirectory), {
        index: false,
        maxAge: options.production ? '1h' : 0,
      }),
    )
    app.get('/{*path}', (_req, res) =>
      res.sendFile(resolve(options.staticDirectory!, 'index.html')),
    )
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Please check the highlighted fields.',
        fields: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON body.' })
      return
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      res.status(413).json({ error: 'This submission is too large.' })
      return
    }
    console.error('Unhandled API error:', error instanceof Error ? error.message : 'Unknown error')
    res
      .status(500)
      .json({ error: 'The request could not be completed. Please try again or contact the team.' })
  })
  return app
}
