import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { redisClient } from '@/lib/redis'

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT uuid, status, original_name FROM compression_jobs ORDER BY created_at DESC LIMIT 100'
    )

    const tasks = await Promise.all(result.rows.map(async (row) => {

      return {
        uuid: row.uuid,
        fileName: row.original_name,
        status: row.status
      }
    }))

    return NextResponse.json({ tasks }, { status: 200 })
  } catch (error) {
    console.error('Błąd przy pobieraniu zadań:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
