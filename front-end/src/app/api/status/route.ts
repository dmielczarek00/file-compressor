import { NextRequest, NextResponse } from 'next/server'
import { pool } from '../../../lib/db'
import { redisClient } from '../../../lib/redis'
import { withMetrics } from '@/lib/withMetrics';

const rawHandler = async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid');

  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ message: 'Missing or invalid UUID' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      'SELECT status, original_name, heartbeat FROM compression_jobs WHERE uuid = $1', 
      [uuid]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }

    const { status, original_name, heartbeat } = result.rows[0]
    let queuePosition = '-'

    let downloadUrl = null
    if (status === 'finished') {
      const now = new Date();
      const diffInMinutes = (now.getTime() - heartbeat.getTime()) / (1000 * 60);
      if (diffInMinutes <= Number(process.env.FILE_DOWNLOAD_TTL_MINUTES)){
        downloadUrl = `/api/download?uuid=${uuid}&name=${original_name}`
      }
    }else{
      const position = await redisClient.lpos('compression_queue', uuid);
      if (position === null) {
        queuePosition = '-';
      } else {
        queuePosition = (Number(position) + 1).toString();
      }
    }

    return NextResponse.json({ 
      status, 
      fileName: original_name, 
      downloadUrl,
      queuePosition 
    }, { status: 200 });
  } catch (error) {
    console.error('Błąd w status:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withMetrics(rawHandler, '/api/status');