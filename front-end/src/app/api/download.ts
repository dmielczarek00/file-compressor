import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { uuid } = req.query
  if (!uuid || typeof uuid !== 'string') {
    return res.status(400).json({ message: 'Missing or invalid UUID' })
  }

  try {
    const nfsDonePath = process.env.NFS_DONE_PATH || '/mnt/nfs/done'

    const filePath = path.join(nfsDonePath, uuid + '.zip')

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' })
    }

    res.setHeader('Content-Disposition', `attachment; filename="${uuid}.zip"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)
  } catch (error) {
    console.error('Błąd w download:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
