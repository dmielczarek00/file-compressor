import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../../lib/db';
import { redisClient } from '../../../lib/redis';
import multiparty from 'multiparty';
import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: false,
  },
};

export const POST = async (req: NextRequest) => {
  try {
    const formData = await new Promise<{ fields: Record<string, string[]>, files: Record<string, any[]> }>((resolve, reject) => {
      const form = new multiparty.Form();
      const fields: Record<string, string[]> = {};
      const files: Record<string, any[]> = {};

      form.on('field', (name, value) => {
        if (fields[name]) {
          fields[name].push(value);
        } else {
          fields[name] = [value];
        }
      });

      form.on('file', (name, file) => {
        if (files[name]) {
          files[name].push(file);
        } else {
          files[name] = [file];
        }
      });

      form.on('error', (err) => {
        reject(err);
      });

      form.on('close', () => {
        resolve({ fields, files });
      });

      const readable = Readable.fromWeb(req.body as any);

      (readable as any).headers = {
        'content-type': req.headers.get('content-type'),
        'content-length': req.headers.get('content-length'),
      };

      form.parse(readable as any);
    });

    console.log('Otrzymane pola:', formData.fields);
    console.log('Otrzymane pliki:', formData.files);

    const { fields, files } = formData;

    const compressionType = fields.compressionType ? fields.compressionType[0] : undefined;
    const fileData = files.file ? files.file[0] : undefined;

    if (!fileData) {
      return NextResponse.json({ message: 'Brak przesłanego pliku' }, { status: 400 });
    }

    if (!compressionType) {
      return NextResponse.json({ message: 'Brak typu kompresji' }, { status: 400 });
    }

    // UUID
    const fileUuid = uuidv4();

    //File upload
    const nfsPendingPath = process.env.NFS_PENDING_PATH!;
    const originalFileName = fileData.originalFilename;
    const extension = originalFileName ? path.extname(originalFileName) : '';
    const destinationPath = path.join(nfsPendingPath, fileUuid + extension);
    const tempFilePath = fileData.path;
    await fs.rename(tempFilePath, destinationPath);

    // Postgres
    await pool.query(
      `INSERT INTO compression_jobs (uuid, status, compression_algorithm) VALUES ($1, $2, $3)`,
      [fileUuid, 'pending', compressionType]
    );

    //Redis
    await redisClient.lpush('compression_queue', fileUuid);

    return NextResponse.json({ uuid: fileUuid, message: 'Plik przesłany pomyślnie' });
  } catch (error) {
    console.error('Błąd w obsłudze upload:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
};