import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  applicationSchema,
  lessonSchema,
  programmeSchema,
  publicFormSchema,
  settingsSchema,
  type User,
} from '../shared/domain.ts'
import { awardSchema, providerSchema, sourceSchema } from '../shared/operations.ts'
import { hashPassword } from './auth.ts'
import { audit, id, openDatabase, transaction } from './db.ts'
import { programmeService } from './programmes.ts'

const { values } = parseArgs({ options: { credentials: { type: 'string' } } })
if (process.env.NODE_ENV === 'production')
  throw new Error('Review fixtures must be provisioned locally, never in the production process.')
if (!values.credentials || !isAbsolute(values.credentials))
  throw new Error(
    'Supply --credentials with an absolute path in a private directory outside the project.',
  )
const credentialPath = resolve(values.credentials)
const credentialRelative = relative(resolve('.'), credentialPath)
if (
  credentialRelative !== '..' &&
  !credentialRelative.startsWith(`..${sep}`) &&
  !isAbsolute(credentialRelative)
)
  throw new Error('The credential file must be outside the project and its served assets.')
const databasePath = resolve('./data/review.sqlite')
if (existsSync(databasePath) || existsSync(credentialPath))
  throw new Error('Review database or credential file already exists. Nothing was overwritten.')
if (!existsSync(dirname(credentialPath)))
  throw new Error('Create and restrict access to the private credential directory first.')

