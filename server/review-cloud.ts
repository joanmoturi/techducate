import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reviewAccessSchema } from './review-access.ts'
import { verifySnapshot } from './recovery-service.ts'

reviewAccessSchema.required().parse({
  username: process.env.REVIEW_USERNAME,
  password: process.env.REVIEW_PASSWORD,
  expiresAt: process.env.REVIEW_EXPIRES_AT,
})
if (!process.env.RENDER_EXTERNAL_URL?.startsWith('https://'))
  throw new Error('The disposable cloud review requires a Render HTTPS origin.')

const directory = join(tmpdir(), 'techducate-cloud-review')
const database = join(directory, 'review.sqlite')
mkdirSync(directory, { recursive: true, mode: 0o700 })
if (!existsSync(database)) {
  const snapshot = readFileSync('/etc/secrets/techducate-review.sqlite.b64', 'utf8')
  writeFileSync(database, Buffer.from(snapshot, 'base64'), { flag: 'wx', mode: 0o600 })
}
verifySnapshot(database)
process.env.DATABASE_PATH = database
process.env.APP_ORIGIN = process.env.RENDER_EXTERNAL_URL
process.env.NODE_ENV = 'production'
process.env.HOST = '0.0.0.0'
process.env.TRUST_PROXY = '1'
await import('./index.ts')
