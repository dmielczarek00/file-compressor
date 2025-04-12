import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { promises as fsPromises } from 'fs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const uuid = url.searchParams.get('uuid')
  const OrginalFileNAme = url.searchParams.get('name')

  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ message: 'Missing or invalid UUID' }, { status: 400 })
  }

  try {
    const nfsDonePath = process.env.NFS_DONE_PATH!;

    const files = fs.readdirSync(nfsDonePath);
    const matchingFile = files.filter(file => file.startsWith(uuid));

    if (matchingFile.length === 0) {
      throw new Error('Plik nie został znaleziony');
    }

    const completeFilePath = path.join(nfsDonePath, matchingFile[0])

    const filePath = path.resolve(completeFilePath);

    await fsPromises.access(filePath);

    const extname = path.extname(filePath);
  
    if (!extname) {
      return NextResponse.json({ message: 'File has no extension' }, { status: 400 });
    }

    const headers = new Headers()
    headers.set('Content-Disposition', `attachment; filename="${OrginalFileNAme}${extname}"`);
    headers.set('Content-Type', 'application/octet-stream');

    const fileStream = fs.createReadStream(filePath);

    const readableStreamDefaultWriter = new ReadableStream({
      start(controller) {
        fileStream.on('data', chunk => {
          controller.enqueue(chunk)
        })
        fileStream.on('end', () => {
          controller.close()
        })
        fileStream.on('error', (err) => {
          controller.error(err)
        })
      },
    })

    return new NextResponse(readableStreamDefaultWriter, {
      status: 200,
      headers,
    })
    
  } catch (error) {
    console.error('Błąd w pobieraniu pliku:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
