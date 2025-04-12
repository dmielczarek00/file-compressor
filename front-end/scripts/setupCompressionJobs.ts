import { setupCompressionJobsTable } from '../src/lib/setupCompressionJobsTable'
import { pool } from '../src/lib/db'

async function main() {
  await setupCompressionJobsTable()
  await pool.end()
  console.log('Setup complete ✅')
}

main().catch((err) => {
  console.error('Setup failed ❌', err)
  process.exit(1)
})