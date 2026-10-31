import { afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import request from 'supertest'
import { createApp } from './app.ts'
import { hashPassword } from './auth.ts'
import { id, openDatabase, type Database } from './db.ts'
import { programmeSchema, type User } from '../shared/domain.ts'
import { operationsSchema, type Operations } from '../shared/operations.ts'
import { createSnapshot, restoreSnapshot, verifySnapshot } from './recovery-service.ts'
import { participationReady } from './operational-rules.ts'

const origin = 'http://127.0.0.1:5173'
const password = 'Test-only-operations-927!'
let hash: string
let db: Database
let app: ReturnType<typeof createApp>
interface Client {
  id: string
  csrf: string
  agent: ReturnType<typeof request.agent>
}
let owner: Client
before(async () => {
  hash = await hashPassword(password)
})
beforeEach(async () => {
  db = openDatabase(':memory:')
  app = createApp(db, { origin, rateLimit: 10000 })
  owner = await account('admin')
})
afterEach(() => db.close())
async function account(role: User['role'], permissions: string[] = []) {
  const userId = id()
  db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
    userId,
    `Test ${role}`,
    `${userId}@example.test`,
    hash,
    role,
  )
  for (const permission of permissions)
    db.prepare('INSERT INTO permissions VALUES(?,?)').run(userId, permission)
  const agent = request.agent(app)
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: `${userId}@example.test`, password })
    .expect(200)
  return { id: userId, agent, csrf: String(response.body.csrf) }
}
function write(
  user: Client,
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  input: object = {},
) {
  return user.agent[method](`/api${path}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', user.csrf)
    .send(input)
}
async function programme(extra: object = {}) {
  const input = programmeSchema.parse({
    title: 'Test operational programme',
    summary: 'Test fixture only.',
    description: 'Isolated operations test.',
    type: 'course',
    topic: 'coding',
    audience: 'all',
    delivery: 'virtual',
    status: 'open',
    funding: [{ mode: 'free', capacity: 100 }],
    ...extra,
  })
  const response = await write(owner, 'post', '/staff/programmes', input).expect(201)
  return String(response.body.programme.id)
}
async function application(programmeId: string, guardian: Client, minor = true) {
  const response = await write(guardian, 'post', `/programmes/${programmeId}/apply`, {
    mode: 'free',
    participantName: 'PRIVATE_TEST_CHILD',
    ageBand: minor ? '6-12' : '18+',
    guardianName: minor ? 'PRIVATE_TEST_GUARDIAN' : '',
    guardianEmail: minor ? 'private@example.test' : '',
    guardianConsent: minor,
  }).expect(201)
  return String(response.body.id)
}
const expiry = () => new Date(Date.now() + 86400000 * 30).toISOString()
async function declare(
  guardian: Client,
  applicationId: string,
  purpose = 'participation',
  version = 'participation-v1',
) {
  await write(guardian, 'post', `/my/applications/${applicationId}/consents`, {
    purpose,
    noticeVersion: version,
    granted: true,
  }).expect(201)
  return String(
    db
      .prepare(
        'SELECT id FROM consents WHERE application_id=? AND purpose=? ORDER BY sequence DESC LIMIT 1',
      )
      .get(applicationId, purpose)?.id,
  )
}
async function verified(guardian: Client, applicationId: string, purpose = 'participation') {
  await write(guardian, 'put', `/my/applications/${applicationId}/guardian`, {
    relationship: 'parent',
  }).expect(200)
  const consentId = await declare(guardian, applicationId, purpose)
  const officer = await account('manager', ['safeguarding'])
  await write(officer, 'post', `/operations/consents/${consentId}/verify`, {
    evidenceReference: 'Test-only verified authority reference',
    authorityConfirmed: true,
    validUntil: expiry(),
  }).expect(200)
  return { officer, consentId }
}
function approve(applicationId: string) {
  return write(owner, 'patch', `/staff/applications/${applicationId}`, {
    status: 'approved',
    consentVerified: true,
    notes: 'Test eligibility review',
  })
}
async function policyFor(programmeId: string, extra: Partial<Operations> = {}) {
  const policy = operationsSchema.parse(extra)
  await write(owner, 'put', `/operations/programmes/${programmeId}`, policy).expect(200)
  return policy
}
async function sourceAndGrant(restrictedProgrammes: string[] = [], extra: object = {}) {
  const source = await write(owner, 'post', '/operations/funding/sources', {
    name: `Test foundation ${id()}`,
    kind: 'foundation',
    contact: 'Private fixture contact',
  }).expect(201)
  const input = {
    sourceId: source.body.id,
    title: 'Test grant',
    reference: id(),
    kind: 'grant',
    currency: 'KES',
    pledgedMinor: 100000,
    restrictedProgrammes,
    applicationStatus: 'awarded',
    awardDate: new Date().toISOString().slice(0, 10),
    ...extra,
  }
  const award = await write(owner, 'post', '/operations/funding/awards', input).expect(201)
  return { awardId: String(award.body.id), sourceId: String(source.body.id), input }
}
async function proposal(
  awardId: string,
  kind: string,
  amountMinor: number,
  programmeId: string | null = null,
) {
  const response = await write(owner, 'post', '/operations/funding/actions', {
    awardId,
    programmeId,
    kind,
    amountMinor,
    reference: id(),
    reason: 'Isolated test evidence and approval purpose',
  }).expect(201)
  return String(response.body.id)
}
function review(approver: Client, actionId: string, approve = true) {
  return write(approver, 'post', `/operations/funding/actions/${actionId}/review`, { approve })
}

test('new modules require authentication, explicit safeguarding/approval permissions and CSRF', async () => {
  const manager = await account('manager')
  const learner = await account('learner')
  for (const path of ['consents', 'concerns', 'funding', 'locations', 'providers', 'impact']) {
    await request(app).get(`/api/operations/${path}`).expect(401)
  }
  for (const user of [owner, manager, learner])
    await user.agent.get('/api/operations/concerns').expect(403)
  await manager.agent.get('/api/operations/funding').expect(403)
  await learner.agent.get('/api/operations/impact').expect(403)
  await owner.agent.post('/api/operations/locations').set('Origin', origin).send({}).expect(403)
})
test('restricted concern intake, follow-up, holds and retention disposal never leak to generic reports', async () => {
  const reporter = await account('learner')
  const officer = await account('instructor', ['safeguarding'])
  const response = await write(reporter, 'post', '/safeguarding/concerns', {
    subject: 'TEST_PRIVATE_SUBJECT',
    detail: 'TEST_PRIVATE_NARRATIVE',
    priority: 'urgent',
  }).expect(201)
  const concernId = String(response.body.id)
  await owner.agent.get('/api/operations/concerns').expect(403)
  const cases = await officer.agent.get('/api/operations/concerns').expect(200)
  assert.equal(cases.body.concerns[0].detail, 'TEST_PRIVATE_NARRATIVE')
  for (const path of ['/api/staff/audit', '/api/operations/impact', '/api/staff/overview']) {
    const result = await owner.agent.get(path).expect(200)
    assert.ok(!JSON.stringify(result.body).includes('TEST_PRIVATE_NARRATIVE'))
    assert.ok(!JSON.stringify(result.body).includes('TEST_PRIVATE_SUBJECT'))
  }
  const followup = {
    status: 'investigating',
    note: 'Test referral procedure',
    assignedTo: owner.id,
    reviewDue: expiry(),
    retainUntil: expiry(),
    legalHold: true,
  }
  await write(officer, 'post', `/operations/concerns/${concernId}/actions`, followup).expect(400)
  await write(officer, 'post', `/operations/concerns/${concernId}/actions`, {
    ...followup,
    assignedTo: officer.id,
  }).expect(200)
  await write(reporter, 'delete', '/account', { password }).expect(409)
  const closed = {
    ...followup,
    assignedTo: officer.id,
    status: 'closed',
    retainUntil: new Date(Date.now() - 86400000).toISOString(),
  }
  await write(officer, 'post', `/operations/concerns/${concernId}/actions`, closed).expect(200)
  await write(officer, 'delete', `/operations/concerns/${concernId}`, {
    reason: 'approved-retention-disposal',
  }).expect(409)
  await write(officer, 'post', `/operations/concerns/${concernId}/actions`, {
    ...closed,
    legalHold: false,
  }).expect(200)
  await write(officer, 'delete', `/operations/concerns/${concernId}`, {
    reason: 'approved-retention-disposal',
  }).expect(200)
  assert.equal(db.prepare('SELECT count(*) AS n FROM concern_actions').get()?.n, 0)
  assert.ok(db.prepare("SELECT 1 FROM audit WHERE action='safeguarding.retention-disposal'").get())
})
test('a checkbox is not proof: guardian authority, evidence, current purpose and independent reviewer are required', async () => {
  const p = await programme()
  const guardian = await account('learner')
  const a = await application(p, guardian)
  const otherGuardian = await account('learner')
  await write(otherGuardian, 'put', `/my/applications/${a}/guardian`, {
    relationship: 'parent',
  }).expect(403)
  await write(otherGuardian, 'post', `/my/applications/${a}/consents`, {
    purpose: 'participation',
    granted: true,
    noticeVersion: 'participation-v1',
  }).expect(403)
  await approve(a).expect(409)
  const declaration = await declare(guardian, a)
  const officer = await account('manager', ['safeguarding'])
  const check = {
    evidenceReference: 'Test reference',
    authorityConfirmed: true,
    validUntil: expiry(),
  }
  await write(officer, 'post', `/operations/consents/${declaration}/verify`, check).expect(409)
  await write(guardian, 'put', `/my/applications/${a}/guardian`, { relationship: 'parent' }).expect(
    200,
  )
  await write(officer, 'post', `/operations/consents/${declaration}/verify`, check).expect(409)
  const latest = String(
    db
      .prepare('SELECT id FROM consents WHERE application_id=? ORDER BY sequence DESC LIMIT 1')
      .get(a)?.id,
  )
  await write(owner, 'post', `/operations/consents/${latest}/verify`, check).expect(403)
  await write(officer, 'post', `/operations/consents/${latest}/verify`, {
    ...check,
    evidenceReference: '',
  }).expect(400)
  await write(officer, 'post', `/operations/consents/${latest}/verify`, check).expect(200)
  await owner.agent.get(`/api/operations/history/consent/${a}`).expect(403)
  const consentHistory = await officer.agent.get(`/api/operations/history/consent/${a}`).expect(200)
  assert.equal(
    JSON.parse(consentHistory.body.history[0].next_data).evidenceReference,
    check.evidenceReference,
  )
  assert.equal(JSON.parse(consentHistory.body.history[0].next_data).verifiedBy, officer.id)
  await approve(a).expect(200)
  await write(officer, 'post', `/operations/consents/${latest}/verify`, check).expect(409)
  await (
    await account('learner')
  ).agent
    .get('/api/my/consents')
    .expect(200)
    .then((r) => assert.equal(r.body.cases.length, 0))
  const ownOfficerCase = await application(p, officer)
  await write(officer, 'put', `/my/applications/${ownOfficerCase}/guardian`, {
    relationship: 'parent',
  }).expect(200)
  const ownDeclaration = await declare(officer, ownOfficerCase)
  await write(officer, 'post', `/operations/consents/${ownDeclaration}/verify`, check).expect(403)
})
test('withdrawing participation immediately blocks learning, progress, attendance, schedules and event access', async () => {
  const p = await programme({ type: 'hackathon' })
  const guardian = await account('learner')
  const a = await application(p, guardian)
  await verified(guardian, a)
  await approve(a).expect(200)
  await write(owner, 'post', `/staff/programmes/${p}/lessons`, {
    title: 'Private test lesson',
    module: 'Test',
    body: 'Private',
    position: 0,
    published: true,
  }).expect(201)
  const scheduled = await write(owner, 'post', `/staff/programmes/${p}/schedule`, {
    title: 'Test private session',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: '',
    joiningUrl: 'https://example.test/PRIVATE_MEETING',
  }).expect(201)
  await guardian.agent.get(`/api/programmes/${p}/lessons`).expect(200)
  await write(guardian, 'post', `/my/applications/${a}/consents`, {
    purpose: 'participation',
    granted: false,
    noticeVersion: 'old-version',
  }).expect(201)
  await guardian.agent.get(`/api/programmes/${p}/lessons`).expect(403)
  await guardian.agent.get(`/api/programmes/${p}/schedule`).expect(403)
  await guardian.agent.get(`/api/programmes/${p}/projects`).expect(403)
  await write(owner, 'post', `/staff/programmes/${p}/attendance`, {
    sessionId: scheduled.body.id,
    userId: guardian.id,
    status: 'present',
  }).expect(400)
  const dashboard = await guardian.agent.get('/api/dashboard').expect(200)
  assert.equal(dashboard.body.schedule.length, 0)
  assert.equal(dashboard.body.applications[0].consentVerified, false)
})
test('emergency contacts are conditional, guardian changes invalidate authority, and consent version/expiry are rechecked', async () => {
  const p = await programme()
  const guardian = await account('learner')
  const a = await application(p, guardian)
  await write(guardian, 'put', `/my/applications/${a}/guardian`, {
    relationship: 'parent',
    emergencyName: 'Unneeded',
    emergencyPhone: 'Unneeded',
  }).expect(400)
  await policyFor(p, {
    emergencyRequired: true,
    challenges: 'TEST_PRIVATE_POLICY_NARRATIVE',
    readiness: [
      {
        key: 'finance',
        title: 'Funding review',
        requiredBefore: 'none',
        complete: true,
        evidence: 'TEST_PRIVATE_FINANCE_REFERENCE',
      },
    ],
  })
  const consentView = await guardian.agent.get('/api/my/consents').expect(200)
  assert.ok(!JSON.stringify(consentView.body).includes('TEST_PRIVATE_POLICY_NARRATIVE'))
  assert.ok(!JSON.stringify(consentView.body).includes('TEST_PRIVATE_FINANCE_REFERENCE'))
  await write(guardian, 'put', `/my/applications/${a}/guardian`, { relationship: 'parent' }).expect(
    400,
  )
  await write(guardian, 'put', `/my/applications/${a}/guardian`, {
    relationship: 'parent',
    emergencyName: 'TEST_EMERGENCY',
    emergencyPhone: 'TEST_PHONE',
  }).expect(200)
  const declaration = await declare(guardian, a)
  const officer = await account('manager', ['safeguarding'])
  await write(officer, 'post', `/operations/consents/${declaration}/verify`, {
    evidenceReference: 'Test ref',
    authorityConfirmed: true,
    validUntil: expiry(),
  }).expect(200)
  await approve(a).expect(200)
  await policyFor(p, { noticeVersion: 'participation-v2' })
  await guardian.agent.get(`/api/programmes/${p}/lessons`).expect(403)
  await write(guardian, 'post', `/my/applications/${a}/consents`, {
    purpose: 'participation',
    noticeVersion: 'participation-v1',
    granted: true,
  }).expect(409)
  await write(
    owner,
    'put',
    `/operations/programmes/${p}`,
    operationsSchema.parse({ noticeVersion: 'participation-v1' }),
  ).expect(409)
  const response = await owner.agent.get(`/api/staff/programmes/${p}/applications`).expect(200)
  assert.ok(!JSON.stringify(response.body).includes('TEST_EMERGENCY'))
})
test('purpose-specific communications consent and preferences control in-app broadcasts without direct messaging', async () => {
  const p = await programme()
  const guardian = await account('learner')
  const a = await application(p, guardian)
  const { officer } = await verified(guardian, a)
  await approve(a).expect(200)
  const send = () =>
    write(owner, 'post', `/operations/programmes/${p}/announcements`, { message: 'Test broadcast' })
  assert.equal((await send().expect(201)).body.recipients, 0)
  const communications = await declare(guardian, a, 'communications')
  await write(officer, 'post', `/operations/consents/${communications}/verify`, {
    evidenceReference: 'Test communication choice',
    authorityConfirmed: true,
    validUntil: expiry(),
  }).expect(200)
  assert.equal((await send().expect(201)).body.recipients, 1)
  await write(guardian, 'put', '/my/preferences', {
    programmeUpdates: false,
    futureOpportunities: false,
  }).expect(200)
  assert.equal((await send().expect(201)).body.recipients, 0)
  assert.equal(db.prepare("SELECT count(*) AS n FROM consents WHERE purpose='media'").get()?.n, 0)
  await guardian.agent
    .get('/api/my/preferences')
    .expect(200)
    .then((r) => assert.equal(r.body.programmeUpdates, false))
})
test('consent expiry pauses access without destroying the approved application or completed progress', async () => {
  const p = await programme()
  const guardian = await account('learner')
  const a = await application(p, guardian)
  const { consentId } = await verified(guardian, a)
  await approve(a).expect(200)
  const lesson = await write(owner, 'post', `/staff/programmes/${p}/lessons`, {
    title: 'Test persisted activity',
    module: 'Test',
    body: 'Test',
    position: 0,
    published: true,
  }).expect(201)
  await write(guardian, 'post', `/programmes/${p}/lessons/${lesson.body.id}/complete`).expect(200)
  db.prepare('UPDATE consents SET valid_until=? WHERE id=?').run('2020-01-01T00:00:00Z', consentId)
  await guardian.agent.get(`/api/programmes/${p}/lessons`).expect(403)
  assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(a)?.status, 'approved')
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM progress WHERE user_id=?').get(guardian.id)?.n,
    1,
  )
})
test('readiness gates server-side publication, applications and continued access, without physical-course defaults', async () => {
  const p = await programme()
  const learner = await account('learner')
  const a = await application(p, learner, false)
  await approve(a).expect(200)
  const policy = await policyFor(p, {
    readiness: [
      {
        key: 'venue',
        title: 'Venue confirmed',
        requiredBefore: 'open',
        complete: false,
        evidence: '',
      },
    ],
  })
  await learner.agent.get(`/api/programmes/${p}/lessons`).expect(403)
  const other = await account('learner')
  await write(other, 'post', `/programmes/${p}/apply`, {
    mode: 'free',
    participantName: 'Test adult',
    ageBand: '18+',
  }).expect(409)
  const details = await owner.agent.get(`/api/staff/programmes/${p}`).expect(200)
  await write(owner, 'put', `/staff/programmes/${p}`, details.body.programme).expect(409)
  await write(owner, 'put', `/operations/programmes/${p}`, {
    ...policy,
    readiness: [{ ...policy.readiness[0], complete: true, evidence: '' }],
  }).expect(400)
  await write(owner, 'put', `/operations/programmes/${p}`, {
    ...policy,
    readiness: [{ ...policy.readiness[0], complete: true, evidence: 'Test venue confirmation' }],
  }).expect(200)
  await learner.agent.get(`/api/programmes/${p}/lessons`).expect(200)
  await programme({ audience: 'adults', delivery: 'virtual' })
})
test('screening, training, orientation and lifecycle govern assignments and expired dashboard links', async () => {
  const p = await programme({ audience: 'children' })
  const teacher = await account('instructor')
  const officer = await account('manager', ['safeguarding'])
  const profile = {
    stage: 'orientation',
    engagement: 'volunteer',
    orientationComplete: true,
    skills: 'Test coding',
  }
  const screening = {
    status: 'cleared',
    validUntil: expiry(),
    trainingDate: '2026-01-01',
    acknowledgementVersion: 'Test code v1',
    evidenceReference: 'TEST_PRIVATE_SCREENING',
  }
  await write(owner, 'put', `/operations/providers/${teacher.id}/profile`, {
    ...profile,
    stage: 'active',
  }).expect(409)
  await write(owner, 'post', `/staff/programmes/${p}/assignments`, {
    userId: teacher.id,
    role: 'instructor',
  }).expect(403)
  await write(owner, 'put', `/operations/providers/${teacher.id}/screening`, screening).expect(403)
  await write(officer, 'put', `/operations/providers/${teacher.id}/screening`, {
    status: 'pending',
    evidenceReference: 'Test pending screening',
  }).expect(200)
  await write(owner, 'post', `/staff/programmes/${p}/assignments`, {
    userId: teacher.id,
    role: 'instructor',
  }).expect(403)
  await write(officer, 'put', `/operations/providers/${teacher.id}/screening`, screening).expect(
    200,
  )
  await write(owner, 'put', `/operations/providers/${teacher.id}/profile`, {
    ...profile,
    stage: 'active',
  }).expect(200)
  await write(owner, 'post', `/staff/programmes/${p}/assignments`, {
    userId: teacher.id,
    role: 'instructor',
  }).expect(200)
  await write(owner, 'post', `/staff/programmes/${p}/schedule`, {
    title: 'Test private session',
    startsAt: '2027-01-04T08:00:00Z',
    endsAt: '2027-01-04T09:00:00Z',
    location: '',
    joiningUrl: 'https://example.test/PRIVATE_MEETING',
  }).expect(201)
  assert.equal((await teacher.agent.get('/api/dashboard').expect(200)).body.schedule.length, 1)
  db.prepare('UPDATE provider_screening SET data=? WHERE user_id=?').run(
    JSON.stringify({ ...screening, validUntil: '2020-01-01T00:00:00Z' }),
    teacher.id,
  )
  await teacher.agent.get(`/api/programmes/${p}/lessons`).expect(403)
  assert.equal((await teacher.agent.get('/api/dashboard').expect(200)).body.schedule.length, 0)
  const manager = await account('manager')
  const visible = await manager.agent.get('/api/operations/providers').expect(200)
  assert.ok(!JSON.stringify(visible.body).includes('TEST_PRIVATE_SCREENING'))
  await manager.agent.get(`/api/operations/history/screening/${teacher.id}`).expect(403)
})
test('provider agreements and their change history remain financial-only', async () => {
  const provider = await account('instructor')
  const manager = await account('manager')
  const agreement = { arrangement: 'TEST_PRIVATE_COMPENSATION', amountMinor: 2000, currency: 'KES' }
  await write(manager, 'put', `/operations/providers/${provider.id}/agreement`, agreement).expect(
    403,
  )
  await write(owner, 'put', `/operations/providers/${provider.id}/agreement`, agreement).expect(200)
  await write(owner, 'put', `/operations/providers/${provider.id}/agreement`, {
    ...agreement,
    amountMinor: 3000,
  }).expect(200)
  const history = await owner.agent
    .get(`/api/operations/history/agreement/${provider.id}`)
    .expect(200)
  assert.equal(JSON.parse(history.body.history[0].previous_data).amountMinor, 2000)
  await manager.agent.get(`/api/operations/history/agreement/${provider.id}`).expect(403)
  const visible = await manager.agent.get('/api/operations/providers').expect(200)
  assert.ok(!JSON.stringify(visible.body).includes('TEST_PRIVATE_COMPENSATION'))
  await write(provider, 'delete', '/account', { password }).expect(409)
})
test('assigned contributions reject duplicates and require independent verification', async () => {
  const p = await programme({ audience: 'adults' })
  const teacher = await account('instructor')
  await write(owner, 'post', `/staff/programmes/${p}/assignments`, {
    userId: teacher.id,
    role: 'instructor',
  }).expect(200)
  const data = {
    userId: teacher.id,
    programmeId: p,
    date: '2026-01-01',
    minutes: 60,
    activity: 'Test teaching contribution',
  }
  const result = await write(teacher, 'post', '/operations/contributions', data).expect(201)
  await write(teacher, 'post', '/operations/contributions', data).expect(409)
  await write(teacher, 'post', `/operations/contributions/${result.body.id}/verify`).expect(403)
  await write(owner, 'post', `/operations/contributions/${result.body.id}/verify`).expect(200)
  const learner = await account('learner')
  assert.equal(
    (await learner.agent.get('/api/operations/contributions').expect(200)).body.contributions
      .length,
    0,
  )
})
test('grant cash, restricted allocation, releases and expenditure are transactional and independently approved', async () => {
  const p = await programme()
  const other = await programme()
  const { awardId } = await sourceAndGrant([p])
  const approver = await account('finance', ['finance-approver'])
  const ordinaryFinance = await account('finance')
  const noCash = await proposal(awardId, 'allocate', 100, p)
  await review(approver, noCash).expect(409)
  const receipt = await proposal(awardId, 'receipt', 10000)
  await review(owner, receipt).expect(403)
  await review(ordinaryFinance, receipt).expect(403)
  await review(approver, receipt).expect(200)
  await review(approver, receipt).expect(409)
  const wrong = await proposal(awardId, 'allocate', 1000, other)
  await review(approver, wrong).expect(409)
  await review(approver, wrong, false).expect(200)
  await review(approver, await proposal(awardId, 'allocate', 8000, p)).expect(200)
  await review(approver, await proposal(awardId, 'allocate', 3000, p)).expect(409)
  await review(approver, await proposal(awardId, 'expenditure', 9000, p)).expect(409)
  await review(approver, await proposal(awardId, 'expenditure', 2000, p)).expect(200)
  await review(approver, await proposal(awardId, 'release', 7000, p)).expect(409)
  await review(approver, await proposal(awardId, 'release', 1000, p)).expect(200)
  await review(approver, await proposal(awardId, 'receipt', -4000)).expect(409)
  const register = await owner.agent.get('/api/operations/funding').expect(200)
  assert.equal(register.body.awards[0].allocatedMinor, 7000)
  assert.equal(register.body.awards[0].spentMinor, 2000)
  const csv = await owner.agent.get('/api/operations/funding/export').expect(200)
  assert.match(csv.text, /proposedBy/)
})
test('financial self-approval cannot be obtained by giving the proposer approver permission', async () => {
  const { awardId } = await sourceAndGrant()
  db.prepare('INSERT INTO permissions VALUES(?,?)').run(owner.id, 'finance-approver')
  await review(owner, await proposal(awardId, 'receipt', 5000)).expect(403)
  assert.equal((await owner.agent.get('/api/operations/funding')).body.awards[0].receivedMinor, 0)
})
test('verified donations are linked once and corrections cannot bypass dual control', async () => {
  const donationId = id()
  db.prepare(
    'INSERT INTO enquiries(id,kind,data,status,received_minor,receipt_reference) VALUES(?,?,?,?,?,?)',
  ).run(
    donationId,
    'donation',
    JSON.stringify({
      kind: 'donation',
      name: 'Test donor',
      email: 'donor@example.test',
      message: 'Fixture',
      consent: true,
    }),
    'verified',
    5000,
    'TEST-RECEIPT',
  )
  const { awardId, input } = await sourceAndGrant([], {
    kind: 'donation',
    donationId,
    applicationStatus: 'not-applicable',
  })
  await write(owner, 'post', '/operations/funding/awards', { ...input, reference: id() }).expect(
    409,
  )
  await write(owner, 'patch', `/staff/enquiries/${donationId}`, {
    status: 'verified',
    notes: '',
    assignedTo: null,
    receivedAmountMinor: 9000,
  }).expect(409)
  await write(owner, 'delete', `/staff/enquiries/${donationId}`).expect(409)
  const approver = await account('finance', ['finance-approver'])
  await review(approver, await proposal(awardId, 'receipt', -1000)).expect(200)
  assert.equal(
    db.prepare('SELECT received_minor FROM enquiries WHERE id=?').get(donationId)?.received_minor,
    4000,
  )
  assert.equal(
    (await owner.agent.get('/api/operations/funding')).body.awards[0].receivedMinor,
    4000,
  )
  await write(owner, 'post', '/operations/funding/actions', {
    awardId,
    kind: 'receipt',
    amountMinor: 100,
    reference: 'test-receipt',
    reason: 'Duplicate should not count',
  }).expect(409)
})
test('grant administrative changes preserve history and in-kind contributions never become spendable cash', async () => {
  const grant = await sourceAndGrant()
  await write(owner, 'patch', `/operations/funding/awards/${grant.awardId}`, {
    applicationStatus: 'awarded',
    awardDate: '2026-01-01',
    reportingDue: '2027-01-01',
    conditions: 'Test conditions',
    currency: 'USD',
  }).expect(200)
  const history = await owner.agent
    .get(`/api/operations/history/award/${grant.awardId}`)
    .expect(200)
  assert.equal(history.body.history.length, 1)
  assert.equal((await owner.agent.get('/api/operations/funding')).body.awards[0].currency, 'KES')
  const inKind = await sourceAndGrant([], {
    kind: 'in-kind',
    inKindDescription: 'Test-only 2 laptops',
    applicationStatus: 'not-applicable',
  })
  await write(owner, 'post', '/operations/funding/actions', {
    awardId: inKind.awardId,
    kind: 'receipt',
    amountMinor: 100,
    reference: id(),
    reason: 'Not cash',
  }).expect(409)
})
test('impact reports use real activity, privacy suppression, independent outcome evidence and authorised filters', async () => {
  const p = await programme({ startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z' })
  const location = await write(owner, 'post', '/operations/locations', {
    name: '=TEST_LOCATION',
    kind: 'school',
    area: 'Test community',
  }).expect(201)
  await policyFor(p, {
    locationId: location.body.id,
    participantTarget: 10,
    objectives: 'Test output and outcome framework',
    beneficiaryGroup: 'Aggregate test community',
  })
  const indicator = await write(owner, 'post', `/operations/programmes/${p}/indicators`, {
    name: 'Test working projects presented',
    kind: 'outcome',
    unit: 'projects',
    target: 10,
    evidenceRequirement: 'Reviewed practical demonstration',
  }).expect(201)
  const observation = await write(
    owner,
    'post',
    `/operations/indicators/${indicator.body.id}/observations`,
    {
      value: 7,
      observedAt: '2026-01-01',
      evidenceReference: 'TEST_PRIVATE_EVIDENCE',
      note: 'Not a causal claim',
    },
  ).expect(201)
  await write(owner, 'post', `/operations/observations/${observation.body.id}/verify`).expect(403)
  const manager = await account('manager')
  await write(manager, 'post', `/operations/observations/${observation.body.id}/verify`).expect(200)
  let report = await owner.agent.get(`/api/operations/impact?programme=${p}`).expect(200)
  assert.equal(report.body.records[0].approvedPlaces, null)
  assert.equal(report.body.records[0].indicators[0].value, null)
  for (let i = 0; i < 5; i++)
    await approve(await application(p, await account('learner'), false)).expect(200)
  report = await owner.agent
    .get(`/api/operations/impact?location=${location.body.id}&from=2026-01-01&to=2026-01-03`)
    .expect(200)
  assert.equal(report.body.records[0].approvedPlaces, 5)
  assert.equal(report.body.records[0].lessonCompletions, 0)
  assert.equal(report.body.records[0].indicators[0].value, 7)
  assert.ok(!JSON.stringify(report.body).includes('PRIVATE_TEST_CHILD'))
  assert.ok(!JSON.stringify(report.body).includes('TEST_PRIVATE_EVIDENCE'))
  assert.equal(
    (await owner.agent.get('/api/operations/impact?from=2027-01-01')).body.records.length,
    0,
  )
  const funding = await sourceAndGrant()
  await manager.agent.get(`/api/operations/impact?source=${funding.sourceId}`).expect(403)
  const csv = await owner.agent.get('/api/operations/impact/export').expect(200)
  assert.ok(csv.text.includes("'=TEST_LOCATION"))
  assert.ok(!csv.text.includes('PRIVATE_TEST_CHILD'))
  await owner.agent.get('/api/operations/impact?from=2027-01-01&to=2026-01-01').expect(400)
})
test('pre-operations migration preserves applications and requires legacy child consent to be reverified', () => {
  const directory = mkdtempSync(join(tmpdir(), 'techducate-upgrade-'))
  const path = join(directory, 'v1.sqlite')
  const legacy = new DatabaseSync(path)
  legacy.exec(readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'))
  legacy.exec(
    'CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(1);',
  )
  const legacyUser = id()
  legacy
    .prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)')
    .run(legacyUser, 'Test legacy', 'legacy@example.test', hash, 'learner')
  const programmeId = id()
  const applicationId = id()
  const legacyProgramme = programmeSchema.parse({
    title: 'Test legacy programme',
    summary: 'Test',
    description: 'Test',
    type: 'course',
    topic: 'coding',
    audience: 'children',
    delivery: 'virtual',
    status: 'open',
    funding: [{ mode: 'free', capacity: 5 }],
  })
  legacy
    .prepare('INSERT INTO programmes(id,data) VALUES(?,?)')
    .run(programmeId, JSON.stringify(legacyProgramme))
  legacy
    .prepare('INSERT INTO funding(programme_id,mode,capacity,data) VALUES(?,?,?,?)')
    .run(programmeId, 'free', 5, JSON.stringify(legacyProgramme.funding[0]))
  legacy
    .prepare(
      "INSERT INTO applications(id,programme_id,user_id,mode,data,status,consent_verified) VALUES(?,?,?,?,?,'approved',1)",
    )
    .run(
      applicationId,
      programmeId,
      legacyUser,
      'free',
      JSON.stringify({
        mode: 'free',
        participantName: 'Test legacy child',
        ageBand: '6-12',
        guardianName: 'Test legacy guardian',
        guardianEmail: 'legacy@example.test',
        guardianConsent: true,
      }),
    )
  legacy.close()
  const upgraded = openDatabase(path)
  try {
    assert.equal(
      upgraded.prepare('SELECT name FROM users WHERE id=?').get(legacyUser)?.name,
      'Test legacy',
    )
    assert.equal(upgraded.prepare('SELECT count(*) AS n FROM migrations').get()?.n, 3)
    assert.equal(
      upgraded
        .prepare('SELECT status,consent_verified FROM applications WHERE id=?')
        .get(applicationId)?.status,
      'approved',
    )
    assert.equal(participationReady(upgraded, applicationId), false)
    assert.equal(upgraded.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
  } finally {
    upgraded.close()
    rmSync(directory, { recursive: true })
  }
})
test('online snapshots restore persistent data, invalidate credentials and refuse overwrite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'techducate-recovery-'))
  const source = join(directory, 'source.sqlite')
  const connection = openDatabase(source)
  try {
    const userId = id()
    connection
      .prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)')
      .run(userId, 'Test backup', 'backup@example.test', hash, 'admin')
    connection
      .prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)')
      .run('test-token-hash', userId, 'test-csrf', Date.now() + 100000)
    const snapshot = await createSnapshot(source, join(directory, 'backup'))
    assert.equal(verifySnapshot(snapshot.path).accounts, 1)
    await assert.rejects(createSnapshot(source, join(directory, 'backup')), /EEXIST/)
    await assert.rejects(
      createSnapshot(source, join(process.cwd(), 'dist', `forbidden-backup-${id()}`)),
      /publicly served/,
    )
    const restored = await restoreSnapshot(snapshot.path, join(directory, 'restore'))
    const check = openDatabase(restored.path)
    try {
      assert.equal(check.prepare('SELECT count(*) AS n FROM users').get()?.n, 1)
      assert.equal(check.prepare('SELECT count(*) AS n FROM sessions').get()?.n, 0)
      assert.ok(
        check
          .prepare("SELECT 1 FROM audit WHERE action='recovery.restored-and-sessions-revoked'")
          .get(),
      )
    } finally {
      check.close()
    }
  } finally {
    connection.close()
    rmSync(directory, { recursive: true })
  }
})
