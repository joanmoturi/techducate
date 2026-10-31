import type { Request } from 'express'
import { z } from 'zod'
import {
  applicationSchema,
  fundingSchema,
  programmeSchema,
  type Programme,
  type ProgrammeInput,
  type User,
  type Application,
} from '../shared/domain.ts'
import { audit, id, notify, transaction, type Database } from './db.ts'
import { HttpError } from './auth.ts'
import {
  ensureProviderReady,
  ensureReadiness,
  missingReadiness,
  participationReady,
  screeningReady,
} from './operational-rules.ts'

export function programmeService(db: Database, getUser: (req: Request) => User) {
  function get(programmeId: string): Programme {
    const row = db.prepare('SELECT * FROM programmes WHERE id=?').get(programmeId)
    if (!row) throw new HttpError(404, 'Programme not found.')
    const data = programmeSchema.parse(JSON.parse(String(row.data)))
    const funding = db
      .prepare('SELECT * FROM funding WHERE programme_id=?')
      .all(programmeId)
      .map((f) => {
        const input = fundingSchema.parse(JSON.parse(String(f.data)))
        const count = Number(
          db
            .prepare(
              "SELECT count(*) AS n FROM applications WHERE programme_id=? AND mode=? AND status='approved'",
            )
            .get(programmeId, f.mode)?.n ?? 0,
        )
        return { ...input, approved: count, allocatedMinor: count * input.awardMinor }
      })
    return {
      ...data,
      id: programmeId,
      funding,
      capacity: funding.reduce((sum, f) => sum + f.capacity, 0),
      enrolled: funding.reduce((sum, f) => sum + (f.approved ?? 0), 0),
    }
  }
  function published(p: Programme) {
    return (
      !['draft', 'archived'].includes(p.status) &&
      (!p.publishAt || Date.parse(p.publishAt) <= Date.now())
    )
  }
  function publicView(p: Programme) {
    return {
      ...p,
      funding: p.funding.map((f) => ({
        mode: f.mode,
        capacity: f.capacity,
        feeMinor: f.feeMinor,
        currency: f.currency,
        approved: f.approved,
      })),
    }
  }
  function staff(
    req: Request,
    programmeId: string,
    allowed: string[] = ['instructor', 'mentor', 'facilitator'],
  ) {
    const account = getUser(req)
    if (['admin', 'manager'].includes(account.role)) return account
    if (account.role !== 'instructor')
      throw new HttpError(403, 'A current provider role and programme assignment are required.')
    const assignment = db
      .prepare('SELECT role FROM programme_staff WHERE programme_id=? AND user_id=?')
      .get(programmeId, account.id)
    if (!assignment || !allowed.includes(String(assignment.role)))
      throw new HttpError(403, 'You are not assigned to this programme in the required role.')
    ensureProviderReady(db, programmeId, account.id)
    return account
  }
  function enrolled(userId: string, programmeId: string) {
    const application = db
      .prepare(
        "SELECT * FROM applications WHERE programme_id=? AND user_id=? AND status='approved'",
      )
      .get(programmeId, userId)
    if (!application) return false
    const needsPayment = ['paid', 'subsidised'].includes(String(application.mode))
    return (
      participationReady(db, String(application.id)) &&
      !missingReadiness(db, programmeId, get(programmeId).status).length &&
      (!needsPayment || application.payment_status === 'verified')
    )
  }
  function contentAccess(req: Request, programmeId: string) {
    const account = getUser(req)
    const p = get(programmeId)
    if (['admin', 'manager'].includes(account.role)) return account
    const assigned = db
      .prepare(
        "SELECT role FROM programme_staff WHERE programme_id=? AND user_id=? AND role!='judge'",
      )
      .get(programmeId, account.id)
    if (assigned && account.role === 'instructor') {
      ensureProviderReady(db, programmeId, account.id)
      return account
    }
    if (!published(p) || !enrolled(account.id, programmeId))
      throw new HttpError(403, 'Approved participation is required to access this programme.')
    return account
  }
  function save(input: ProgrammeInput, account: User, programmeId: string = id()) {
    const existing = db.prepare('SELECT id FROM programmes WHERE id=?').get(programmeId)
    if (existing) get(programmeId)
    const previous = existing ? get(programmeId) : null
    const oldFunding = previous?.funding ?? []
    if (account.role !== 'admin') {
      // Routine programme managers cannot create or change financial records.
      for (const f of input.funding) {
        const old = oldFunding.find((previous) => previous.mode === f.mode)
        if (
          f.feeMinor !== (old?.feeMinor ?? 0) ||
          f.awardMinor !== (old?.awardMinor ?? 0) ||
          f.sponsor !== (old?.sponsor ?? '') ||
          f.budgetMinor !== (old?.budgetMinor ?? 0) ||
          f.receivedMinor !== (old?.receivedMinor ?? 0) ||
          f.committedMinor !== (old?.committedMinor ?? 0) ||
          f.currency !== (old?.currency ?? 'KES')
        )
          throw new HttpError(
            403,
            'An administrator must configure financial amounts and sponsors.',
          )
      }
      if (
        oldFunding.some(
          (old) =>
            !input.funding.some((f) => f.mode === old.mode) &&
            (old.budgetMinor || old.receivedMinor || old.committedMinor),
        )
      )
        throw new HttpError(403, 'Only administrators may remove funding records.')
    }
    transaction(db, () => {
      ensureReadiness(db, programmeId, input.status)
      const previousApplications = db
        .prepare('SELECT mode,status FROM applications WHERE programme_id=?')
        .all(programmeId)
      if (previous && previous.type !== input.type && previousApplications.length)
        throw new HttpError(409, 'Programme type cannot change after participants apply.')
      if (
        previous &&
        previous.event.teamsEnabled !== input.event.teamsEnabled &&
        (db.prepare('SELECT 1 FROM teams WHERE programme_id=?').get(programmeId) ||
          db.prepare('SELECT 1 FROM projects WHERE programme_id=?').get(programmeId))
      )
        throw new HttpError(
          409,
          'Team participation mode cannot change after teams or projects exist.',
        )
      if (
        db
          .prepare(
            'SELECT 1 FROM teams t WHERE t.programme_id=? AND (SELECT count(*) FROM team_members m WHERE m.team_id=t.id)>?',
          )
          .get(programmeId, input.event.teamSize)
      )
        throw new HttpError(409, 'Team size cannot be below current membership.')
      if (
        previous &&
        JSON.stringify(previous.event.criteria) !== JSON.stringify(input.event.criteria) &&
        db
          .prepare(
            'SELECT 1 FROM scores s JOIN projects p ON p.id=s.project_id WHERE p.programme_id=?',
          )
          .get(programmeId)
      )
        throw new HttpError(409, 'The judging rubric cannot change after scoring begins.')
      for (const old of previousApplications) {
        if (!input.funding.some((f) => f.mode === old.mode))
          throw new HttpError(409, 'Funding modes with applications cannot be removed.')
      }
      for (const funding of input.funding) {
        const count = previousApplications.filter(
          (a) => a.mode === funding.mode && a.status === 'approved',
        ).length
        if (funding.capacity < count)
          throw new HttpError(
            409,
            'Capacity cannot be lower than the number of approved participants.',
          )
        if (funding.awardMinor * count > funding.budgetMinor)
          throw new HttpError(409, 'The approved budget cannot be below allocated awards.')
        const previous = oldFunding.find((f) => f.mode === funding.mode)
        if (
          previous &&
          previousApplications.some((a) => a.mode === funding.mode) &&
          (previous.feeMinor !== funding.feeMinor || previous.currency !== funding.currency)
        )
          throw new HttpError(
            409,
            'Fees and currency cannot change after applications are submitted.',
          )
        if (count && previous && previous.awardMinor !== funding.awardMinor)
          throw new HttpError(409, 'Award amounts cannot change after places are approved.')
      }
      db.prepare(
        'INSERT INTO programmes(id,data,created_by) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      ).run(programmeId, JSON.stringify(input), account.id)
      for (const f of oldFunding)
        if (!input.funding.some((next) => next.mode === f.mode))
          db.prepare('DELETE FROM funding WHERE programme_id=? AND mode=?').run(programmeId, f.mode)
      for (const f of input.funding)
        db.prepare(
          'INSERT INTO funding(programme_id,mode,capacity,data) VALUES(?,?,?,?) ON CONFLICT(programme_id,mode) DO UPDATE SET capacity=excluded.capacity,data=excluded.data',
        ).run(programmeId, f.mode, f.capacity, JSON.stringify(f))
      audit(db, account.id, existing ? 'programme.updated' : 'programme.created', programmeId)
    })
    return get(programmeId)
  }
  function apply(req: Request, programmeId: string) {
    const account = getUser(req)
    const input = applicationSchema.parse(req.body)
    const p = get(programmeId)
    ensureReadiness(db, programmeId, p.status)
    if (
      !published(p) ||
      !['open', 'scheduled', 'full'].includes(p.status) ||
      (p.registrationOpens && Date.parse(p.registrationOpens) > Date.now()) ||
      (p.registrationCloses && Date.parse(p.registrationCloses) < Date.now())
    )
      throw new HttpError(409, 'Registration is not open for this programme.')
    if (
      (p.audience === 'children' && input.ageBand === '18+') ||
      (p.audience === 'adults' && input.ageBand !== '18+') ||
      (p.audience === 'youth' && input.ageBand === '6-12')
    )
      throw new HttpError(409, 'This programme is not available for the selected age group.')
    const funding = p.funding.find((f) => f.mode === input.mode)
    if (!funding || funding.capacity === 0)
      throw new HttpError(409, 'This participation option is not available.')
    if (
      db
        .prepare('SELECT id FROM applications WHERE programme_id=? AND user_id=?')
        .get(programmeId, account.id)
    )
      throw new HttpError(
        409,
        'This account has already applied. Contact the team to change your application.',
      )
    const full = (funding.approved ?? 0) >= funding.capacity || p.status === 'full'
    if (full && !p.waitlist) throw new HttpError(409, 'This programme is full.')
    const applicationId = id()
    transaction(db, () => {
      db.prepare(
        'INSERT INTO applications(id,programme_id,user_id,mode,data,status,payment_status) VALUES(?,?,?,?,?,?,?)',
      ).run(
        applicationId,
        programmeId,
        account.id,
        input.mode,
        JSON.stringify(input),
        full ? 'waitlisted' : 'pending',
        funding.feeMinor > 0 ? 'pending' : 'none',
      )
      notify(
        db,
        account.id,
        `${p.title}: application received${full ? ' on the waiting list' : ' for staff review'}. This is not an enrolment or scholarship award.`,
      )
      audit(db, account.id, 'application.created', applicationId)
    })
    return { id: applicationId, status: full ? 'waitlisted' : 'pending' }
  }
  function applications(programmeId?: string, userId?: string, financial = false): Application[] {
    const conditions = []
    const values = []
    if (programmeId) {
      conditions.push('a.programme_id=?')
      values.push(programmeId)
    }
    if (userId) {
      conditions.push('a.user_id=?')
      values.push(userId)
    }
    return db
      .prepare(
        `SELECT a.*,p.data AS programme_data,u.email FROM applications a JOIN programmes p ON p.id=a.programme_id JOIN users u ON u.id=a.user_id ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY a.created_at DESC`,
      )
      .all(...values)
      .map((row) => ({
        ...applicationSchema.parse(JSON.parse(String(row.data))),
        id: String(row.id),
        programmeId: String(row.programme_id),
        userId: String(row.user_id),
        status: String(row.status),
        paymentStatus: String(row.payment_status),
        paymentReference: financial ? String(row.payment_reference) : '',
        consentVerified: participationReady(db, String(row.id)),
        notes: userId ? '' : String(row.notes),
        title: programmeSchema.parse(JSON.parse(String(row.programme_data))).title,
        email: userId ? undefined : String(row.email),
        createdAt: String(row.created_at),
      }))
  }
  function review(req: Request, applicationId: string) {
    const account = getUser(req)
    if (!['admin', 'manager'].includes(account.role))
      throw new HttpError(403, 'Only programme staff can review applications.')
    const input = z
      .object({
        status: z.enum(['pending', 'approved', 'waitlisted', 'declined', 'withdrawn']),
        consentVerified: z.boolean(),
        notes: z.string().max(4000).default(''),
      })
      .parse(req.body)
    transaction(db, () => {
      const row = db.prepare('SELECT * FROM applications WHERE id=?').get(applicationId)
      if (!row) throw new HttpError(404, 'Application not found.')
      const details = applicationSchema.parse(JSON.parse(String(row.data)))
      const p = get(String(row.programme_id))
      const funding = p.funding.find((f) => f.mode === row.mode)
      if (!funding) throw new HttpError(409, 'Participation allocation is missing.')
      if (input.status === 'approved') {
        if (!published(p))
          throw new HttpError(409, 'Publish the programme before approving access.')
        ensureReadiness(db, p.id, p.status)
        if (details.ageBand !== '18+' && !participationReady(db, applicationId))
          throw new HttpError(
            409,
            'A safeguarding officer must verify current guardian consent and authority before approving a child.',
          )
        if (details.ageBand !== '18+') {
          const providers = db
            .prepare('SELECT user_id FROM programme_staff WHERE programme_id=?')
            .all(p.id)
          if (providers.some((provider) => !screeningReady(db, String(provider.user_id))))
            throw new HttpError(
              409,
              'Assigned providers need current screening, training and orientation before a child participates.',
            )
        }
        if (funding.feeMinor > 0 && row.payment_status !== 'verified')
          throw new HttpError(409, 'Finance staff must verify payment before approval.')
        const otherApproved = (funding.approved ?? 0) - (row.status === 'approved' ? 1 : 0)
        if (otherApproved >= funding.capacity)
          throw new HttpError(409, 'No places remain in this participation allocation.')
        if ((otherApproved + 1) * funding.awardMinor > funding.budgetMinor)
          throw new HttpError(409, 'The award exceeds the approved funding budget.')
        const conflict = db
          .prepare(
            `SELECT 1 FROM scheduled_sessions a JOIN scheduled_sessions b ON a.starts_at<b.ends_at AND a.ends_at>b.starts_at
          JOIN applications e ON e.programme_id=b.programme_id AND e.user_id=? AND e.status='approved'
          WHERE a.programme_id=? AND a.programme_id!=b.programme_id`,
          )
          .get(row.user_id, row.programme_id)
        if (conflict)
          throw new HttpError(
            409,
            'This participant already has an approved programme with a conflicting session.',
          )
      }
      db.prepare('UPDATE applications SET status=?,consent_verified=?,notes=? WHERE id=?').run(
        input.status,
        Number(details.ageBand !== '18+' && participationReady(db, applicationId)),
        input.notes,
        applicationId,
      )
      notify(db, String(row.user_id), `${p.title}: your application is ${input.status}.`)
      audit(db, account.id, `application.${input.status}`, applicationId)
    })
  }
  return {
    get,
    published,
    publicView,
    staff,
    enrolled,
    contentAccess,
    save,
    apply,
    applications,
    review,
  }
}
