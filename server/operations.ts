import type { Express, Request } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { applicationSchema, publicFormSchema, type User } from '../shared/domain.ts'
import {
  agreementSchema,
  awardSchema,
  concernActionSchema,
  concernSchema,
  consentSchema,
  consentVerificationSchema,
  contributionSchema,
  financialActionSchema,
  guardianSchema,
  indicatorSchema,
  locationSchema,
  observationSchema,
  operationsSchema,
  providerSchema,
  screeningSchema,
  sourceSchema,
  type ConsentCase,
  type FundingAward,
  type ImpactRow,
} from '../shared/operations.ts'
import { authentication, HttpError } from './auth.ts'
import { audit, id, notify, transaction, type Database } from './db.ts'
import type { programmeService } from './programmes.ts'
import { consentValid, participationReady, policy, screeningReady } from './operational-rules.ts'
import { csvCell } from './exports.ts'

const key = (req: Request, name = 'id') => z.uuid().parse(req.params[name])
const today = () => new Date().toISOString().slice(0, 10)
const future = (value: string) => Date.parse(value) > Date.now()

export function installOperations(
  app: Express,
  db: Database,
  auth: ReturnType<typeof authentication>,
  programmes: ReturnType<typeof programmeService>,
) {
  const intakeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => auth.user(req).id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error:
        'Too many safeguarding submissions from this account. Wait 15 minutes; use the approved urgent escalation procedure if necessary.',
    },
  })
  const managers = (req: Request) => auth.requireRole(req, ['admin', 'manager'])
  const finance = (req: Request) => auth.requireRole(req, ['admin', 'finance'])
  const safety = (req: Request) => {
    const user = auth.requireRole(req, ['admin', 'manager', 'instructor'])
    if (!user.permissions?.includes('safeguarding'))
      throw new HttpError(403, 'An explicit safeguarding permission is required.')
    return user
  }
  const hasSafety = (user: User) =>
    ['admin', 'manager', 'instructor'].includes(user.role) &&
    !!user.permissions?.includes('safeguarding')
  const canFinance = (user: User) => ['admin', 'finance'].includes(user.role)
  const change = <T>(user: User, action: string, resource: string, work: () => T) =>
    transaction(db, () => {
      const result = work()
      audit(db, user.id, action, resource)
      return result
    })
  function history(
    user: User,
    kind: 'policy' | 'profile' | 'screening' | 'agreement',
    resource: string,
    previous: unknown,
    next: unknown,
  ) {
    db.prepare(
      'INSERT INTO operational_history(kind,resource_id,provider_id,programme_id,previous_data,next_data,changed_by) VALUES(?,?,?,?,?,?,?)',
    ).run(
      kind,
      resource,
      kind === 'policy' ? null : resource,
      kind === 'policy' ? resource : null,
      previous == null ? null : JSON.stringify(previous),
      JSON.stringify(next),
      user.id,
    )
  }
  app.get('/api/operations/history/:kind/:id', (req, res) => {
    const kind = z
      .enum(['policy', 'profile', 'screening', 'agreement', 'award', 'consent'])
      .parse(req.params.kind)
    const user = ['screening', 'consent'].includes(kind)
      ? safety(req)
      : ['agreement', 'award'].includes(kind)
        ? finance(req)
        : managers(req)
    audit(db, user.id, `operations.${kind}-history-read`, key(req))
    if (kind === 'consent') {
      application(key(req))
      res.json({
        history: db
          .prepare('SELECT * FROM consents WHERE application_id=? ORDER BY sequence DESC')
          .all(key(req))
          .map((c) => ({
            previous_data: null,
            next_data: JSON.stringify({
              purpose: c.purpose,
              granted: !!c.granted,
              noticeVersion: c.notice_version,
              declaredBy: c.declared_by,
              declaredAt: c.declared_at,
              verifiedBy: c.verified_by,
              verifiedAt: c.verified_at,
              validUntil: c.valid_until,
              evidenceReference: c.evidence_reference,
            }),
            changed_by: c.verified_by ?? c.declared_by,
            created_at: c.verified_at ?? c.declared_at,
          })),
      })
      return
    }
    res.json({
      history:
        kind === 'award'
          ? db
              .prepare(
                'SELECT previous_data,next_data,changed_by,created_at FROM funding_award_history WHERE award_id=? ORDER BY sequence DESC',
              )
              .all(key(req))
          : db
              .prepare(
                'SELECT previous_data,next_data,changed_by,created_at FROM operational_history WHERE kind=? AND resource_id=? ORDER BY sequence DESC',
              )
              .all(kind, key(req)),
    })
  })
  function application(applicationId: string) {
    const row = db.prepare('SELECT * FROM applications WHERE id=?').get(applicationId)
    if (!row) throw new HttpError(404, 'Application not found.')
    return row
  }
  function ownApplication(req: Request) {
    const user = auth.user(req)
    const row = application(key(req))
    if (row.user_id !== user.id) throw new HttpError(403, 'This application is not yours.')
    if (applicationSchema.parse(JSON.parse(String(row.data))).ageBand === '18+')
      throw new HttpError(409, 'Guardian records apply to child participation only.')
    return { user, row }
  }
  function consentCase(applicationId: string): ConsentCase {
    const row = application(applicationId)
    const input = applicationSchema.parse(JSON.parse(String(row.data)))
    const guardian = db
      .prepare('SELECT * FROM guardian_details WHERE application_id=?')
      .get(applicationId)
    const config = policy(db, String(row.programme_id))
    return {
      applicationId,
      participantName: input.participantName,
      ageBand: input.ageBand,
      programmeId: String(row.programme_id),
      title: programmes.get(String(row.programme_id)).title,
      guardianName: input.guardianName,
      guardianEmail: input.guardianEmail,
      guardian: guardian
        ? {
            relationship: guardianSchema.shape.relationship.parse(guardian.relationship),
            emergencyName: String(guardian.emergency_name),
            emergencyPhone: String(guardian.emergency_phone),
          }
        : null,
      policy: {
        noticeVersion: config.noticeVersion,
        participationNotice: config.participationNotice,
        communicationsNotice: config.communicationsNotice,
        mediaNotice: config.mediaNotice,
        emergencyRequired: config.emergencyRequired,
      },
      consents: db
        .prepare(
          'SELECT c.id,c.purpose,c.granted,c.notice_version,c.declared_at,c.verified_at,c.valid_until FROM consents c WHERE application_id=? AND sequence=(SELECT max(sequence) FROM consents latest WHERE latest.application_id=c.application_id AND latest.purpose=c.purpose) ORDER BY sequence',
        )
        .all(applicationId)
        .map((c) => ({
          id: String(c.id),
          purpose: String(c.purpose),
          granted: Number(c.granted),
          notice_version: String(c.notice_version),
          declared_at: String(c.declared_at),
          verified_at: c.verified_at ? String(c.verified_at) : null,
          valid_until: c.valid_until ? String(c.valid_until) : null,
        })),
      participationReady: participationReady(db, applicationId),
    }
  }
  app.get('/api/my/consents', (req, res) => {
    const user = auth.user(req)
    res.json({
      cases: programmes
        .applications(undefined, user.id)
        .filter((a) => a.ageBand !== '18+')
        .map((a) => consentCase(a.id)),
    })
  })
  app.put('/api/my/applications/:id/guardian', (req, res) => {
    const { user, row } = ownApplication(req)
    const input = guardianSchema.parse(req.body)
    const config = policy(db, String(row.programme_id))
    if (!config.emergencyRequired && (input.emergencyName || input.emergencyPhone))
      throw new HttpError(
        400,
        'This programme does not require emergency contacts. Do not collect unnecessary information.',
      )
    if (
      !!input.emergencyName !== !!input.emergencyPhone ||
      (config.emergencyRequired && (!input.emergencyName || !input.emergencyPhone))
    )
      throw new HttpError(400, 'Provide both emergency contact fields when required.')
    change(user, 'guardian.updated', String(row.id), () => {
      db.prepare(
        'INSERT INTO guardian_details(application_id,relationship,emergency_name,emergency_phone) VALUES(?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET relationship=excluded.relationship,emergency_name=excluded.emergency_name,emergency_phone=excluded.emergency_phone',
      ).run(row.id, input.relationship, input.emergencyName, input.emergencyPhone)
      // Changing the claimed authority invalidates earlier verification; history remains intact.
      for (const consent of consentCase(String(row.id)).consents)
        if (consent.granted)
          db.prepare(
            'INSERT INTO consents(id,application_id,purpose,granted,notice_version,declared_by) VALUES(?,?,?,?,?,?)',
          ).run(id(), row.id, consent.purpose, 1, config.noticeVersion, user.id)
    })
    res.json({ ok: true })
  })
  app.post('/api/my/applications/:id/consents', (req, res) => {
    const { user, row } = ownApplication(req)
    const input = consentSchema.parse(req.body)
    const config = policy(db, String(row.programme_id))
    if (input.granted && input.noticeVersion !== config.noticeVersion)
      throw new HttpError(
        409,
        'The consent notice changed. Read the current notice before declaring permission.',
      )
    change(user, `consent.${input.granted ? 'declared' : 'withdrawn'}`, String(row.id), () => {
      db.prepare(
        'INSERT INTO consents(id,application_id,purpose,granted,notice_version,declared_by) VALUES(?,?,?,?,?,?)',
      ).run(id(), row.id, input.purpose, Number(input.granted), config.noticeVersion, user.id)
    })
    res.status(201).json({
      message: input.granted
        ? 'Declaration recorded, not verified. An authorised officer must check guardian authority and evidence.'
        : 'Permission withdrawn. Participation permission withdrawal immediately blocks learning and attendance.',
    })
  })
  app.get('/api/operations/consents', (req, res) => {
    const user = safety(req)
    audit(db, user.id, 'safeguarding.consent-list-read', 'consents')
    res.json({
      cases: programmes
        .applications()
        .filter((a) => a.ageBand !== '18+')
        .map((a) => consentCase(a.id)),
    })
  })
  app.post('/api/operations/consents/:id/verify', (req, res) => {
    const user = safety(req)
    const input = consentVerificationSchema.parse(req.body)
    const consent = db.prepare('SELECT * FROM consents WHERE id=?').get(key(req))
    if (!consent) throw new HttpError(404, 'Consent declaration not found.')
    const a = application(String(consent.application_id))
    const config = policy(db, String(a.programme_id))
    const latest = db
      .prepare(
        'SELECT id FROM consents WHERE application_id=? AND purpose=? ORDER BY sequence DESC LIMIT 1',
      )
      .get(a.id, consent.purpose)
    if (user.id === a.user_id)
      throw new HttpError(403, 'A different officer must verify your own guardian declaration.')
    if (
      latest?.id !== consent.id ||
      !consent.granted ||
      consent.notice_version !== config.noticeVersion ||
      consent.verified_at
    )
      throw new HttpError(
        409,
        'Only the current, granted and unverified declaration can be verified.',
      )
    const guardian = db.prepare('SELECT * FROM guardian_details WHERE application_id=?').get(a.id)
    if (
      !guardian ||
      (config.emergencyRequired && (!guardian.emergency_name || !guardian.emergency_phone))
    )
      throw new HttpError(
        409,
        'The guardian must record their relationship and required emergency contact first.',
      )
    if (!future(input.validUntil) || Date.parse(input.validUntil) > Date.now() + 366 * 86400000)
      throw new HttpError(400, 'Choose a future review expiry within one year.')
    change(user, 'safeguarding.consent-verified', String(consent.id), () => {
      db.prepare(
        'UPDATE consents SET verified_by=?,verified_at=CURRENT_TIMESTAMP,valid_until=?,evidence_reference=? WHERE id=?',
      ).run(user.id, input.validUntil, input.evidenceReference, consent.id)
      notify(
        db,
        String(a.user_id),
        `${programmes.get(String(a.programme_id)).title}: ${String(consent.purpose)} permission reviewed. Application approval is still separate.`,
      )
    })
    res.json({ ok: true })
  })

  app.post('/api/safeguarding/concerns', intakeLimit, (req, res) => {
    const user = auth.user(req)
    const input = concernSchema.parse(req.body)
    if (input.programmeId) programmes.get(input.programmeId)
    const concernId = id()
    change(user, 'safeguarding.concern-reported', concernId, () => {
      db.prepare(
        'INSERT INTO concerns(id,reporter_id,programme_id,subject,detail,priority,retain_until) VALUES(?,?,?,?,?,?,?)',
      ).run(
        concernId,
        user.id,
        input.programmeId,
        input.subject,
        input.detail,
        input.priority,
        new Date(Date.now() + 365 * 86400000).toISOString(),
      )
    })
    res.status(201).json({
      id: concernId,
      message:
        'Restricted report recorded. This is not an emergency service and does not send an external alert. Follow the published escalation instructions now if anyone is at risk.',
    })
  })
  app.get('/api/operations/concerns', (req, res) => {
    const user = safety(req)
    audit(db, user.id, 'safeguarding.concerns-read', 'concerns')
    res.json({
      concerns: db
        .prepare('SELECT * FROM concerns ORDER BY created_at DESC,id')
        .all()
        .map((c) => ({
          ...c,
          actions: db
            .prepare(
              'SELECT status,note,created_at FROM concern_actions WHERE concern_id=? ORDER BY sequence',
            )
            .all(c.id),
        })),
    })
  })
  app.post('/api/operations/concerns/:id/actions', (req, res) => {
    const user = safety(req)
    const concernId = key(req)
    const input = concernActionSchema.parse(req.body)
    if (!db.prepare('SELECT 1 FROM concerns WHERE id=?').get(concernId))
      throw new HttpError(404, 'Concern not found.')
    if (
      input.assignedTo &&
      !db
        .prepare(
          "SELECT 1 FROM permissions p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.permission='safeguarding' AND u.role IN ('admin','manager','instructor')",
        )
        .get(input.assignedTo)
    )
      throw new HttpError(400, 'Assign a currently authorised safeguarding officer.')
    if (!['resolved', 'closed'].includes(input.status) && (!input.assignedTo || !input.reviewDue))
      throw new HttpError(400, 'Open concerns need an accountable officer and next review date.')
    change(user, 'safeguarding.concern-action', concernId, () => {
      db.prepare(
        'UPDATE concerns SET status=?,assigned_to=?,review_due=?,retain_until=?,legal_hold=? WHERE id=?',
      ).run(
        input.status,
        input.assignedTo,
        input.reviewDue,
        input.retainUntil,
        Number(input.legalHold),
        concernId,
      )
      db.prepare('INSERT INTO concern_actions(concern_id,user_id,status,note) VALUES(?,?,?,?)').run(
        concernId,
        user.id,
        input.status,
        input.note,
      )
    })
    res.json({ ok: true })
  })
  app.delete('/api/operations/concerns/:id', (req, res) => {
    const user = safety(req)
    const concernId = key(req)
    z.object({ reason: z.literal('approved-retention-disposal') }).parse(req.body)
    const c = db.prepare('SELECT * FROM concerns WHERE id=?').get(concernId)
    if (!c) throw new HttpError(404, 'Concern not found.')
    if (c.status !== 'closed' || c.legal_hold || future(String(c.retain_until)))
      throw new HttpError(
        409,
        'Only closed records past their approved retention date and without a legal hold may be disposed.',
      )
    change(user, 'safeguarding.retention-disposal', concernId, () =>
      db.prepare('DELETE FROM concerns WHERE id=?').run(concernId),
    )
    res.json({ ok: true })
  })

  app.get('/api/operations/directory', (req, res) => {
    const user = auth.user(req)
    if (!['admin', 'manager', 'finance'].includes(user.role) && !hasSafety(user))
      throw new HttpError(403, 'Staff permission required.')
    res.json({
      users: db
        .prepare(
          "SELECT id,name,role FROM users WHERE role IN ('admin','manager','finance','instructor') ORDER BY name",
        )
        .all()
        .map((u) => ({
          ...u,
          safeguarding: !!db
            .prepare("SELECT 1 FROM permissions WHERE user_id=? AND permission='safeguarding'")
            .get(u.id),
        })),
      programmes: db
        .prepare('SELECT id FROM programmes')
        .all()
        .map((p) => ({
          id: p.id,
          title: programmes.get(String(p.id)).title,
        })),
    })
  })
  app.get('/api/operations/locations', (req, res) => {
    managers(req)
    res.json({
      locations: db
        .prepare('SELECT * FROM locations ORDER BY id')
        .all()
        .map((r) => ({ id: r.id, ...locationSchema.parse(JSON.parse(String(r.data))) })),
    })
  })
  app.post('/api/operations/locations', (req, res) => {
    const user = managers(req)
    const input = locationSchema.parse(req.body)
    const locationId = id()
    change(user, 'location.created', locationId, () =>
      db
        .prepare('INSERT INTO locations(id,data,created_by) VALUES(?,?,?)')
        .run(locationId, JSON.stringify(input), user.id),
    )
    res.status(201).json({ id: locationId })
  })
  app.put('/api/operations/locations/:id', (req, res) => {
    const user = managers(req)
    const input = locationSchema.parse(req.body)
    const locationId = key(req)
    if (!db.prepare('SELECT 1 FROM locations WHERE id=?').get(locationId))
      throw new HttpError(404, 'Location not found.')
    change(user, 'location.updated', locationId, () =>
      db.prepare('UPDATE locations SET data=? WHERE id=?').run(JSON.stringify(input), locationId),
    )
    res.json({ ok: true })
  })
  app.get('/api/operations/programmes/:id', (req, res) => {
    const programmeId = key(req)
    const user = programmes.staff(req, programmeId)
    const config = policy(db, programmeId)
    res.json({
      policy:
        user.role === 'instructor'
          ? {
              ...config,
              challenges: '',
              nextSteps: '',
              readiness: config.readiness.map((item) => ({ ...item, evidence: '' })),
            }
          : config,
    })
  })
  app.put('/api/operations/programmes/:id', (req, res) => {
    const user = managers(req)
    const programmeId = key(req)
    programmes.get(programmeId)
    const input = operationsSchema.parse(req.body)
    if (
      input.locationId &&
      !db
        .prepare("SELECT 1 FROM locations WHERE id=? AND json_extract(data,'$.active')=1")
        .get(input.locationId)
    )
      throw new HttpError(400, 'Select an active delivery location.')
    const previous = policy(db, programmeId)
    if (
      previous.noticeVersion === input.noticeVersion &&
      (previous.participationNotice !== input.participationNotice ||
        previous.communicationsNotice !== input.communicationsNotice ||
        previous.mediaNotice !== input.mediaNotice)
    )
      throw new HttpError(
        409,
        'Change the notice version when changing consent wording; previous verification must not carry over.',
      )
    if (
      previous.noticeVersion !== input.noticeVersion &&
      db
        .prepare(
          'SELECT 1 FROM consents c JOIN applications a ON a.id=c.application_id WHERE a.programme_id=? AND c.notice_version=?',
        )
        .get(programmeId, input.noticeVersion)
    )
      throw new HttpError(409, 'A previously used notice version cannot be reused.')
    change(user, 'programme.operations-updated', programmeId, () => {
      history(user, 'policy', programmeId, previous, input)
      db.prepare(
        'INSERT INTO programme_operations(programme_id,data) VALUES(?,?) ON CONFLICT(programme_id) DO UPDATE SET data=excluded.data',
      ).run(programmeId, JSON.stringify(input))
    })
    res.json({ ok: true })
  })

  function providerTarget(userId: string) {
    if (
      !db
        .prepare("SELECT 1 FROM users WHERE id=? AND role IN ('admin','manager','instructor')")
        .get(userId)
    )
      throw new HttpError(
        400,
        'Choose a current provider account. A volunteer application alone does not grant account privileges.',
      )
  }
  app.get('/api/operations/providers', (req, res) => {
    const user = auth.user(req)
    if (!['admin', 'manager', 'finance'].includes(user.role) && !hasSafety(user))
      throw new HttpError(403, 'Staff permission required.')
    res.json({
      providers: db
        .prepare(
          "SELECT id,name,role FROM users WHERE role IN ('admin','manager','instructor') ORDER BY name",
        )
        .all()
        .map((u) => {
          const read = (
            table: 'provider_profiles' | 'provider_screening' | 'provider_agreements',
          ) => db.prepare(`SELECT data FROM ${table} WHERE user_id=?`).get(u.id)?.data
          const profile = read('provider_profiles')
          const screening = hasSafety(user) ? read('provider_screening') : null
          const agreement = canFinance(user) ? read('provider_agreements') : null
          return {
            ...u,
            eligible: screeningReady(db, String(u.id)),
            profile:
              user.role === 'finance'
                ? null
                : profile
                  ? providerSchema.parse(JSON.parse(String(profile)))
                  : null,
            screening: screening ? screeningSchema.parse(JSON.parse(String(screening))) : undefined,
            agreement: agreement ? agreementSchema.parse(JSON.parse(String(agreement))) : undefined,
          }
        }),
    })
  })
  app.put('/api/operations/providers/:id/profile', (req, res) => {
    const user = managers(req)
    const userId = key(req)
    providerTarget(userId)
    const input = providerSchema.parse(req.body)
    if (
      input.applicationId &&
      !db
        .prepare("SELECT 1 FROM enquiries WHERE id=? AND kind='volunteer'")
        .get(input.applicationId)
    )
      throw new HttpError(400, 'Select an existing volunteer application reference.')
    change(user, 'provider.lifecycle-updated', userId, () => {
      const previous = db.prepare('SELECT data FROM provider_profiles WHERE user_id=?').get(userId)
      history(user, 'profile', userId, previous ? JSON.parse(String(previous.data)) : null, input)
      db.prepare(
        'INSERT INTO provider_profiles(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
      ).run(userId, JSON.stringify(input))
      if (input.stage === 'active' && !screeningReady(db, userId))
        throw new HttpError(
          409,
          'Complete orientation and current officer-reviewed screening/training before activation.',
        )
    })
    res.json({ ok: true })
  })
  app.put('/api/operations/providers/:id/screening', (req, res) => {
    const user = safety(req)
    const userId = key(req)
    providerTarget(userId)
    const input = screeningSchema.parse(req.body)
    if (user.id === userId)
      throw new HttpError(403, 'Another authorised officer must review your screening.')
    if (
      (input.trainingDate && input.trainingDate > today()) ||
      (input.status === 'cleared' && (!input.validUntil || !future(input.validUntil)))
    )
      throw new HttpError(
        400,
        'Training must already be completed and clearance must have a future expiry.',
      )
    change(user, 'safeguarding.provider-screening-reviewed', userId, () => {
      const previous = db.prepare('SELECT data FROM provider_screening WHERE user_id=?').get(userId)
      history(user, 'screening', userId, previous ? JSON.parse(String(previous.data)) : null, input)
      db.prepare(
        'INSERT INTO provider_screening(user_id,data,reviewed_by) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,reviewed_by=excluded.reviewed_by',
      ).run(userId, JSON.stringify(input), user.id)
    })
    res.json({ ok: true })
  })
  app.put('/api/operations/providers/:id/agreement', (req, res) => {
    const user = finance(req)
    const userId = key(req)
    providerTarget(userId)
    const input = agreementSchema.parse(req.body)
    change(user, 'provider.agreement-recorded', userId, () => {
      const previous = db
        .prepare('SELECT data FROM provider_agreements WHERE user_id=?')
        .get(userId)
      history(user, 'agreement', userId, previous ? JSON.parse(String(previous.data)) : null, input)
      db.prepare(
        'INSERT INTO provider_agreements(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
      ).run(userId, JSON.stringify(input))
    })
    res.json({ ok: true })
  })
  app.get('/api/operations/contributions', (req, res) => {
    const user = auth.user(req)
    const all = ['admin', 'manager'].includes(user.role)
    res.json({
      contributions: db
        .prepare(
          `SELECT c.*,u.name FROM contributions c JOIN users u ON u.id=c.user_id ${all ? '' : 'WHERE c.user_id=?'} ORDER BY created_at DESC`,
        )
        .all(...(all ? [] : [user.id]))
        .map((c) => ({
          id: c.id,
          name: c.name,
          ...contributionSchema.parse(JSON.parse(String(c.data))),
          verified: !!c.verified_by,
          title: programmes.get(String(c.programme_id)).title,
        })),
    })
  })
  app.post('/api/operations/contributions', (req, res) => {
    const user = auth.user(req)
    const input = contributionSchema.parse(req.body)
    programmes.staff(req, input.programmeId)
    if (
      (!['admin', 'manager'].includes(user.role) && input.userId !== user.id) ||
      !db
        .prepare('SELECT 1 FROM programme_staff WHERE programme_id=? AND user_id=?')
        .get(input.programmeId, input.userId)
    )
      throw new HttpError(
        403,
        'Record only an assigned provider’s contribution; providers may record their own only.',
      )
    if (input.date > today())
      throw new HttpError(400, 'Contributions cannot be recorded in the future.')
    const dailyMinutes = Number(
      db
        .prepare(
          "SELECT coalesce(sum(json_extract(data,'$.minutes')),0) AS n FROM contributions WHERE user_id=? AND json_extract(data,'$.date')=?",
        )
        .get(input.userId, input.date)?.n,
    )
    if (dailyMinutes + input.minutes > 1440)
      throw new HttpError(
        409,
        'Recorded contribution time cannot exceed 24 hours per person per day.',
      )
    if (
      db
        .prepare(
          "SELECT 1 FROM contributions WHERE user_id=? AND programme_id=? AND json_extract(data,'$.date')=? AND json_extract(data,'$.activity')=?",
        )
        .get(input.userId, input.programmeId, input.date, input.activity)
    )
      throw new HttpError(409, 'This contribution is already recorded.')
    const contributionId = id()
    change(user, 'provider.contribution-recorded', contributionId, () =>
      db
        .prepare(
          'INSERT INTO contributions(id,user_id,programme_id,data,recorded_by) VALUES(?,?,?,?,?)',
        )
        .run(contributionId, input.userId, input.programmeId, JSON.stringify(input), user.id),
    )
    res.status(201).json({ id: contributionId })
  })
  app.post('/api/operations/contributions/:id/verify', (req, res) => {
    const user = managers(req)
    const row = db.prepare('SELECT * FROM contributions WHERE id=?').get(key(req))
    if (!row) throw new HttpError(404, 'Contribution not found.')
    if (row.recorded_by === user.id || row.user_id === user.id)
      throw new HttpError(403, 'Another manager must verify your recorded contribution.')
    if (row.verified_by) throw new HttpError(409, 'Contribution already verified.')
    change(user, 'provider.contribution-verified', String(row.id), () =>
      db.prepare('UPDATE contributions SET verified_by=? WHERE id=?').run(user.id, row.id),
    )
    res.json({ ok: true })
  })

  function award(awardId: string): FundingAward {
    const row = db.prepare('SELECT * FROM funding_awards WHERE id=?').get(awardId)
    if (!row) throw new HttpError(404, 'Funding award not found.')
    const input = awardSchema.parse(JSON.parse(String(row.data)))
    const total = (kind: string) =>
      Number(
        db
          .prepare(
            "SELECT coalesce(sum(amount_minor),0) AS n FROM financial_actions WHERE award_id=? AND kind=? AND status='approved'",
          )
          .get(awardId, kind)?.n,
      )
    const receipt = input.donationId
      ? db.prepare('SELECT * FROM enquiries WHERE id=?').get(input.donationId)
      : null
    const received =
      receipt && ['verified', 'allocated'].includes(String(receipt.status))
        ? Number(receipt.received_minor)
        : 0
    return {
      ...input,
      id: awardId,
      receivedMinor: input.kind === 'in-kind' ? 0 : input.donationId ? received : total('receipt'),
      allocatedMinor: total('allocate') - total('release'),
      spentMinor: total('expenditure'),
    }
  }
  function programmeBalance(awardId: string, programmeId: string) {
    const amount = (kind: string) =>
      Number(
        db
          .prepare(
            "SELECT coalesce(sum(amount_minor),0) AS n FROM financial_actions WHERE award_id=? AND programme_id=? AND kind=? AND status='approved'",
          )
          .get(awardId, programmeId, kind)?.n,
      )
    return { allocated: amount('allocate') - amount('release'), spent: amount('expenditure') }
  }
  app.get('/api/operations/funding', (req, res) => {
    finance(req)
    res.json({
      sources: db
        .prepare('SELECT * FROM funding_sources ORDER BY id')
        .all()
        .map((s) => ({ id: s.id, ...sourceSchema.parse(JSON.parse(String(s.data))) })),
      awards: db
        .prepare('SELECT id FROM funding_awards ORDER BY reference')
        .all()
        .map((a) => award(String(a.id))),
      actions: db
        .prepare(
          'SELECT id,award_id AS awardId,programme_id AS programmeId,kind,amount_minor AS amountMinor,reference,reason,proposed_by,reviewed_by,created_at,reviewed_at,status FROM financial_actions ORDER BY sequence DESC',
        )
        .all(),
    })
  })
  app.post('/api/operations/funding/sources', (req, res) => {
    const user = finance(req)
    const input = sourceSchema.parse(req.body)
    if (
      db
        .prepare(
          "SELECT 1 FROM funding_sources WHERE lower(json_extract(data,'$.name'))=lower(?) AND json_extract(data,'$.kind')=?",
        )
        .get(input.name, input.kind)
    )
      throw new HttpError(409, 'A source with this name and type already exists. Reuse it.')
    const sourceId = id()
    change(user, 'funding.source-created', sourceId, () =>
      db
        .prepare('INSERT INTO funding_sources(id,data,created_by) VALUES(?,?,?)')
        .run(sourceId, JSON.stringify(input), user.id),
    )
    res.status(201).json({ id: sourceId })
  })
  app.post('/api/operations/funding/awards', (req, res) => {
    const user = finance(req)
    const input = awardSchema.parse(req.body)
    if (
      input.kind === 'grant' &&
      input.applicationStatus === 'awarded' &&
      (!input.awardDate || input.awardDate > today())
    )
      throw new HttpError(400, 'An awarded grant needs its actual award date, not a future date.')
    if (!db.prepare('SELECT 1 FROM funding_sources WHERE id=?').get(input.sourceId))
      throw new HttpError(400, 'Select an existing funding source.')
    if (
      db
        .prepare(
          'SELECT 1 FROM funding_awards WHERE reference=? OR (donation_id IS NOT NULL AND donation_id=?)',
        )
        .get(input.reference, input.donationId)
    )
      throw new HttpError(409, 'This award reference or donation is already registered.')
    for (const programmeId of input.restrictedProgrammes) programmes.get(programmeId)
    if (input.donationId) {
      const d = db
        .prepare("SELECT * FROM enquiries WHERE id=? AND kind='donation'")
        .get(input.donationId)
      if (!d || !['verified', 'allocated'].includes(String(d.status)))
        throw new HttpError(409, 'Link only an independently verified donation receipt.')
      const details = publicFormSchema.parse(JSON.parse(String(d.data)))
      if (
        d.receipt_currency !== input.currency ||
        (details.donationType === 'money') !== (input.kind !== 'in-kind')
      )
        throw new HttpError(409, 'The receipt currency and contribution type must match.')
    } else if (input.kind === 'donation')
      throw new HttpError(
        400,
        'Monetary donations must link the existing verified donation record, not duplicate it.',
      )
    if (input.kind === 'in-kind' && !input.inKindDescription)
      throw new HttpError(
        400,
        'Describe the items or service received. In-kind contributions are not cash.',
      )
    const awardId = id()
    change(user, 'funding.award-created', awardId, () => {
      db.prepare(
        'INSERT INTO funding_awards(id,source_id,donation_id,reference,data,created_by) VALUES(?,?,?,?,?,?)',
      ).run(
        awardId,
        input.sourceId,
        input.donationId,
        input.reference,
        JSON.stringify(input),
        user.id,
      )
    })
    res.status(201).json({ id: awardId })
  })
  app.patch('/api/operations/funding/awards/:id', (req, res) => {
    const user = finance(req)
    const current = award(key(req))
    const input = awardSchema
      .pick({ applicationStatus: true, awardDate: true, reportingDue: true, conditions: true })
      .parse(req.body)
    const updated = awardSchema.parse({ ...current, ...input })
    if (
      updated.kind === 'grant' &&
      updated.applicationStatus === 'awarded' &&
      (!updated.awardDate || updated.awardDate > today())
    )
      throw new HttpError(400, 'An awarded grant needs its actual award date.')
    if (
      current.kind === 'grant' &&
      current.receivedMinor > 0 &&
      updated.applicationStatus !== 'awarded'
    )
      throw new HttpError(409, 'A grant with received cash must retain its awarded status.')
    change(user, 'funding.grant-metadata-updated', current.id, () => {
      db.prepare(
        'INSERT INTO funding_award_history(award_id,previous_data,next_data,changed_by) VALUES(?,?,?,?)',
      ).run(
        current.id,
        JSON.stringify(awardSchema.parse(current)),
        JSON.stringify(updated),
        user.id,
      )
      db.prepare('UPDATE funding_awards SET data=? WHERE id=?').run(
        JSON.stringify(updated),
        current.id,
      )
    })
    res.json({ ok: true })
  })
  app.post('/api/operations/funding/actions', (req, res) => {
    const user = finance(req)
    const input = financialActionSchema.parse(req.body)
    const a = award(input.awardId)
    if (a.kind === 'in-kind')
      throw new HttpError(409, 'In-kind contributions are not a cash balance.')
    if (input.programmeId) programmes.get(input.programmeId)
    if (
      db.prepare('SELECT 1 FROM financial_actions WHERE reference=?').get(input.reference) ||
      db
        .prepare(
          "SELECT 1 FROM enquiries WHERE kind='donation' AND upper(trim(receipt_reference))=?",
        )
        .get(input.reference)
    )
      throw new HttpError(409, 'This transaction reference is already recorded.')
    const actionId = id()
    change(user, 'funding.action-proposed', actionId, () =>
      db
        .prepare(
          'INSERT INTO financial_actions(id,award_id,programme_id,kind,amount_minor,reference,reason,proposed_by) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          actionId,
          input.awardId,
          input.programmeId,
          input.kind,
          input.amountMinor,
          input.reference,
          input.reason,
          user.id,
        ),
    )
    res.status(201).json({ id: actionId, status: 'pending' })
  })
  app.post('/api/operations/funding/actions/:id/review', (req, res) => {
    const user = finance(req)
    if (!user.permissions?.includes('finance-approver'))
      throw new HttpError(403, 'Explicit finance-approver permission required.')
    const input = z.object({ approve: z.boolean() }).parse(req.body)
    change(user, `funding.action-${input.approve ? 'approved' : 'rejected'}`, key(req), () => {
      const action = db.prepare('SELECT * FROM financial_actions WHERE id=?').get(key(req))
      if (!action) throw new HttpError(404, 'Financial proposal not found.')
      if (action.proposed_by === user.id)
        throw new HttpError(403, 'A different authorised person must review this proposal.')
      if (action.status !== 'pending')
        throw new HttpError(409, 'This proposal was already reviewed.')
      const a = award(String(action.award_id))
      const amount = Number(action.amount_minor)
      if (input.approve) {
        if (action.kind === 'receipt') {
          if (a.kind === 'grant' && a.applicationStatus !== 'awarded')
            throw new HttpError(409, 'Confirm the grant award before verifying cash received.')
          if (a.receivedMinor + amount < a.allocatedMinor || a.receivedMinor + amount > 1000000000)
            throw new HttpError(
              409,
              'A receipt adjustment cannot underfund existing allocations or exceed the amount limit.',
            )
          if (a.donationId) {
            db.prepare('UPDATE enquiries SET received_minor=? WHERE id=?').run(
              a.receivedMinor + amount,
              a.donationId,
            )
            db.prepare(
              'INSERT INTO enquiry_history(id,enquiry_id,status,note,user_id) VALUES(?,?,?,?,?)',
            ).run(
              id(),
              a.donationId,
              'verified',
              `Approved funding receipt adjustment: ${String(action.id)}`,
              user.id,
            )
          }
        } else {
          const programmeId = String(action.programme_id)
          if (a.restrictedProgrammes.length && !a.restrictedProgrammes.includes(programmeId))
            throw new HttpError(409, 'Restricted funding cannot be used for this programme.')
          const balance = programmeBalance(a.id, programmeId)
          if (action.kind === 'allocate' && a.allocatedMinor + amount > a.receivedMinor)
            throw new HttpError(
              409,
              'Allocation exceeds verified, unallocated cash. Pledges are not spendable.',
            )
          if (action.kind === 'release' && amount > balance.allocated - balance.spent)
            throw new HttpError(409, 'Only unspent allocation can be released.')
          if (action.kind === 'expenditure' && balance.spent + amount > balance.allocated)
            throw new HttpError(409, 'Expenditure exceeds this programme’s approved allocation.')
        }
      }
      db.prepare(
        'UPDATE financial_actions SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?',
      ).run(input.approve ? 'approved' : 'rejected', user.id, action.id)
    })
    res.json({ ok: true })
  })
  app.get('/api/operations/funding/export', (req, res) => {
    const user = finance(req)
    audit(db, user.id, 'funding.reconciliation-export', 'funding')
    const rows = db
      .prepare(
        'SELECT a.*,f.reference AS award_reference FROM financial_actions a JOIN funding_awards f ON f.id=a.award_id ORDER BY sequence',
      )
      .all()
    const headers = [
      'award',
      'currency',
      'programme',
      'kind',
      'amountMinor',
      'reference',
      'status',
      'proposedBy',
      'reviewedBy',
      'reason',
    ]
    res
      .type('text/csv')
      .attachment('funding-reconciliation.csv')
      .send(
        [
          headers.map(csvCell).join(','),
          ...rows.map((r) =>
            [
              r.award_reference,
              award(String(r.award_id)).currency,
              r.programme_id,
              r.kind,
              r.amount_minor,
              r.reference,
              r.status,
              r.proposed_by,
              r.reviewed_by,
              r.reason,
            ]
              .map(csvCell)
              .join(','),
          ),
        ].join('\r\n'),
      )
  })

  app.get('/api/operations/programmes/:id/indicators', (req, res) => {
    const programmeId = key(req)
    programmes.staff(req, programmeId)
    res.json({
      indicators: db
        .prepare('SELECT * FROM impact_indicators WHERE programme_id=?')
        .all(programmeId)
        .map((r) => ({
          id: r.id,
          ...indicatorSchema.parse(JSON.parse(String(r.data))),
          observations: db
            .prepare(
              'SELECT * FROM impact_observations WHERE indicator_id=? ORDER BY sequence DESC',
            )
            .all(r.id)
            .map((o) => ({
              id: o.id,
              ...observationSchema.parse(JSON.parse(String(o.data))),
              verified: !!o.verified_by,
            })),
        })),
    })
  })
  app.post('/api/operations/programmes/:id/indicators', (req, res) => {
    const user = managers(req)
    const programmeId = key(req)
    programmes.get(programmeId)
    const input = indicatorSchema.parse(req.body)
    const indicatorId = id()
    change(user, 'impact.indicator-created', indicatorId, () =>
      db
        .prepare('INSERT INTO impact_indicators(id,programme_id,data) VALUES(?,?,?)')
        .run(indicatorId, programmeId, JSON.stringify(input)),
    )
    res.status(201).json({ id: indicatorId })
  })
  app.post('/api/operations/indicators/:id/observations', (req, res) => {
    const indicator = db.prepare('SELECT * FROM impact_indicators WHERE id=?').get(key(req))
    if (!indicator) throw new HttpError(404, 'Indicator not found.')
    const user = programmes.staff(req, String(indicator.programme_id))
    const input = observationSchema.parse(req.body)
    if (input.observedAt > today())
      throw new HttpError(400, 'Record observations only after they happen.')
    const observationId = id()
    change(user, 'impact.observation-recorded', observationId, () =>
      db
        .prepare(
          'INSERT INTO impact_observations(id,indicator_id,data,recorded_by) VALUES(?,?,?,?)',
        )
        .run(observationId, indicator.id, JSON.stringify(input), user.id),
    )
    res.status(201).json({ id: observationId })
  })
  app.post('/api/operations/observations/:id/verify', (req, res) => {
    const user = managers(req)
    const row = db.prepare('SELECT * FROM impact_observations WHERE id=?').get(key(req))
    if (!row) throw new HttpError(404, 'Observation not found.')
    if (row.recorded_by === user.id)
      throw new HttpError(403, 'Another manager must review the supporting evidence.')
    if (row.verified_by) throw new HttpError(409, 'Observation already verified.')
    change(user, 'impact.observation-verified', String(row.id), () =>
      db.prepare('UPDATE impact_observations SET verified_by=? WHERE id=?').run(user.id, row.id),
    )
    res.json({ ok: true })
  })
  function impact(req: Request) {
    const user = managers(req)
    const filter = z
      .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        programme: z.uuid().optional(),
        location: z.uuid().optional(),
        source: z.uuid().optional(),
        category: z
          .enum(['course', 'bootcamp', 'workshop', 'outreach', 'hackathon', 'competition'])
          .optional(),
        group: z.enum(['6-12', '13-17', '18+']).optional(),
      })
      .parse(req.query)
    if (filter.from && filter.to && filter.from > filter.to)
      throw new HttpError(400, 'The report end date must follow its start.')
    if (filter.source && !canFinance(user))
      throw new HttpError(403, 'Funding-source reports require financial permission.')
    const records: ImpactRow[] = []
    for (const row of db
      .prepare('SELECT id,created_at FROM programmes ORDER BY created_at DESC')
      .all()) {
      const programmeId = String(row.id)
      const p = programmes.get(programmeId)
      const config = policy(db, programmeId)
      const start = (p.startsAt ?? String(row.created_at)).slice(0, 10)
      const end = (p.endsAt ?? p.startsAt ?? String(row.created_at)).slice(0, 10)
      if (
        (filter.programme && programmeId !== filter.programme) ||
        (filter.location && config.locationId !== filter.location) ||
        (filter.category && p.type !== filter.category) ||
        (filter.from && end < filter.from) ||
        (filter.to && start > filter.to)
      )
        continue
      const awards = db
        .prepare(
          "SELECT DISTINCT a.id FROM funding_awards a JOIN financial_actions f ON f.award_id=a.id WHERE f.programme_id=? AND f.status='approved' AND f.kind='allocate'",
        )
        .all(programmeId)
        .map((a) => award(String(a.id)))
        .filter((a) => !filter.source || a.sourceId === filter.source)
      if (filter.source && !awards.length) continue
      const allApplications = programmes.applications(programmeId)
      const applications = allApplications.filter(
        (a) => !filter.group || a.ageBand === filter.group,
      )
      const approved = applications.filter((a) => a.status === 'approved')
      const approvedIds = new Set(approved.map((a) => a.userId))
      // Suppress the whole small cohort, not just individual cells; avoid revealing complements.
      const rareAgeGroup = ['6-12', '13-17', '18+'].some((band) => {
        const n = allApplications.filter((a) => a.ageBand === band).length
        return n > 0 && n < 10
      })
      const suppressed =
        applications.length < 5 || approved.length < 5 || (filter.group && rareAgeGroup)
      const safe = (value: number) =>
        suppressed ||
        (value > 0 && value < 5) ||
        (value < approved.length && approved.length - value < 5)
          ? null
          : value
      const lessons = db
        .prepare('SELECT id FROM lessons WHERE programme_id=? AND published=1')
        .all(programmeId)
      const completed = lessons.length
        ? approved.filter((a) =>
            lessons.every(
              (l) =>
                !!db
                  .prepare('SELECT 1 FROM progress WHERE lesson_id=? AND user_id=?')
                  .get(l.id, a.userId),
            ),
          ).length
        : 0
      const attendance = db
        .prepare(
          "SELECT DISTINCT a.user_id FROM attendance a JOIN scheduled_sessions s ON s.id=a.session_id WHERE s.programme_id=? AND a.status='present'",
        )
        .all(programmeId)
        .filter((a) => approvedIds.has(String(a.user_id))).length
      const projects = db
        .prepare('SELECT user_id FROM projects WHERE programme_id=?')
        .all(programmeId)
        .filter((a) => approvedIds.has(String(a.user_id))).length
      const location = config.locationId
        ? db.prepare('SELECT data FROM locations WHERE id=?').get(config.locationId)
        : null
      const currencies = [
        ...new Set([...awards.map((a) => a.currency), ...p.funding.map((f) => f.currency)]),
      ]
      records.push({
        programmeId,
        title: p.title,
        overview: p.summary,
        category: p.type,
        period: `${start} to ${end}`,
        location: location
          ? locationSchema.parse(JSON.parse(String(location.data))).name
          : p.location || p.delivery,
        planned: config.participantTarget,
        applications: safe(applications.length),
        approvedPlaces: safe(approved.length),
        attendedPlaces: safe(attendance),
        lessonCompletions: safe(completed),
        projects: safe(projects),
        scholarships: safe(approved.filter((a) => a.mode === 'scholarship').length),
        objectives: config.objectives || p.objectives,
        beneficiaryGroup: config.beneficiaryGroup,
        challenges: config.challenges,
        nextSteps: config.nextSteps,
        indicators: filter.group
          ? []
          : db
              .prepare('SELECT * FROM impact_indicators WHERE programme_id=?')
              .all(programmeId)
              .map((i) => {
                const input = indicatorSchema.parse(JSON.parse(String(i.data)))
                const observation = db
                  .prepare(
                    "SELECT data FROM impact_observations WHERE indicator_id=? AND verified_by IS NOT NULL ORDER BY json_extract(data,'$.observedAt') DESC,sequence DESC LIMIT 1",
                  )
                  .get(i.id)
                return {
                  name: input.name,
                  kind: input.kind,
                  unit: input.unit,
                  target: input.target,
                  value: observation
                    ? safe(observationSchema.parse(JSON.parse(String(observation.data))).value)
                    : null,
                }
              }),
        funding: canFinance(user)
          ? currencies.map((currency) => {
              const balances = awards
                .filter((a) => a.currency === currency)
                .map((a) => programmeBalance(a.id, programmeId))
              return {
                currency,
                receivedMinor: awards
                  .filter((a) => a.currency === currency)
                  .reduce((n, a) => n + a.receivedMinor, 0),
                approvedBudgetMinor: p.funding
                  .filter((f) => f.currency === currency)
                  .reduce((n, f) => n + f.budgetMinor, 0),
                allocatedMinor: balances.reduce((n, b) => n + b.allocated, 0),
                spentMinor: balances.reduce((n, b) => n + b.spent, 0),
              }
            })
          : undefined,
      })
    }
    return {
      records,
      note: 'Date filters select overlapping programme delivery periods (undated programmes use creation date); metrics are lifetime recorded activity for those programmes. Places are not unique children. Lesson completion is self-recorded activity, not assessed mastery. Outcomes are separately reviewed evidence snapshots, not attendance or causal claims. Small cohorts/cells are suppressed (—); subgroup cells need at least ten applications and omit whole-programme indicators. No participant identity fields, images, contacts or evidence references are exported. Staff must review free-text narrative for personal information before sharing. Source filtering shows associated delivery, not exclusive donor attribution.',
    }
  }
  app.get('/api/operations/impact', (req, res) => res.json(impact(req)))
  app.get('/api/operations/impact/export', (req, res) => {
    const report = impact(req)
    audit(db, auth.user(req).id, 'impact.aggregate-export', 'impact')
    const headers = [
      'programme',
      'location',
      'period',
      'planned',
      'applications',
      'approvedPlaces',
      'attendedPlaces',
      'lessonCompletions',
      'projects',
      'scholarships',
      'objectives',
      'challenges',
      'nextSteps',
      'reviewedIndicatorsJson',
      'fundingByCurrencyJson',
      'methodology',
    ]
    res
      .type('text/csv')
      .attachment('programme-impact.csv')
      .send(
        [
          headers.map(csvCell).join(','),
          ...report.records.map((r) =>
            [
              r.title,
              r.location,
              r.period,
              r.planned,
              r.applications ?? 'suppressed',
              r.approvedPlaces ?? 'suppressed',
              r.attendedPlaces ?? 'suppressed',
              r.lessonCompletions ?? 'suppressed',
              r.projects ?? 'suppressed',
              r.scholarships ?? 'suppressed',
              r.objectives,
              r.challenges,
              r.nextSteps,
              JSON.stringify(r.indicators),
              JSON.stringify(r.funding ?? []),
              report.note,
            ]
              .map(csvCell)
              .join(','),
          ),
        ].join('\r\n'),
      )
  })
  app.get('/api/my/preferences', (req, res) => {
    const user = auth.user(req)
    const row = db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').get(user.id)
    res.json({
      programmeUpdates: row ? !!row.programme_updates : true,
      futureOpportunities: row ? !!row.future_opportunities : false,
    })
  })
  app.put('/api/my/preferences', (req, res) => {
    const user = auth.user(req)
    const input = z
      .object({ programmeUpdates: z.boolean(), futureOpportunities: z.boolean() })
      .parse(req.body)
    change(user, 'notifications.preferences-updated', user.id, () =>
      db
        .prepare(
          'INSERT INTO notification_preferences(user_id,programme_updates,future_opportunities) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET programme_updates=excluded.programme_updates,future_opportunities=excluded.future_opportunities',
        )
        .run(user.id, Number(input.programmeUpdates), Number(input.futureOpportunities)),
    )
    res.json({ ok: true })
  })
  app.get('/api/operations/programmes/:id/announcements', (req, res) => {
    const programmeId = key(req)
    programmes.staff(req, programmeId)
    res.json({
      announcements: db
        .prepare(
          'SELECT id,message,recipients,created_at FROM programme_announcements WHERE programme_id=? ORDER BY created_at DESC',
        )
        .all(programmeId),
    })
  })
  app.post('/api/operations/programmes/:id/announcements', (req, res) => {
    const programmeId = key(req)
    const user = programmes.staff(req, programmeId)
    const input = z.object({ message: z.string().trim().min(1).max(1500) }).parse(req.body)
    const announcementId = id()
    const recipients = change(user, 'programme.announcement-sent', announcementId, () => {
      const eligible = programmes.applications(programmeId).filter((a) => {
        const prefs = db
          .prepare('SELECT programme_updates FROM notification_preferences WHERE user_id=?')
          .get(a.userId)
        return (
          a.status === 'approved' &&
          programmes.enrolled(a.userId, programmeId) &&
          prefs?.programme_updates !== 0 &&
          (a.ageBand === '18+' ||
            consentValid(db, a.id, 'communications', policy(db, programmeId).noticeVersion))
        )
      })
      for (const a of eligible)
        notify(db, a.userId, `${programmes.get(programmeId).title}: ${input.message}`)
      db.prepare(
        'INSERT INTO programme_announcements(id,programme_id,message,sent_by,recipients) VALUES(?,?,?,?,?)',
      ).run(announcementId, programmeId, input.message, user.id, eligible.length)
      return eligible.length
    })
    res.status(201).json({
      recipients,
      message: `Sent to ${recipients} permitted adult/guardian account(s), in-app only. No emails or messages were sent externally.`,
    })
  })
}
