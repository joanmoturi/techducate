import { afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from './app.ts'
import { openDatabase, id, type Database } from './db.ts'
import { digest, hashPassword, secret } from './auth.ts'
import { programmeSchema, type ProgrammeInput, type User } from '../shared/domain.ts'

const origin = 'http://127.0.0.1:5173'
const testPassword = 'Only-for-isolated-tests-493!'
let passwordHash: string
let db: Database
let app: ReturnType<typeof createApp>
interface Client {
  agent: ReturnType<typeof request.agent>
  csrf: string
  userId: string
}
const accounts = new Map<string, Client>()
before(async () => {
  passwordHash = await hashPassword(testPassword)
})
beforeEach(() => {
  db = openDatabase(':memory:')
  app = createApp(db, { origin, rateLimit: 10000 })
  accounts.clear()
})
afterEach(() => db.close())
async function client(role: User['role'] = 'admin', suffix = '') {
  const key = `${role}${suffix}`
  const cached = accounts.get(key)
  if (cached) return cached
  const userId = id()
  db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
    userId,
    key,
    `${key}@example.test`,
    passwordHash,
    role,
  )
  const agent = request.agent(app)
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: `${key}@example.test`, password: testPassword })
    .expect(200)
  const account = { agent, csrf: String(response.body.csrf), userId }
  accounts.set(key, account)
  return account
}
function mutate(
  account: Client,
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body: object = {},
) {
  return account.agent[method](`/api${path}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', account.csrf)
    .send(body)
}
function fixture(overrides: Partial<ProgrammeInput> = {}): ProgrammeInput {
  return programmeSchema.parse({
    title: 'Test learning programme',
    summary: 'An isolated test fixture, not a real opportunity.',
    description: 'Practical technology learning in an isolated automated test.',
    type: 'course',
    topic: 'coding',
    audience: 'all',
    experience: 'Beginners welcome',
    delivery: 'virtual',
    location: '',
    status: 'open',
    funding: [{ mode: 'free', capacity: 3 }],
    ...overrides,
  })
}
async function programme(overrides: Partial<ProgrammeInput> = {}) {
  const owner = await client()
  const input = fixture(overrides)
  const response = await mutate(owner, 'post', '/staff/programmes', input).expect(201)
  return { id: String(response.body.programme.id), input, owner }
}
async function apply(
  programmeId: string,
  learner: Client,
  overrides: Record<string, unknown> = {},
) {
  const response = await mutate(learner, 'post', `/programmes/${programmeId}/apply`, {
    mode: 'free',
    participantName: 'Test participant',
    ageBand: '18+',
    ...overrides,
  }).expect(201)
  return String(response.body.id)
}
function approve(applicationId: string, owner?: Client) {
  const account = owner ?? accounts.get('admin')
  if (!account) throw new Error('Create an administrator before approving an application.')
  return mutate(account, 'patch', `/staff/applications/${applicationId}`, {
    status: 'approved',
    consentVerified: false,
    notes: 'Eligibility reviewed in test.',
  })
}
async function lesson(programmeId: string, owner?: Client, published = true) {
  const response = await mutate(
    owner ?? (await client()),
    'post',
    `/staff/programmes/${programmeId}/lessons`,
    {
      title: 'First lesson',
      module: 'Getting started',
      body: 'Private learning content.',
      position: 0,
      published,
    },
  ).expect(201)
  return String(response.body.id)
}
const publicBody = (kind = 'contact') => ({
  kind,
  name: 'Test contributor',
  email: 'contributor@example.test',
  message: 'A test enquiry, not a real request.',
  consent: true,
  organisation: 'Test organisation',
  service: 'digital-literacy',
  participants: '20 adults',
  skills: 'Teaching and design',
  interests: 'Curriculum',
  availability: 'Weekends',
})

test('database migrations are repeatable and records persist after reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'techducate-test-'))
  const path = join(directory, 'persistence.sqlite')
  let connection = openDatabase(path)
  connection
    .prepare('INSERT INTO enquiries(id,kind,data) VALUES(?,?,?)')
    .run(id(), 'contact', JSON.stringify(publicBody()))
  connection.close()
  connection = openDatabase(path)
  assert.equal(connection.prepare('SELECT count(*) AS n FROM enquiries').get()?.n, 1)
  assert.equal(connection.prepare('SELECT count(*) AS n FROM migrations').get()?.n, 3)
  connection.close()
  rmSync(directory, { recursive: true })
})
test('public forms persist all four submission kinds and never claim an email or payment', async () => {
  for (const kind of ['contact', 'volunteer', 'donation', 'partner']) {
    const response = await request(app)
      .post('/api/enquiries')
      .set('Origin', origin)
      .send(publicBody(kind))
      .expect(201)
    assert.match(response.body.message, /No email was sent/)
    const record = db.prepare('SELECT status,kind FROM enquiries WHERE id=?').get(response.body.id)
    assert.equal(record?.kind, kind)
    assert.equal(record?.status, kind === 'donation' ? 'pending' : 'new')
    if (kind === 'donation') assert.match(response.body.message, /No payment/)
  }
})
test('public validation, honeypot, origin and JSON content checks reject invalid submissions', async () => {
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody(), email: 'invalid' })
    .expect(400)
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody(), consent: false })
    .expect(400)
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody(), website: 'bot.example' })
    .expect(400)
  await request(app).post('/api/enquiries').send(publicBody()).expect(403)
  await request(app)
    .post('/api/enquiries')
    .set('Origin', 'https://other.example')
    .send(publicBody())
    .expect(403)
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .type('form')
    .send('name=Example')
    .expect(415)
  assert.equal(db.prepare('SELECT count(*) AS n FROM enquiries').get()?.n, 0)
})
test('public submissions are rate limited with a useful response', async () => {
  const limitedApp = createApp(db, { origin, rateLimit: 2 })
  for (let i = 0; i < 2; i++)
    await request(limitedApp)
      .post('/api/enquiries')
      .set('Origin', origin)
      .send(publicBody())
      .expect(201)
  const response = await request(limitedApp)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send(publicBody())
    .expect(429)
  assert.match(response.body.error, /Too many requests/)
})
test('adult registration cannot choose a privileged role and passwords and cookies are protected', async () => {
  await request(app)
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name: 'Test', email: 'minor@example.test', password: testPassword, adult: false })
    .expect(400)
  const response = await request(app)
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Test',
      email: 'new@example.test',
      password: testPassword,
      adult: true,
      role: 'admin',
    })
    .expect(201)
  assert.equal(response.body.user.role, 'learner')
  assert.notEqual(
    db.prepare('SELECT password_hash FROM users WHERE email=?').get('new@example.test')
      ?.password_hash,
    testPassword,
  )
  assert.match(String(response.headers['set-cookie']), /HttpOnly/)
  assert.match(String(response.headers['set-cookie']), /SameSite=Strict/)
  const stored = String(db.prepare('SELECT token_hash FROM sessions LIMIT 1').get()?.token_hash)
  assert.equal(stored.length, 64)
  assert.ok(!String(response.headers['set-cookie']).includes(stored))
})
test('admin endpoints require authentication, correct roles and CSRF tokens', async () => {
  await request(app).get('/api/staff/overview').expect(401)
  const learner = await client('learner')
  await learner.agent.get('/api/staff/overview').expect(403)
  const owner = await client()
  await owner.agent.post('/api/staff/programmes').set('Origin', origin).send(fixture()).expect(403)
  await mutate(learner, 'post', '/staff/programmes', fixture()).expect(403)
  await mutate(await client('finance'), 'post', '/staff/programmes', fixture()).expect(403)
})
test('unpublished, future publication and archived programmes cannot be discovered by URL', async () => {
  const draft = await programme({ status: 'draft' })
  const future = await programme({ publishAt: new Date(Date.now() + 86400000).toISOString() })
  await programme({ status: 'archived' })
  for (const p of [draft, future]) await request(app).get(`/api/programmes/${p.id}`).expect(404)
  const response = await request(app).get('/api/programmes').expect(200)
  assert.equal(response.body.programmes.length, 0)
})
test('programme public projections do not expose donors, budgets or private records', async () => {
  const p = await programme({
    funding: [
      {
        mode: 'sponsored',
        capacity: 4,
        feeMinor: 0,
        currency: 'KES',
        sponsor: 'Private funder',
        committedMinor: 50000,
        receivedMinor: 20000,
        budgetMinor: 30000,
        awardMinor: 5000,
      },
    ],
  })
  const response = await request(app).get(`/api/programmes/${p.id}`).expect(200)
  assert.ok(!JSON.stringify(response.body).includes('Private funder'))
  assert.equal(response.body.programme.funding[0].budgetMinor, undefined)
  await request(app).get('/api/staff/enquiries?kind=contact').expect(401)
  await request(app).get(`/api/programmes/${p.id}/lessons`).expect(401)
  const settings = await request(app).get('/api/settings').expect(200)
  assert.equal(settings.body.integrations.ai.enabled, false)
  assert.equal(settings.body.integrations.email.enabled, false)
  assert.equal(settings.body.integrations.payments.enabled, false)
})
test('registration windows, audience and duplicate applications are enforced server-side', async () => {
  const learner = await client('learner')
  const future = await programme({
    registrationOpens: new Date(Date.now() + 86400000).toISOString(),
  })
  const closed = await programme({
    registrationCloses: new Date(Date.now() - 86400000).toISOString(),
  })
  const childOnly = await programme({ audience: 'children' })
  for (const p of [future, closed, childOnly])
    await mutate(learner, 'post', `/programmes/${p.id}/apply`, {
      mode: 'free',
      participantName: 'Test',
      ageBand: '18+',
    }).expect(409)
  const p = await programme()
  await apply(p.id, learner)
  await mutate(learner, 'post', `/programmes/${p.id}/apply`, {
    mode: 'free',
    participantName: 'Test',
    ageBand: '18+',
  }).expect(409)
})
test('content requires reviewed approval, and draft lessons stay hidden from approved learners', async () => {
  const p = await programme()
  const learner = await client('learner')
  const applicationId = await apply(p.id, learner)
  await lesson(p.id)
  await lesson(p.id, undefined, false)
  await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
  await approve(applicationId).expect(200)
  const response = await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(200)
  assert.equal(response.body.lessons.length, 1)
  assert.equal(response.body.lessons[0].body, 'Private learning content.')
  await (await client('learner', 'other')).agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
})
test('children cannot be approved without reviewed guardian consent and their records remain private', async () => {
  const p = await programme()
  const guardian = await client('learner', 'guardian')
  const applicationId = await apply(p.id, guardian, {
    ageBand: '6-12',
    participantName: 'Child',
    guardianName: 'Test guardian',
    guardianEmail: 'guardian@example.test',
    guardianConsent: true,
  })
  await approve(applicationId).expect(409)
  await mutate(await client(), 'patch', `/staff/applications/${applicationId}`, {
    status: 'approved',
    consentVerified: true,
    notes: 'Guardian relationship verified offline.',
  }).expect(409)
  const officer = await client()
  db.prepare('INSERT INTO permissions(user_id,permission) VALUES(?,?)').run(
    officer.userId,
    'safeguarding',
  )
  await mutate(guardian, 'put', `/my/applications/${applicationId}/guardian`, {
    relationship: 'parent',
  }).expect(200)
  await mutate(guardian, 'post', `/my/applications/${applicationId}/consents`, {
    purpose: 'participation',
    granted: true,
    noticeVersion: 'participation-v1',
  }).expect(201)
  const declaration = db
    .prepare('SELECT id FROM consents WHERE application_id=?')
    .get(applicationId)
  await mutate(officer, 'post', `/operations/consents/${String(declaration?.id)}/verify`, {
    evidenceReference: 'Test-only offline authority check',
    authorityConfirmed: true,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
  }).expect(200)
  await approve(applicationId).expect(200)
  await guardian.agent.get(`/api/programmes/${p.id}/lessons`).expect(200)
  const response = await request(app).get(`/api/programmes/${p.id}`).expect(200)
  assert.ok(!JSON.stringify(response.body).includes('guardian@example.test'))
})
test('mixed allocations enforce capacity atomically and waitlist new applications', async () => {
  const p = await programme({
    funding: [
      {
        mode: 'paid',
        capacity: 6,
        feeMinor: 10000,
        currency: 'KES',
        sponsor: '',
        committedMinor: 0,
        receivedMinor: 0,
        budgetMinor: 0,
        awardMinor: 0,
      },
      {
        mode: 'sponsored',
        capacity: 1,
        feeMinor: 0,
        currency: 'KES',
        sponsor: '',
        committedMinor: 0,
        receivedMinor: 0,
        budgetMinor: 5000,
        awardMinor: 5000,
      },
    ],
  })
  const first = await apply(p.id, await client('learner', 'one'), { mode: 'sponsored' })
  const second = await apply(p.id, await client('learner', 'two'), { mode: 'sponsored' })
  const owner = await client()
  const results = await Promise.all([approve(first, owner), approve(second, owner)])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const response = await mutate(
    await client('learner', 'three'),
    'post',
    `/programmes/${p.id}/apply`,
    { mode: 'sponsored', participantName: 'Third', ageBand: '18+' },
  ).expect(201)
  assert.equal(response.body.status, 'waitlisted')
  const adminView = await owner.agent.get(`/api/staff/programmes/${p.id}`).expect(200)
  assert.equal(
    adminView.body.programme.funding.find((f: { mode: string }) => f.mode === 'sponsored')
      .allocatedMinor,
    5000,
  )
})
test('scholarship awards need an approved budget and a donation never creates an award', async () => {
  const p = await programme({
    funding: [
      {
        mode: 'scholarship',
        capacity: 3,
        feeMinor: 0,
        currency: 'KES',
        sponsor: '',
        committedMinor: 50000,
        receivedMinor: 0,
        budgetMinor: 0,
        awardMinor: 10000,
      },
    ],
  })
  const applicationId = await apply(p.id, await client('learner'), { mode: 'scholarship' })
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody('donation'), amountMinor: 10000 })
    .expect(201)
  await approve(applicationId).expect(409)
  assert.equal(
    db.prepare('SELECT status FROM applications WHERE id=?').get(applicationId)?.status,
    'pending',
  )
})
test('paid content needs finance verification and a separate approval; refunds revoke access', async () => {
  const p = await programme({
    funding: [
      {
        mode: 'paid',
        capacity: 2,
        feeMinor: 10000,
        currency: 'KES',
        sponsor: '',
        committedMinor: 0,
        receivedMinor: 0,
        budgetMinor: 0,
        awardMinor: 0,
      },
    ],
  })
  const learner = await client('learner')
  const applicationId = await apply(p.id, learner, { mode: 'paid', paymentStatus: 'verified' })
  await approve(applicationId).expect(409)
  await mutate(learner, 'patch', `/finance/applications/${applicationId}`, {
    paymentStatus: 'verified',
    reference: 'fake',
  }).expect(403)
  const accountant = await client('finance')
  await mutate(accountant, 'patch', `/finance/applications/${applicationId}`, {
    paymentStatus: 'verified',
    reference: 'TEST-RECEIPT-1',
  }).expect(200)
  await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
  await approve(applicationId).expect(200)
  await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(200)
  await mutate(accountant, 'patch', `/finance/applications/${applicationId}`, {
    paymentStatus: 'refunded',
    reference: 'TEST-REFUND-1',
  }).expect(200)
  await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
})
test('approved capacities and fees cannot be silently reduced or changed', async () => {
  const p = await programme()
  await approve(await apply(p.id, await client('learner'))).expect(200)
  const input = p.input
  const response = await mutate(p.owner, 'put', `/staff/programmes/${p.id}`, {
    ...input,
    funding: [
      { ...input.funding[0], capacity: 0 },
      { ...input.funding[0], mode: 'application', capacity: 1 },
    ],
  })
  assert.equal(response.status, 409)
})
test('instructors only manage assigned programmes and judges cannot access learning or attendance', async () => {
  const p = await programme()
  const other = await programme()
  const instructor = await client('instructor')
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: instructor.userId,
    role: 'instructor',
  }).expect(200)
  await lesson(p.id, instructor)
  await mutate(instructor, 'post', `/staff/programmes/${other.id}/lessons`, {
    title: 'No',
    module: 'No',
    body: 'No',
    position: 0,
    published: true,
  }).expect(403)
  await instructor.agent.get(`/api/staff/programmes/${p.id}/applications`).expect(403)
  const judge = await client('instructor', 'judge')
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: judge.userId,
    role: 'judge',
  }).expect(200)
  await judge.agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
  await judge.agent.get(`/api/staff/programmes/${p.id}/attendance`).expect(403)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/schedule`, {
    title: 'Private participant class',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: 'Private room',
    joiningUrl: 'https://example.test/private-class',
  }).expect(201)
  assert.equal((await judge.agent.get('/api/dashboard').expect(200)).body.schedule.length, 0)
})
test('routine managers cannot configure finances or read donations', async () => {
  const manager = await client('manager')
  await mutate(manager, 'post', '/staff/programmes', fixture()).expect(201)
  await mutate(
    manager,
    'post',
    '/staff/programmes',
    fixture({
      funding: [
        {
          mode: 'paid',
          capacity: 2,
          feeMinor: 1000,
          currency: 'KES',
          sponsor: '',
          committedMinor: 0,
          receivedMinor: 0,
          budgetMinor: 0,
          awardMinor: 0,
        },
      ],
    }),
  ).expect(403)
  await manager.agent.get('/api/staff/enquiries?kind=donation').expect(403)
  await (await client('finance')).agent.get('/api/staff/enquiries?kind=partner').expect(403)
})
test('schedule changes propagate to authorised dashboards and conflicts are rejected', async () => {
  const p = await programme()
  const learner = await client('learner')
  const instructor = await client('instructor')
  await approve(await apply(p.id, learner)).expect(200)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: instructor.userId,
    role: 'instructor',
  }).expect(200)
  const data = {
    title: 'Test live class',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: 'Private room',
    joiningUrl: 'https://example.test/meeting',
  }
  const created = await mutate(
    instructor,
    'post',
    `/staff/programmes/${p.id}/schedule`,
    data,
  ).expect(201)
  await mutate(instructor, 'post', `/staff/programmes/${p.id}/schedule`, data).expect(409)
  await mutate(instructor, 'put', `/staff/programmes/${p.id}/schedule/${created.body.id}`, {
    ...data,
    title: 'Updated live class',
    startsAt: '2027-01-03T10:00:00Z',
    endsAt: '2027-01-03T11:00:00Z',
  }).expect(200)
  for (const account of [learner, instructor]) {
    const response = await account.agent.get('/api/dashboard').expect(200)
    assert.equal(response.body.schedule[0].title, 'Updated live class')
    assert.equal(response.body.schedule[0].startsAt, '2027-01-03T10:00:00.000Z')
  }
  const outsider = await client('learner', 'outsider')
  assert.equal((await outsider.agent.get('/api/dashboard').expect(200)).body.schedule.length, 0)
})
test('progress persists and ratings require actual approved completion', async () => {
  const p = await programme()
  const learner = await client('learner')
  await approve(await apply(p.id, learner)).expect(200)
  const lessonId = await lesson(p.id)
  await mutate(learner, 'post', `/programmes/${p.id}/rating`, { rating: 5 }).expect(403)
  await mutate(learner, 'post', `/programmes/${p.id}/lessons/${lessonId}/complete`).expect(200)
  await mutate(learner, 'post', `/programmes/${p.id}/lessons/${lessonId}/complete`).expect(200)
  assert.equal(
    (await learner.agent.get(`/api/programmes/${p.id}/lessons`).expect(200)).body.lessons[0].done,
    true,
  )
  await mutate(learner, 'post', `/programmes/${p.id}/rating`, { rating: 5 }).expect(200)
  assert.equal(db.prepare('SELECT count(*) AS n FROM progress').get()?.n, 1)
  const report = await p.owner.agent.get(`/api/staff/programmes/${p.id}/report`).expect(200)
  assert.equal(report.body.completed, 1)
})
test('teams enforce membership, capacity and programme boundaries; only leaders submit', async () => {
  const p = await programme({
    type: 'hackathon',
    event: {
      teamsEnabled: true,
      teamSize: 2,
      deadline: null,
      challenge: 'Test challenge',
      rules: '',
      criteria: [],
      resultsPublished: false,
    },
  })
  const first = await client('learner', 'first')
  const second = await client('learner', 'second')
  const third = await client('learner', 'third')
  for (const account of [first, second, third])
    await approve(await apply(p.id, account)).expect(200)
  await mutate(first, 'post', `/programmes/${p.id}/team`, { name: 'Test team' }).expect(201)
  const code = (await first.agent.get(`/api/programmes/${p.id}/team`).expect(200)).body.team
    .joinCode
  await mutate(second, 'post', `/programmes/${p.id}/team`, { joinCode: code }).expect(201)
  await mutate(third, 'post', `/programmes/${p.id}/team`, { joinCode: code }).expect(409)
  await mutate(second, 'post', `/programmes/${p.id}/projects`, {
    title: 'No',
    description: 'Not leader',
    url: 'https://example.test',
  }).expect(403)
  await mutate(first, 'post', `/programmes/${p.id}/projects`, {
    title: 'Private test project',
    description: 'Test solution',
    url: 'https://example.test/project',
  }).expect(201)
  assert.equal(
    (await second.agent.get(`/api/programmes/${p.id}/projects`).expect(200)).body.projects.length,
    1,
  )
  assert.equal(
    (await third.agent.get(`/api/programmes/${p.id}/projects`).expect(200)).body.projects.length,
    0,
  )
})
test('judging follows rubric, rejects self-scoring and hides scores until release', async () => {
  const p = await programme({
    type: 'hackathon',
    event: {
      teamsEnabled: false,
      teamSize: 4,
      deadline: null,
      challenge: '',
      rules: '',
      criteria: [{ name: 'Creativity', maxScore: 10 }],
      resultsPublished: false,
    },
  })
  const participant = await client('learner')
  const judge = await client('instructor', 'judge')
  await approve(await apply(p.id, participant)).expect(200)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: judge.userId,
    role: 'judge',
  }).expect(200)
  const response = await mutate(participant, 'post', `/programmes/${p.id}/projects`, {
    title: 'Private project',
    description: 'Test',
    url: 'https://example.test/test',
  }).expect(201)
  const path = `/staff/programmes/${p.id}/projects/${response.body.id}/score`
  await mutate(judge, 'post', path, { values: [11], feedback: 'Out of range' }).expect(400)
  await mutate(judge, 'post', path, { values: [8], feedback: 'Useful feedback' }).expect(200)
  const hidden = await participant.agent.get(`/api/programmes/${p.id}/projects`).expect(200)
  assert.equal(hidden.body.projects[0].scores, undefined)
  await mutate(p.owner, 'put', `/staff/programmes/${p.id}`, {
    ...p.input,
    event: { ...p.input.event, resultsPublished: true },
  }).expect(200)
  const visible = await participant.agent.get(`/api/programmes/${p.id}/projects`).expect(200)
  assert.equal(visible.body.projects[0].scores[0].values[0], 8)
  assert.equal(visible.body.projects[0].scores[0].judgeId, '')
  await request(app).get(`/api/programmes/${p.id}/projects`).expect(401)
})
test('expired project deadlines and unsafe links are rejected', async () => {
  const p = await programme({
    type: 'hackathon',
    event: {
      teamsEnabled: false,
      teamSize: 4,
      deadline: new Date(Date.now() - 60000).toISOString(),
      challenge: '',
      rules: '',
      criteria: [],
      resultsPublished: false,
    },
  })
  const learner = await client('learner')
  await approve(await apply(p.id, learner)).expect(200)
  await mutate(learner, 'post', `/programmes/${p.id}/projects`, {
    title: 'Too late',
    description: 'Test',
    url: 'https://example.test',
  }).expect(409)
  const other = await programme({ type: 'hackathon' })
  await approve(await apply(other.id, learner)).expect(200)
  await mutate(learner, 'post', `/programmes/${other.id}/projects`, {
    title: 'Unsafe',
    description: 'Test',
    url: 'javascript:alert(1)',
  }).expect(400)
})
test('donation review distinguishes pending, received, verified and allocated without skipping', async () => {
  const saved = await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody('donation'), amountMinor: 15000 })
    .expect(201)
  const accountant = await client('finance')
  const path = `/staff/enquiries/${saved.body.id}`
  await mutate(accountant, 'patch', path, {
    status: 'verified',
    notes: 'Cannot skip receipt',
    assignedTo: null,
  }).expect(409)
  await mutate(accountant, 'patch', path, {
    status: 'received',
    notes: 'No receipt',
    assignedTo: null,
  }).expect(400)
  for (const status of ['received', 'verified', 'allocated'])
    await mutate(accountant, 'patch', path, {
      status,
      notes: `Recorded ${status}`,
      assignedTo: accountant.userId,
      receivedAmountMinor: 12000,
      receiptCurrency: 'KES',
      receiptReference: 'ISOLATED-TEST-RECEIPT',
    }).expect(200)
  const history = await accountant.agent.get(`/api${path}/history`).expect(200)
  assert.equal(history.body.history.length, 3)
  const overview = await accountant.agent.get('/api/staff/overview').expect(200)
  assert.equal(overview.body.money[0].amountMinor, 12000)
})
test('accepted partner enquiries can become private programme drafts, not duplicate records', async () => {
  const saved = await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send(publicBody('partner'))
    .expect(201)
  const manager = await client('manager')
  const path = `/staff/enquiries/${saved.body.id}`
  await mutate(manager, 'post', `${path}/convert`, fixture()).expect(409)
  await mutate(manager, 'patch', path, {
    status: 'accepted',
    notes: 'Scope agreed',
    assignedTo: manager.userId,
  }).expect(200)
  const converted = await mutate(manager, 'post', `${path}/convert`, fixture()).expect(201)
  assert.equal(converted.body.programme.status, 'draft')
  await request(app).get(`/api/programmes/${converted.body.programme.id}`).expect(404)
  await mutate(manager, 'post', `${path}/convert`, fixture()).expect(409)
  const outsider = await client('partner')
  await outsider.agent.get('/api/staff/enquiries?kind=partner').expect(403)
  await outsider.agent.get(`/api${path}/history`).expect(403)
})
test('CSV export neutralises formulas and records an audit event', async () => {
  await request(app)
    .post('/api/enquiries')
    .set('Origin', origin)
    .send({ ...publicBody(), name: '=HYPERLINK("https://example.test")' })
    .expect(201)
  const response = await (await client()).agent.get('/api/staff/export?kind=contact').expect(200)
  assert.match(response.text, /'=HYPERLINK/)
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM audit WHERE action='export.contact'").get()?.n,
    1,
  )
})
test('notification ownership is enforced', async () => {
  const p = await programme()
  const learner = await client('learner')
  await apply(p.id, learner)
  const notification = db
    .prepare('SELECT id FROM notifications WHERE user_id=?')
    .get(learner.userId)
  await mutate(
    await client('learner', 'other'),
    'post',
    `/notifications/${notification?.id}/read`,
  ).expect(404)
  await mutate(learner, 'post', `/notifications/${notification?.id}/read`).expect(200)
})
test('one-use recovery tokens revoke sessions and cannot be reused', async () => {
  const learner = await client('learner')
  const token = secret()
  db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').run(
    digest(token),
    learner.userId,
    Date.now() + 60000,
  )
  await request(app)
    .post('/api/auth/reset')
    .set('Origin', origin)
    .send({ token, password: 'A-new-test-password-902!' })
    .expect(200)
  await request(app)
    .post('/api/auth/reset')
    .set('Origin', origin)
    .send({ token, password: 'A-new-test-password-902!' })
    .expect(400)
  await learner.agent.get('/api/dashboard').expect(401)
})
test('paid fees are locked from the first application, even before approval', async () => {
  const p = await programme({
    funding: [
      {
        mode: 'paid',
        capacity: 3,
        feeMinor: 10000,
        currency: 'KES',
        sponsor: '',
        committedMinor: 0,
        receivedMinor: 0,
        budgetMinor: 0,
        awardMinor: 0,
      },
    ],
  })
  await apply(p.id, await client('learner'), { mode: 'paid' })
  await mutate(p.owner, 'put', `/staff/programmes/${p.id}`, {
    ...p.input,
    funding: [{ ...p.input.funding[0], feeMinor: 20000 }],
  }).expect(409)
})
test('approval checks existing cross-programme schedule conflicts', async () => {
  const first = await programme()
  const second = await programme()
  const data = {
    title: 'Overlapping session',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: '',
    joiningUrl: '',
  }
  for (const p of [first, second])
    await mutate(p.owner, 'post', `/staff/programmes/${p.id}/schedule`, data).expect(201)
  const learner = await client('learner')
  await approve(await apply(first.id, learner)).expect(200)
  await approve(await apply(second.id, learner)).expect(409)
})
test('provider assignment cannot introduce an existing schedule conflict', async () => {
  const first = await programme()
  const second = await programme()
  const data = {
    title: 'Overlapping session',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: '',
    joiningUrl: '',
  }
  for (const p of [first, second])
    await mutate(p.owner, 'post', `/staff/programmes/${p.id}/schedule`, data).expect(201)
  const provider = await client('instructor')
  await mutate(first.owner, 'post', `/staff/programmes/${first.id}/assignments`, {
    userId: provider.userId,
    role: 'instructor',
  }).expect(200)
  await mutate(second.owner, 'post', `/staff/programmes/${second.id}/assignments`, {
    userId: provider.userId,
    role: 'instructor',
  }).expect(409)
})
test('judges cannot score their own project and a scored rubric cannot be changed', async () => {
  const p = await programme({
    type: 'hackathon',
    event: {
      teamsEnabled: false,
      teamSize: 4,
      deadline: null,
      challenge: '',
      rules: '',
      criteria: [{ name: 'Creativity', maxScore: 10 }],
      resultsPublished: false,
    },
  })
  const judge = await client('instructor')
  await approve(await apply(p.id, judge)).expect(200)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: judge.userId,
    role: 'judge',
  }).expect(200)
  const project = await mutate(judge, 'post', `/programmes/${p.id}/projects`, {
    title: 'Self project',
    description: 'Test',
    url: 'https://example.test',
  }).expect(201)
  await mutate(judge, 'post', `/staff/programmes/${p.id}/projects/${project.body.id}/score`, {
    values: [9],
    feedback: 'Own score',
  }).expect(403)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/projects/${project.body.id}/score`, {
    values: [8],
    feedback: 'Other judge',
  }).expect(200)
  await mutate(p.owner, 'put', `/staff/programmes/${p.id}`, {
    ...p.input,
    event: { ...p.input.event, criteria: [{ name: 'Different rubric', maxScore: 100 }] },
  }).expect(409)
})
test('team invitations do not work in another event and duplicate memberships are blocked', async () => {
  const event = {
    teamsEnabled: true,
    teamSize: 4,
    deadline: null,
    challenge: '',
    rules: '',
    criteria: [],
    resultsPublished: false,
  }
  const first = await programme({ type: 'hackathon', event })
  const second = await programme({ type: 'hackathon', event })
  const leader = await client('learner', 'leader')
  const other = await client('learner', 'other')
  await approve(await apply(first.id, leader)).expect(200)
  await approve(await apply(second.id, other)).expect(200)
  await mutate(leader, 'post', `/programmes/${first.id}/team`, { name: 'First event team' }).expect(
    201,
  )
  const code = (await leader.agent.get(`/api/programmes/${first.id}/team`).expect(200)).body.team
    .joinCode
  await mutate(other, 'post', `/programmes/${second.id}/team`, { joinCode: code }).expect(404)
  await mutate(leader, 'post', `/programmes/${first.id}/team`, { name: 'Duplicate team' }).expect(
    409,
  )
})
test('foreign and unpublished lesson IDs cannot be used to fabricate progress', async () => {
  const first = await programme()
  const second = await programme()
  const learner = await client('learner')
  await approve(await apply(first.id, learner)).expect(200)
  const foreign = await lesson(second.id)
  const draft = await lesson(first.id, undefined, false)
  for (const lessonId of [foreign, draft])
    await mutate(learner, 'post', `/programmes/${first.id}/lessons/${lessonId}/complete`).expect(
      404,
    )
  assert.equal(db.prepare('SELECT count(*) AS n FROM progress').get()?.n, 0)
})
test('guardian details and consent cannot be omitted from a child application', async () => {
  const p = await programme()
  const guardian = await client('learner')
  const response = await mutate(guardian, 'post', `/programmes/${p.id}/apply`, {
    participantName: 'Child',
    ageBand: '6-12',
    mode: 'free',
    guardianConsent: false,
  }).expect(400)
  assert.ok(
    response.body.fields.some((issue: { field: string }) => issue.field === 'guardianConsent'),
  )
})
test('attendance uses approved participants and the programme own sessions', async () => {
  const p = await programme()
  const learner = await client('learner')
  const data = {
    title: 'Attendance test',
    startsAt: '2027-01-03T08:00:00Z',
    endsAt: '2027-01-03T09:00:00Z',
    location: '',
    joiningUrl: '',
  }
  const session = await mutate(p.owner, 'post', `/staff/programmes/${p.id}/schedule`, data).expect(
    201,
  )
  const payload = { sessionId: session.body.id, userId: learner.userId, status: 'present' }
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/attendance`, payload).expect(400)
  await approve(await apply(p.id, learner)).expect(200)
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/attendance`, payload).expect(200)
  const report = await p.owner.agent.get(`/api/staff/programmes/${p.id}/report`).expect(200)
  assert.equal(report.body.attended, 1)
  await learner.agent.get(`/api/staff/programmes/${p.id}/attendance`).expect(403)
})
test('demoting staff revokes sessions and old assignments cannot retain provider access', async () => {
  const p = await programme()
  const provider = await client('instructor')
  await mutate(p.owner, 'post', `/staff/programmes/${p.id}/assignments`, {
    userId: provider.userId,
    role: 'instructor',
  }).expect(200)
  await provider.agent.get(`/api/programmes/${p.id}/lessons`).expect(200)
  await mutate(p.owner, 'patch', `/staff/users/${provider.userId}`, {
    email: 'instructor@example.test',
    role: 'learner',
  }).expect(200)
  await provider.agent.get(`/api/programmes/${p.id}/lessons`).expect(401)
  const signedIn = await provider.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'instructor@example.test', password: testPassword })
    .expect(200)
  provider.csrf = String(signedIn.body.csrf)
  await provider.agent.get(`/api/programmes/${p.id}/lessons`).expect(403)
  await provider.agent.get('/api/staff/programmes').expect(403)
  assert.equal((await provider.agent.get('/api/dashboard').expect(200)).body.assigned.length, 0)
})
test('account deletion verifies password and cascades private learning records', async () => {
  const p = await programme()
  const learner = await client('learner')
  await approve(await apply(p.id, learner)).expect(200)
  const lessonId = await lesson(p.id)
  await mutate(learner, 'post', `/programmes/${p.id}/lessons/${lessonId}/complete`).expect(200)
  await mutate(learner, 'delete', '/account', { password: 'incorrect' }).expect(403)
  await mutate(learner, 'delete', '/account', { password: testPassword }).expect(200)
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM applications WHERE user_id=?').get(learner.userId)?.n,
    0,
  )
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM progress WHERE user_id=?').get(learner.userId)?.n,
    0,
  )
  await learner.agent.get('/api/dashboard').expect(401)
})
