import { NextApiRequest, NextApiResponse } from 'next'
import { pool } from '../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { uuid } = req.query

  if (!uuid || typeof uuid !== 'string') {
    return res.status(400).json({ message: 'Missing or invalid UUID' })
  }

  try {
    const result = await pool.query('SELECT status FROM tasks WHERE uuid = $1', [uuid])
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' })
    }
    const { status } = result.rows[0]

    let downloadUrl = null
    if (status === 'done') {
      downloadUrl = `/api/download?uuid=${uuid}`
    }

    return res.status(200).json({ status, downloadUrl })
  } catch (error) {
    console.error('Błąd w status:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
