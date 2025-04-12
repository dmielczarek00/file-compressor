import { pool } from './db'

export async function setupCompressionJobsTable() {
  const client = await pool.connect()

  try {
    const checkTableExists = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'compression_jobs'
      );
    `

    const res = await client.query(checkTableExists)
    const exists = res.rows[0].exists

    if (!exists) {
      console.log('Creating compression_jobs table...')

      const createTable = `
        CREATE TABLE compression_jobs (
          uuid UUID PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
          compression_algorithm TEXT NOT NULL,
          compression_params JSONB,
          heartbeat TIMESTAMPTZ,
          retry_count INTEGER NOT NULL DEFAULT 0
        );
      `
      await client.query(createTable)

      // Dodanie indeksów
      const createIndexes = `
        CREATE INDEX idx_compression_jobs_status ON compression_jobs (status);
        CREATE INDEX idx_compression_jobs_heartbeat ON compression_jobs (heartbeat);
      `
      await client.query(createIndexes)

      console.log('Table and indexes created ✅')
    } else {
      console.log('compression_jobs table already exists ✅')
    }
  } catch (error) {
    console.error('Error setting up compression_jobs table:', error)
  } finally {
    client.release()
  }
}
