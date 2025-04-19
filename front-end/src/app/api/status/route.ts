import { NextRequest, NextResponse } from 'next/server'
import { pool } from '../../../lib/db'
import { redisClient } from '../../../lib/redis'
import { httpRequestCounter, httpRequestDuration, httpErrorCounter } from '@/lib/metrics'

export async function GET(req: NextRequest) {
  const end = httpRequestDuration.startTimer()
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

    const { status, original_name } = result.rows[0]
    let queuePosition = '-'

    let downloadUrl = null
    if (status === 'finished') {
      downloadUrl = `/api/download?uuid=${uuid}&name=${original_name}`
    }else{
      const position = await redisClient.lpos('compression_queue', uuid);
      if (position === null) {
        queuePosition = '-';
      } else {
        queuePosition = (Number(position) + 1).toString();
      }
    }
    end({ method: 'GET', route: '/api/status', status: '200' })

    await httpRequestCounter.inc({
      method: 'GET',
      route: '/api/status',
      status: '200',
    })

    return NextResponse.json({ 
      status, 
      fileName: original_name, 
      downloadUrl,
      queuePosition 
    }, { status: 200 });
  } catch (error) {
    console.error('Błąd w status:', error)

    await httpRequestCounter.inc({
      method: 'GET',
      route: '/api/status',
      status: '500',
    })
    httpErrorCounter.inc({ method: 'GET', route: '/api/status', status: '500' })

    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
