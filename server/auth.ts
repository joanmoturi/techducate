import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Request, Response, NextFunction } from 'express'
import type { Database } from './db.ts'
import type { User } from '../shared/domain.ts'
import { permissions } from '../shared/operations.ts'

const derive = promisify(scrypt)
export const digest = (token: string) => createHash('sha256').update(token).digest('hex')
export const secret = () => randomBytes(32).toString('hex')
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await derive(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password: string, stored?: string) {
  const [salt, expected] = (stored ?? 'dummy:00').split(':')
  const actual = (await derive(password, salt, 64)) as Buffer
  const target = Buffer.from(expected, 'hex')
  return target.length === actual.length && timingSafeEqual(target, actual)
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
interface Identity {
  user: User
  csrf: string
}
export function authentication(db: Database, secure: boolean) {
  const identities = new WeakMap<Request, Identity>()
  function grants(userId: string): NonNullable<User['permissions']> {
    return permissions.filter(
      (permission) =>
        !!db
          .prepare('SELECT 1 FROM permissions WHERE user_id=? AND permission=?')
          .get(userId, permission),
    )
  }
  const cookie = {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 1000 * 60 * 60 * 12,
  }
  function middleware(req: Request, _res: Response, next: NextFunction) {
    const token: unknown = req.cookies?.['techducate_session']
    if (typeof token === 'string' && token.length === 64) {
      const record = db
        .prepare(
          `SELECT u.id,u.name,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(digest(token), Date.now())
      if (record)
        identities.set(req, {
          user: {
            id: String(record.id),
            name: String(record.name),
            email: String(record.email),
            role: String(record.role) as User['role'],
            permissions: grants(String(record.id)),
          },
          csrf: String(record.csrf),
        })
    }
    next()
  }
  function user(req: Request) {
    const identity = identities.get(req)
    if (!identity) throw new HttpError(401, 'Please sign in to continue.')
    return identity.user
  }
  function requireRole(req: Request, allowed: readonly User['role'][]) {
    const account = user(req)
    if (!allowed.includes(account.role))
      throw new HttpError(403, 'You do not have permission for this action.')
    return account
  }
  function csrf(req: Request, _res: Response, next: NextFunction) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const identity = identities.get(req)
      if (identity && req.headers['x-csrf-token'] !== identity.csrf)
        throw new HttpError(403, 'Your session changed. Refresh the page and try again.')
    }
    next()
  }
  function establish(res: Response, userId: string) {
    const token = secret()
    const csrfToken = secret()
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now())
    db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(
      digest(token),
      userId,
      csrfToken,
      Date.now() + cookie.maxAge,
    )
    res.cookie('techducate_session', token, cookie)
    return csrfToken
  }
  function logout(req: Request, res: Response) {
    const token: unknown = req.cookies?.['techducate_session']
    if (typeof token === 'string')
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token))
    res.clearCookie('techducate_session', { ...cookie, maxAge: undefined })
  }
  return {
    grants,
    middleware,
    user,
    requireRole,
    csrf,
    establish,
    logout,
    identity: (req: Request) => identities.get(req),
  }
}
