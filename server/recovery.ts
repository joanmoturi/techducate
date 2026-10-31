import { parseArgs } from 'node:util'
import { createSnapshot, restoreSnapshot, verifySnapshot } from './recovery-service.ts'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { source: { type: 'string' }, destination: { type: 'string' } },
})
const source = values.source ?? process.env.DATABASE_PATH ?? './data/techducate.sqlite'
if (positionals[0] === 'verify') console.log(JSON.stringify(verifySnapshot(source)))
else if (['backup', 'restore'].includes(positionals[0] ?? '') && values.destination) {
  const operation = positionals[0] === 'backup' ? createSnapshot : restoreSnapshot
  console.log(JSON.stringify(await operation(source, values.destination)))
} else
  throw new Error(
    'Use backup|restore --source <existing-database> --destination <new-private-directory>, or verify --source <database>. No existing destination is overwritten.',
  )
