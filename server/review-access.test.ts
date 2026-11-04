import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from './app.ts'
import { openDatabase, type Database } from './db.ts'

const origin = 'https://review.example.test'
const access = { username: 'reviewer', password: 'Only-an-isolated-test-password-593!' }
let db: Database
let directory: string
let app: ReturnType<typeof createApp>
beforeEach(() => {
  db = openDatabase(':memory:')
  directory = mkdtempSync(join(tmpdir(), 'techducate-review-gate-'))
  writeFileSync(join(directory, 'index.html'), '<html><body>Private review fixture</body></html>')
  writeFileSync(join(directory, 'fixture.js'), 'const fixture = true')
  app = createApp(db, { origin, staticDirectory: directory, reviewAccess: access })
})
afterEach(() => {
  db.close()
  rmSync(directory, { recursive: true })
})
test('review gate protects every route, static asset and API before request processing', async () => {
  for (const path of ['/', '/dashboard', '/fixture.js', '/api/health', '/api/settings']) {
    const response = await request(app).get(path).expect(401)
    assert.match(response.headers['www-authenticate'], /^Basic /)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.match(response.headers['x-robots-tag'], /noindex/)
    assert.doesNotMatch(response.text, /Private review fixture|const fixture/)
  }
  await request(app).post('/api/auth/register').type('json').send('{').expect(401)
  await request(app).head('/fixture.js').expect(401)
  await request(app).options('/api/health').expect(401)
})
test('wrong, malformed and oversized gate credentials cannot bypass protection', async () => {
  for (const header of [
    'Bearer unrelated',
    'Basic !!!',
    `Basic ${Buffer.from('reviewer:wrong-password').toString('base64')}`,
    `Basic ${Buffer.from(`other:${access.password}`).toString('base64')}`,
    `Basic ${'a'.repeat(1100)}`,
  ])
    await request(app).get('/api/health').set('Authorization', header).expect(401)
})
test('correct gate credentials reveal the review notice flag but retain application authorization', async () => {
  await request(app).get('/').auth(access.username, access.password).expect(200)
  await request(app).get('/fixture.js').auth(access.username, access.password).expect(200)
  const settings = await request(app)
    .get('/api/settings')
    .auth(access.username, access.password)
    .expect(200)
  assert.equal(settings.body.reviewMode, true)
  assert.equal(settings.headers['cache-control'], 'no-store')
  assert.doesNotMatch(JSON.stringify(settings.body), new RegExp(access.password))
  await request(app).get('/api/staff/programmes').auth(access.username, access.password).expect(401)
  await request(app)
    .post('/api/auth/login')
    .auth(access.username, access.password)
    .set('Origin', 'https://unrelated.example.test')
    .send({ email: 'nobody@example.test', password: 'unrelated' })
    .expect(403)
})
test('gate is opt-in and partial or weak review configuration fails closed', async () => {
  const normal = createApp(db, { origin })
  await request(normal).get('/api/health').expect(200)
  const settings = await request(normal).get('/api/settings').expect(200)
  assert.equal(settings.body.reviewMode, false)
  assert.throws(() =>
    createApp(db, { origin, reviewAccess: { username: 'reviewer', password: '' } }),
  )
})
test('expired reviews deny pages, assets and APIs even with correct credentials', async () => {
  const expired = createApp(db, {
    origin,
    staticDirectory: directory,
    reviewAccess: { ...access, expiresAt: '2020-01-01T00:00:00.000Z' },
  })
  for (const path of ['/', '/fixture.js', '/api/health']) {
    const response = await request(expired)
      .get(path)
      .auth(access.username, access.password)
      .expect(410)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.doesNotMatch(response.text, /Private review fixture|const fixture/)
  }
})
test('a future review deadline permits access and invalid deadlines fail closed', async () => {
  const active = createApp(db, {
    origin,
    reviewAccess: { ...access, expiresAt: new Date(Date.now() + 60_000).toISOString() },
  })
  await request(active).get('/api/health').auth(access.username, access.password).expect(200)
  assert.throws(() =>
    createApp(db, { origin, reviewAccess: { ...access, expiresAt: 'not-a-date' } }),
  )
})
