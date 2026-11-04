import { timingSafeEqual } from 'node:crypto'
import type { Express } from 'express'
import { z } from 'zod'
import { digest } from './auth.ts'

export const reviewAccessSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),
  password: z.string().min(20).max(128),
  expiresAt: z.iso.datetime().optional(),
})
export interface ReviewAccess extends z.infer<typeof reviewAccessSchema> {}

export function installReviewAccess(app: Express, access?: ReviewAccess) {
  if (!access) return
  const credentials = reviewAccessSchema.parse(access)
  const expected = Buffer.from(digest(`${credentials.username}:${credentials.password}`), 'hex')
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    if (credentials.expiresAt && Date.now() >= Date.parse(credentials.expiresAt)) {
      res.status(410).json({ error: 'This temporary client review has expired.' })
      return
    }
    const header = req.get('authorization') ?? ''
    const encoded = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header.slice(0, 1024))?.[1]
    if (header.length <= 1024 && encoded) {
      const actual = Buffer.from(digest(Buffer.from(encoded, 'base64').toString('utf8')), 'hex')
      if (timingSafeEqual(actual, expected)) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="Techducate private review", charset="UTF-8"')
    res.status(401).json({ error: 'Enter the private client-review access credentials.' })
  })
}
