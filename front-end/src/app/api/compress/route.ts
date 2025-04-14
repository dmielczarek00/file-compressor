import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import multiparty from 'multiparty';
import { Readable } from 'stream';
import { pool } from '@/lib/db';
import { redisClient } from '@/lib/redis';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const formData = await new Promise<{ fields: Record<string, string[]>, files: Record<string, any[]> }>((resolve, reject) => {
      const form = new multiparty.Form();
      const fields: Record<string, string[]> = {};
      const files: Record<string, any[]> = {};

      form.on('field', (name, value) => {
        fields[name] = fields[name] || [];
        fields[name].push(value);
      });

      form.on('file', (name, file) => {
        files[name] = files[name] || [];
        files[name].push(file);
      });

      form.on('error', (err) => reject(err));
      form.on('close', () => resolve({ fields, files }));

      const readable = Readable.fromWeb(req.body as any);
      (readable as any).headers = {
        'content-type': req.headers.get('content-type')!,
        'content-length': req.headers.get('content-length') || '',
      };

      form.parse(readable as any);
    });

    const { fields, files } = formData;
    const fileData = files.file?.[0];

    let compressionType = 'undefined';

    if (!fileData) {
      return NextResponse.json({ message: 'Brak pliku' }, { status: 400 });
    }

    if (!compressionType) {
      return NextResponse.json({ message: 'Brak typu kompresji' }, { status: 400 });
    }

    const fileUuid = uuidv4();

    // START TRANSAKCJI
    await client.query('BEGIN');

    //Zapis do pliku
    const nfsPendingPath = process.env.NFS_PENDING_PATH!;
    const originalFileName = fileData.originalFilename;
    const extension = originalFileName ? path.extname(originalFileName) : '';
    const destinationPath = path.join(nfsPendingPath, fileUuid + extension);
    const tempFilePath = fileData.path;

    await fs.copyFile(tempFilePath, destinationPath);
    await fs.unlink(tempFilePath);

    // Odczytaj parametry kompresji
    const compressionParams: Record<string, any> = {};
    for (const key in fields) {
      const value = fields[key][0];

      if (key === 'compressionType'){
        compressionType = value;
      }else if (value === 'true' || value === 'false') {
        compressionParams[key] = value === 'true';
      } else if (!isNaN(value as any)) {
        compressionParams[key] = Number(value);
      } else {
        compressionParams[key] = value;
      }
    }

    // Postgresql
    await client.query(
      `INSERT INTO compression_jobs (uuid, status, compression_algorithm, original_name, compression_params)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileUuid, 'pending', compressionType, originalFileName, compressionParams]
    );

    // Redis
    await redisClient.rpush('compression_queue', fileUuid);

    // COMMIT
    await client.query('COMMIT');

    return NextResponse.json({
      uuid: fileUuid,
      message: 'Plik został dodany do kolejki',
      fileName: originalFileName,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Błąd podczas obsługi upload:', err);
    return NextResponse.json({ message: 'Błąd serwera' }, { status: 500 });
  } finally {
    client.release();
  }
}
