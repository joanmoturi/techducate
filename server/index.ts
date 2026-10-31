import { openDatabase } from './db.ts'
import { createApp } from './app.ts'
import { resolve, sep } from 'node:path'
import { reviewAccessSchema } from './review-access.ts'

const production = process.env.NODE_ENV === 'production'
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173'
const publicUrl = new URL(origin)
if (publicUrl.origin !== origin)
  throw new Error('APP_ORIGIN must be an origin without a path or trailing slash.')
if (production && publicUrl.protocol !== 'https:')
  throw new Error('Production APP_ORIGIN must use HTTPS.')
const reviewConfigured =
  process.env.REVIEW_USERNAME !== undefined || process.env.REVIEW_PASSWORD !== undefined
const reviewAccess = reviewConfigured
  ? reviewAccessSchema.parse({
      username: process.env.REVIEW_USERNAME,
      password: process.env.REVIEW_PASSWORD,
    })
  : undefined
const databasePath = process.env.DATABASE_PATH ?? './data/techducate.sqlite'
if (resolve(databasePath).startsWith(`${resolve('./dist')}${sep}`))
  throw new Error('The database must be outside the publicly served dist directory.')
const db = openDatabase(databasePath)
const app = createApp(db, {
  origin,
  production,
  trustProxy: process.env.TRUST_PROXY === '1',
  staticDirectory: './dist',
  reviewAccess,
})
const server = app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1', () => {
  console.log(
    `Techducate API ready on ${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 3001}`,
  )
})
function stop() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
