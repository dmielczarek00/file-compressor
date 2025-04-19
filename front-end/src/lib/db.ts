import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PG_FRONTEND_USER,
  password: process.env.PG_FRONTEND_PASSWORD,
})

export { pool }
