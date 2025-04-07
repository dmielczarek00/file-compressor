import { NextApiRequest, NextApiResponse } from 'next'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../lib/db'
import { redisClient } from '../lib/redis'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { compressionType } = req.body
  if (!compressionType) {
    return res.status(400).json({ message: 'Missing compressionType in request body' })
  }

  try {
    const fileUuid = uuidv4()

    await pool.query(
      `INSERT INTO tasks (uuid, compression_type, status) VALUES ($1, $2, $3)`,
      [fileUuid, compressionType, 'pending']
    )

    const task = { uuid: fileUuid, compressionType }
    await redisClient.publish('compression_queue', JSON.stringify(task))

    return res.status(200).json({ uuid: fileUuid, message: 'Task submitted via REST API' })
  } catch (error) {
    console.error('Błąd w task API:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
