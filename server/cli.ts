import { parseArgs } from 'node:util'
import { openDatabase, audit, id, transaction } from './db.ts'
import { digest, hashPassword, secret } from './auth.ts'
import { email, passwordSchema, roles } from '../shared/domain.ts'
import { z } from 'zod'
import { permissions } from '../shared/operations.ts'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    permission: { type: 'string' },
    revoke: { type: 'boolean', default: false },
  },
})
const db = openDatabase(process.env.DATABASE_PATH ?? './data/techducate.sqlite')
try {
  const command = positionals[0]
  if (command === 'migrate') {
    console.log('Database migrations 001–003 applied or already current.')
  } else if (command === 'create') {
    const address = email.parse(values.email)
    const password = passwordSchema.parse(process.env.STAFF_PASSWORD)
    const role = z.enum(roles).parse(values.role ?? 'admin')
    const userId = id()
    const hash = await hashPassword(password)
    db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
      userId,
      values.name ?? 'Techducate team',
      address,
      hash,
      role,
    )
    audit(db, userId, 'staff.created-via-cli', userId)
    console.log(
      `Created ${role} account. No credentials were printed. Clear STAFF_PASSWORD from your environment.`,
    )
  } else if (command === 'role') {
    const address = email.parse(values.email)
    const role = z.enum(roles).parse(values.role)
    const row = db.prepare('SELECT id,role FROM users WHERE email=?').get(address)
    if (!row) throw new Error('No account exists for this email.')
    if (
      row.role === 'admin' &&
      role !== 'admin' &&
      Number(db.prepare("SELECT count(*) AS n FROM users WHERE role='admin'").get()?.n) <= 1
    )
      throw new Error('At least one administrator is required.')
    transaction(db, () => {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(role, row.id)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
      audit(db, String(row.id), `staff.role-via-cli.${role}`, String(row.id))
    })
    console.log('Role updated and existing sessions revoked.')
  } else if (command === 'permission') {
    const address = email.parse(values.email)
    const permission = z.enum(permissions).parse(values.permission)
    const row = db.prepare('SELECT id,role FROM users WHERE email=?').get(address)
    if (!row) throw new Error('No account exists for this email.')
    const allowed =
      permission === 'safeguarding' ? ['admin', 'manager', 'instructor'] : ['admin', 'finance']
    if (!values.revoke && !allowed.includes(String(row.role)))
      throw new Error('This permission is not valid for the account’s current role.')
    transaction(db, () => {
      if (values.revoke)
        db.prepare('DELETE FROM permissions WHERE user_id=? AND permission=?').run(
          row.id,
          permission,
        )
      else
        db.prepare('INSERT OR IGNORE INTO permissions(user_id,permission) VALUES(?,?)').run(
          row.id,
          permission,
        )
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
      audit(
        db,
        null,
        `permission.${permission}.${values.revoke ? 'revoked' : 'granted'}-via-cli`,
        String(row.id),
      )
    })
    console.log(
      'Explicit permission updated; all sessions for this account revoked. Record organisational authorisation separately.',
    )
  } else if (command === 'recover') {
    const address = email.parse(values.email)
    const row = db.prepare('SELECT id FROM users WHERE email=?').get(address)
    if (!row) throw new Error('No account exists for this email.')
    const token = secret()
    transaction(db, () => {
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.id)
      db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').run(
        digest(token),
        row.id,
        Date.now() + 30 * 60 * 1000,
      )
      audit(db, String(row.id), 'account.recovery-issued-via-cli', String(row.id))
    })
    console.log(
      `Verify account ownership through an approved offline process, then securely deliver this one-use link (expires in 30 minutes):\n${process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173'}/reset#${token}`,
    )
  } else if (command === 'retention') {
    const settings = JSON.parse(
      String(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data),
    ) as { retentionDays: number }
    const before = new Date(Date.now() - settings.retentionDays * 86400000).toISOString()
    const rows = db
      .prepare(
        "SELECT id,kind,status,created_at FROM enquiries WHERE created_at<? AND status IN ('closed','declined','completed')",
      )
      .all(before)
    console.log(
      `Retention review only; nothing deleted. ${rows.length} closed records exceed the configured retention period. Review in the admin dashboard and delete individually after checking financial/legal holds.`,
    )
    for (const row of rows) console.log(`${row.id} ${row.kind} ${row.status} ${row.created_at}`)
  } else {
    throw new Error(
      'Commands: migrate | create --email <email> --name <name> --role <role> (STAFF_PASSWORD required) | role --email <email> --role <role> | permission --email <email> --permission safeguarding|finance-approver [--revoke] | recover --email <email> | retention',
    )
  }
} finally {
  db.close()
}
