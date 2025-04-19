import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../../lib/db';
import { redisClient } from '../../../lib/redis';
import multiparty from 'multiparty';
import { Readable } from 'stream';
import { httpRequestCounter, httpRequestDuration, httpErrorCounter } from '@/lib/metrics'

export const config = {
  api: {
    bodyParser: false,
  },
};

const end = httpRequestDuration.startTimer()

export const POST = async (req: NextRequest) => {
  const client = await pool.connect();
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

    let compressionType = 'undefined';
    const fileData = files.file ? files.file[0] : undefined;

    if (!fileData) {
      return NextResponse.json({ message: 'Brak przesłanego pliku' }, { status: 400 });
    }

    if (!compressionType) {
      return NextResponse.json({ message: 'Brak typu kompresji' }, { status: 400 });
    }

    // UUID
    const fileUuid = uuidv4();

    // START TRANSACTION
    await client.query('BEGIN');

    //File upload
    const nfsPendingPath = process.env.NFS_PENDING_PATH!;
    const originalFileName = fileData.originalFilename;
    const extension = originalFileName ? path.extname(originalFileName) : '';
    const destinationPath = path.join(nfsPendingPath, fileUuid + extension);
    const tempFilePath = fileData.path;

    try{
      await fs.copyFile(tempFilePath, destinationPath);
      await fs.unlink(tempFilePath);

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


      //PostgreSQL
      await client.query(
        `INSERT INTO compression_jobs (uuid, status, compression_algorithm, original_name, compression_params) VALUES ($1, $2, $3, $4, $5)`,
        [fileUuid, 'pending', compressionType, originalFileName, compressionParams]
      );
  
      // Redis
      await redisClient.rpush('compression_queue', fileUuid);
  
      // ACCEPT TRANSACTION
      await client.query('COMMIT');

      // METRICS
      await httpRequestCounter.inc({
        method: 'POST',
        route: '/api/upload',
        status: '200',
      })

      return NextResponse.json({ uuid: fileUuid, message: 'Plik Został dodany do kolejki', FileName: originalFileName });
    }catch(fileError){
      console.error('Błąd przy zapisie pliku:', fileError);
      await client.query('ROLLBACK');

      // METRICS
      await httpRequestCounter.inc({
        method: 'POST',
        route: '/api/tasks',
        status: '500',
      })
      httpErrorCounter.inc({ method: 'POST', route: '/api/upload', status: '500' })

      return NextResponse.json({ message: 'Błąd przy zapisie pliku.' }, { status: 500 });
    }
  } catch (error) {
    // ROLLBACK TRANSACTION
    await client.query('ROLLBACK');

    // METRICS
    await httpRequestCounter.inc({
      method: 'POST',
      route: '/api/tasks',
      status: '500',
    })
    httpErrorCounter.inc({ method: 'POST', route: '/api/upload', status: '500' })

    console.error('Błąd w obsłudze upload:', error);

    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  } finally {
    end({ method: 'POST', route: '/api/upload', status: '200' })
    client.release();
  }
};