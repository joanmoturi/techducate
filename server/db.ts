import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { settingsSchema } from '../shared/domain.ts'

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true })
  const db = new DatabaseSync(path, { timeout: 5000 })
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
  db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  for (const [version, file] of [
    [1, '001_initial.sql'],
    [2, '002_operations.sql'],
    [3, '003_operational_history.sql'],
  ] as const) {
    if (db.prepare('SELECT version FROM migrations WHERE version=?').get(version)) continue
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'))
      db.prepare('INSERT INTO migrations(version) VALUES(?)').run(version)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(
    JSON.stringify(settingsSchema.parse({})),
  )
  return db
}
export type Database = ReturnType<typeof openDatabase>
export const id = () => randomUUID()
export function transaction<T>(db: Database, work: () => T): T {
  const savepoint = db.isTransaction ? `sp_${id().replaceAll('-', '')}` : null
  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec(savepoint ? `RELEASE ${savepoint}` : 'COMMIT')
    return result
  } catch (error) {
    if (savepoint) {
      db.exec(`ROLLBACK TO ${savepoint}`)
      db.exec(`RELEASE ${savepoint}`)
    } else db.exec('ROLLBACK')
    throw error
  }
}
export function audit(db: Database, userId: string | null, action: string, resourceId: string) {
  db.prepare('INSERT INTO audit(id,user_id,action,resource_id) VALUES(?,?,?,?)').run(
    id(),
    userId,
    action,
    resourceId,
  )
}
export function notify(db: Database, userId: string, message: string) {
  db.prepare('INSERT INTO notifications(id,user_id,message) VALUES(?,?,?)').run(
    id(),
    userId,
    message,
  )
}
