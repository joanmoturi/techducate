import { backup, DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { id, openDatabase } from './db.ts'

export function verifySnapshot(path: string) {
  if (!statSync(path).isFile()) throw new Error('The source must be an existing database file.')
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if (
      db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Database integrity or foreign-key verification failed.')
    const version = Number(db.prepare('SELECT max(version) AS n FROM migrations').get()?.n)
    if (![1, 2, 3].includes(version))
      throw new Error('Unsupported or missing database migration version.')
    return {
      version,
      programmes: Number(db.prepare('SELECT count(*) AS n FROM programmes').get()?.n),
      accounts: Number(db.prepare('SELECT count(*) AS n FROM users').get()?.n),
    }
  } finally {
    db.close()
  }
}
export async function createSnapshot(source: string, destinationDirectory: string) {
  const normalize = (path: string) =>
    process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  const served = normalize('./dist')
  const destination = normalize(destinationDirectory)
  if (destination === served || destination.startsWith(`${served}${sep}`))
    throw new Error('Backups/restores must not be written into the publicly served dist directory.')
  verifySnapshot(source)
  // Reserving a new directory atomically prevents accidental overwrite or backup-in-place.
  mkdirSync(resolve(destinationDirectory), { mode: 0o700 })
  const output = join(resolve(destinationDirectory), 'techducate.sqlite')
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(db, output)
  } finally {
    db.close()
  }
  chmodSync(output, 0o600)
  return { path: output, ...verifySnapshot(output) }
}
export async function restoreSnapshot(source: string, destinationDirectory: string) {
  const snapshot = await createSnapshot(source, destinationDirectory)
  const db = openDatabase(snapshot.path)
  try {
    db.exec('BEGIN IMMEDIATE')
    db.exec('DELETE FROM sessions; DELETE FROM password_resets;')
    db.prepare('INSERT INTO audit(id,user_id,action,resource_id) VALUES(?,NULL,?,?)').run(
      id(),
      'recovery.restored-and-sessions-revoked',
      'database',
    )
    db.exec('COMMIT')
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
  return { path: snapshot.path, ...verifySnapshot(snapshot.path) }
}