const specifications = [
  { key: 'admin', label: 'Administrator', role: 'admin', permissions: [] },
  { key: 'manager', label: 'Programme manager', role: 'manager', permissions: [] },
  { key: 'finance', label: 'Finance proposer', role: 'finance', permissions: [] },
  {
    key: 'approver',
    label: 'Independent financial approver',
    role: 'finance',
    permissions: ['finance-approver'],
  },
  {
    key: 'safeguarding',
    label: 'Safeguarding officer',
    role: 'manager',
    permissions: ['safeguarding'],
  },
  { key: 'instructor', label: 'Instructor', role: 'instructor', permissions: [] },
  { key: 'learner', label: 'Adult learner', role: 'learner', permissions: [] },
  { key: 'guardian', label: 'Guardian (adult-managed account)', role: 'learner', permissions: [] },
  { key: 'partner', label: 'Partner (no partner portal)', role: 'partner', permissions: [] },
] satisfies {
  key: string
  label: string
  role: User['role']
  permissions: NonNullable<User['permissions']>
}[]
const accounts = specifications.map((specification) => ({
  ...specification,
  id: id(),
  name: `Review demo - ${specification.label}`,
  email: `${specification.key}@review.example.test`,
  password: randomBytes(18).toString('base64url'),
}))
const hashes = new Map<string, string>()
for (const account of accounts) hashes.set(account.id, await hashPassword(account.password))
function account(key: string) {
  const found = accounts.find((value) => value.key === key)
  if (!found) throw new Error(`Missing review account: ${key}`)
  return found
}
const db = openDatabase(databasePath)
try {
  transaction(db, () => {
    for (const user of accounts) {
      const hash = hashes.get(user.id)
      if (!hash) throw new Error('Missing generated password hash.')
      db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
        user.id,
        user.name,
        user.email,
        hash,
        user.role,
      )
      for (const permission of user.permissions)
        db.prepare('INSERT INTO permissions(user_id,permission) VALUES(?,?)').run(
          user.id,
          permission,
        )
      audit(db, null, 'review.synthetic-account.created', user.id)
    }
    db.prepare('UPDATE settings SET data=? WHERE id=1').run(
      JSON.stringify(
        settingsSchema.parse({
          legalName: 'Techducate - fictional client review copy',
          contactLocation: 'Review demonstration only - not a real venue',
          donationInstructions:
            'REVIEW ONLY. No payments are accepted. Use fictional information only.',
          safeguardingInstructions:
            'REVIEW ONLY. Do not enter real concerns or personal information. This preview is not an emergency service.',
        }),
      ),
    )
    const admin = account('admin')
    const service = programmeService(db, () => admin)
    const adult = service.save(
      programmeSchema.parse({
        title: 'Review demo: Creative coding for adults',
        summary:
          'A fictional course for testing enrolment, lessons, scheduling and instructor tools.',
        description:
          'CLIENT REVIEW FIXTURE ONLY. This is not a real programme or an invitation to attend. Use the adult learner account to explore the sample lesson and the instructor account to try delivery tools.',
        type: 'course',
        topic: 'coding',
        audience: 'adults',
        delivery: 'virtual',
        status: 'open',
        funding: [{ mode: 'free', capacity: 20 }],
      }),
      admin,
    )
    const child = service.save(
      programmeSchema.parse({
        title: 'Review demo: Guardian consent walkthrough',
        summary: 'Fictional child application, pending review. No real child or consent evidence.',
        description:
          'CLIENT REVIEW FIXTURE ONLY. Test the guardian declaration and separate safeguarding review. No verified consent, child screening or real participation is claimed. Use fictional evidence references only.',
        type: 'workshop',
        topic: 'digital-literacy',
        audience: 'children',
        delivery: 'virtual',
        status: 'open',
        funding: [{ mode: 'free', capacity: 10 }],
      }),
      admin,
    )
    db.prepare('INSERT INTO programme_staff(programme_id,user_id,role) VALUES(?,?,?)').run(
      adult.id,
      account('instructor').id,
      'instructor',
    )
    db.prepare('INSERT INTO provider_profiles(user_id,data) VALUES(?,?)').run(
      account('instructor').id,
      JSON.stringify(
        providerSchema.parse({
          stage: 'review',
          engagement: 'volunteer',
          skills: 'Review fixture: introductory coding',
          interests: 'Review fixture: adult learning',
          availability: 'Fictional review only',
          orientationComplete: false,
          feedback:
            'No screening, training or orientation is claimed. Assigned only to the adult review course.',
        }),
      ),
    )
    for (const [programme, owner, ageBand, status] of [
      [adult, account('learner'), '18+', 'approved'],
      [child, account('guardian'), '6-12', 'pending'],
    ] as const) {
      const applicationId = id()
      const input = applicationSchema.parse({
        mode: 'free',
        participantName: ageBand === '18+' ? 'Review fictional adult' : 'Review fictional child',
        ageBand,
        motivation: 'CLIENT REVIEW FIXTURE ONLY - not a real applicant.',
        ...(ageBand !== '18+'
          ? {
              guardianName: 'Review fictional guardian',
              guardianEmail: owner.email,
              guardianConsent: true,
            }
          : {}),
      })
      db.prepare(
        'INSERT INTO applications(id,programme_id,user_id,mode,data,status,notes) VALUES(?,?,?,?,?,?,?)',
      ).run(
        applicationId,
        programme.id,
        owner.id,
        'free',
        JSON.stringify(input),
        status,
        'CLIENT REVIEW FIXTURE ONLY. No real enrolment, consent or learning outcome.',
      )
      audit(db, null, 'review.synthetic-application.created', applicationId)
    }
    const lesson = lessonSchema.parse({
      title: 'Review demo: Your first project',
      module: 'Review demo: Getting started',
      body: 'This is a fictional review lesson. Think of one simple idea you would like to build, describe its intended user and write one small first step. Mark this sample lesson complete to test saved progress. This is not an assessed qualification.',
      position: 0,
      published: true,
    })
    db.prepare(
      'INSERT INTO lessons(id,programme_id,title,module,body,position,published) VALUES(?,?,?,?,?,?,?)',
    ).run(id(), adult.id, lesson.title, lesson.module, lesson.body, lesson.position, 1)
    for (const offset of [-1, 1]) {
      const start = Date.now() + offset * 24 * 60 * 60 * 1000
      db.prepare(
        'INSERT INTO scheduled_sessions(id,programme_id,title,starts_at,ends_at,location,joining_url) VALUES(?,?,?,?,?,?,?)',
      ).run(
        id(),
        adult.id,
        'Review demo: Practice session (not a real event)',
        new Date(start).toISOString(),
        new Date(start + 60 * 60 * 1000).toISOString(),
        'Fictional virtual classroom - no live meeting',
        '',
      )
    }
    const sourceId = id()
    const source = sourceSchema.parse({
      name: 'Review demo: Fictional funding source',
      kind: 'foundation',
    })
    db.prepare('INSERT INTO funding_sources(id,data,created_by) VALUES(?,?,?)').run(
      sourceId,
      JSON.stringify(source),
      admin.id,
    )
    const awardId = id()
    const award = awardSchema.parse({
      sourceId,
      reference: 'REVIEW-FICTIONAL-PLEDGE',
      title: 'Review demo: Unreceived fictional pledge',
      kind: 'grant',
      currency: 'KES',
      pledgedMinor: 100000,
      applicationStatus: 'preparing',
      conditions:
        'CLIENT REVIEW ONLY. Fictional pledge, no real donor, funding, award or payment. Nothing received or allocated.',
    })
    db.prepare(
      'INSERT INTO funding_awards(id,source_id,reference,data,created_by) VALUES(?,?,?,?,?)',
    ).run(awardId, sourceId, award.reference, JSON.stringify(award), admin.id)
    const enquiry = publicFormSchema.parse({
      kind: 'volunteer',
      name: 'Review demo: Fictional volunteer',
      email: 'volunteer@review.example.test',
      message:
        'CLIENT REVIEW ONLY. Fictional application for testing the volunteer review workflow.',
      consent: true,
      skills: 'Review fixture: coding',
      interests: 'Review fixture: teaching adults',
      availability: 'Review fixture only - not real availability',
    })
    db.prepare('INSERT INTO enquiries(id,kind,data) VALUES(?,?,?)').run(
      id(),
      enquiry.kind,
      JSON.stringify(enquiry),
    )
    audit(db, null, 'review.synthetic-fixtures.created', adult.id)
  })
  writeFileSync(
    credentialPath,
    JSON.stringify(
      {
        purpose:
          'Private fictional client review only. Never reuse these credentials for production.',
        databasePath,
        gate: { username: 'reviewer', password: randomBytes(24).toString('base64url') },
        accounts: accounts.map(({ label, email, password, role, permissions }) => ({
          label,
          email,
          password,
          role,
          permissions,
        })),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )
  console.log('Created a separate review database, nine accounts and labelled fictional fixtures.')
  console.log(
    'Credentials were saved to the supplied private file, not printed. The normal database was not modified.',
  )
} finally {
  db.close()
}
