import { openDatabase, id } from '../server/db.ts'
import { createApp } from '../server/app.ts'
import { hashPassword } from '../server/auth.ts'
import { programmeService } from '../server/programmes.ts'
import { programmeSchema, type User } from '../shared/domain.ts'

// Only this isolated browser-test server gets fixtures. The real server never seeds content.
const db = openDatabase(':memory:')
const account: User = {
  id: id(),
  name: 'Test administrator',
  email: 'admin@example.test',
  role: 'admin',
}
db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
  account.id,
  account.name,
  account.email,
  await hashPassword('Browser-test-only-597!'),
  account.role,
)
db.prepare('INSERT INTO permissions VALUES(?,?)').run(account.id, 'safeguarding')
for (const role of ['manager', 'finance', 'instructor'] as const) {
  const userId = id()
  db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(
    userId,
    `Test ${role}`,
    `${role}@example.test`,
    await hashPassword('Browser-test-only-597!'),
    role,
  )
  if (role === 'finance')
    db.prepare('INSERT INTO permissions VALUES(?,?)').run(userId, 'finance-approver')
}
const service = programmeService(db, () => account)
const p = service.save(
  programmeSchema.parse({
    title: 'Test: Creative coding',
    summary: 'Browser test programme. Not a real opportunity.',
    description: 'Learn to create a simple project in an isolated browser test.',
    type: 'course',
    topic: 'coding',
    audience: 'all',
    delivery: 'virtual',
    status: 'open',
    funding: [
      { mode: 'free', capacity: 100 },
      { mode: 'scholarship', capacity: 10 },
    ],
  }),
  account,
)
db.prepare(
  'INSERT INTO lessons(id,programme_id,title,module,body,position,published) VALUES(?,?,?,?,?,?,?)',
).run(
  id(),
  p.id,
  'Test: Your first idea',
  'Getting started',
  'Think of something you want to make. Write down one small first step.',
  0,
  1,
)
const app = createApp(db, {
  origin: 'http://127.0.0.1:4173',
  staticDirectory: './dist',
  rateLimit: 10000,
})
const server = app.listen(4173, '127.0.0.1', () =>
  console.log('Isolated browser test server ready'),
)
process.on('SIGTERM', () =>
  server.close(() => {
    db.close()
    process.exit(0)
  }),
)
