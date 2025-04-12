import { NextRequest, NextResponse } from 'next/server'
import { pool } from '../../../lib/db'

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid');

  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ message: 'Missing or invalid UUID' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      'SELECT status, original_name FROM compression_jobs WHERE uuid = $1', 
      [uuid]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }

    const { status, file_name } = result.rows[0]


    let downloadUrl = null
    if (status === 'finished') {
      downloadUrl = `/api/download?uuid=${uuid}&name=${file_name}`
    }

    return NextResponse.json({ 
      status, 
      fileName: file_name, 
      downloadUrl 
    }, { status: 200 });
  } catch (error) {
    console.error('Błąd w status:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
