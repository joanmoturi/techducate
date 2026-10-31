import { applicationSchema, programmeSchema } from '../shared/domain.ts'
import { operationsSchema, providerSchema, screeningSchema } from '../shared/operations.ts'
import type { Database } from './db.ts'
import { HttpError } from './auth.ts'

export function policy(db: Database, programmeId: string) {
  const row = db
    .prepare('SELECT data FROM programme_operations WHERE programme_id=?')
    .get(programmeId)
  return operationsSchema.parse(row ? JSON.parse(String(row.data)) : {})
}
export function consentValid(
  db: Database,
  applicationId: string,
  purpose: string,
  version: string,
) {
  const row = db
    .prepare(
      'SELECT * FROM consents WHERE application_id=? AND purpose=? ORDER BY sequence DESC LIMIT 1',
    )
    .get(applicationId, purpose)
  return (
    !!row &&
    row.granted === 1 &&
    row.notice_version === version &&
    !!row.verified_by &&
    !!row.verified_at &&
    Date.parse(String(row.valid_until)) > Date.now()
  )
}
export function participationReady(db: Database, applicationId: string) {
  const a = db.prepare('SELECT * FROM applications WHERE id=?').get(applicationId)
  if (!a) return false
  const details = applicationSchema.parse(JSON.parse(String(a.data)))
  if (details.ageBand === '18+') return true
  const config = policy(db, String(a.programme_id))
  const guardian = db
    .prepare('SELECT * FROM guardian_details WHERE application_id=?')
    .get(applicationId)
  return (
    !!guardian &&
    (!config.emergencyRequired || (!!guardian.emergency_name && !!guardian.emergency_phone)) &&
    consentValid(db, applicationId, 'participation', config.noticeVersion)
  )
}
export function screeningReady(db: Database, userId: string) {
  const profile = db.prepare('SELECT data FROM provider_profiles WHERE user_id=?').get(userId)
  const screening = db
    .prepare('SELECT data,reviewed_by FROM provider_screening WHERE user_id=?')
    .get(userId)
  if (!profile || !screening?.reviewed_by) return false
  const p = providerSchema.parse(JSON.parse(String(profile.data)))
  const s = screeningSchema.parse(JSON.parse(String(screening.data)))
  return (
    p.stage === 'active' &&
    p.orientationComplete &&
    s.status === 'cleared' &&
    !!s.validUntil &&
    !!s.trainingDate &&
    Date.parse(s.validUntil) > Date.now() &&
    s.trainingDate <= new Date().toISOString().slice(0, 10)
  )
}
export function needsScreening(db: Database, programmeId: string) {
  const row = db.prepare('SELECT data FROM programmes WHERE id=?').get(programmeId)
  if (!row) throw new HttpError(404, 'Programme not found.')
  const p = programmeSchema.parse(JSON.parse(String(row.data)))
  return (
    policy(db, programmeId).screeningRequired ||
    ['children', 'youth'].includes(p.audience) ||
    !!db
      .prepare(
        "SELECT 1 FROM applications WHERE programme_id=? AND status='approved' AND json_extract(data,'$.ageBand')!='18+'",
      )
      .get(programmeId)
  )
}
export function ensureProviderReady(db: Database, programmeId: string, userId: string) {
  const profile = db.prepare('SELECT data FROM provider_profiles WHERE user_id=?').get(userId)
  if (profile && providerSchema.parse(JSON.parse(String(profile.data))).stage === 'departed')
    throw new HttpError(
      403,
      'This provider has departed. Review their engagement before assigning access.',
    )
  if (needsScreening(db, programmeId) && !screeningReady(db, userId))
    throw new HttpError(
      403,
      'Current safeguarding clearance, training, orientation and active engagement are required.',
    )
}
export function providerReady(db: Database, programmeId: string, userId: string) {
  const profile = db.prepare('SELECT data FROM provider_profiles WHERE user_id=?').get(userId)
  return (
    (!profile || providerSchema.parse(JSON.parse(String(profile.data))).stage !== 'departed') &&
    (!needsScreening(db, programmeId) || screeningReady(db, userId))
  )
}
export function missingReadiness(db: Database, programmeId: string, status: string) {
  if (!['open', 'full', 'scheduled', 'closed', 'running', 'completed'].includes(status)) return []
  const required = ['running', 'completed'].includes(status) ? ['open', 'running'] : ['open']
  return policy(db, programmeId).readiness.filter(
    (item) => required.includes(item.requiredBefore) && !item.complete,
  )
}
export function ensureReadiness(db: Database, programmeId: string, status: string) {
  const missing = missingReadiness(db, programmeId, status)
  if (missing.length)
    throw new HttpError(
      409,
      `Complete mandatory readiness items: ${missing.map((r) => r.title).join(', ')}.`,
    )
}
