import os

import asyncpg
import json
import uuid
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class DatabaseManager:
    _instance = None
    _pool = None

    @classmethod
    async def get_instance(cls, db_url: str):
        if cls._instance is None:
            cls._instance = DatabaseManager()
            cls._pool = await asyncpg.create_pool(db_url)
        return cls._instance

    async def close(self):
        if self._pool:
            await self._pool.close()

    async def create_job(self, original_name: str, algorithm: str,
                         params: Dict[str, Any] = None) -> str:
        job_id = str(uuid.uuid4())

        async with self._pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO compression_jobs 
                (uuid, original_name, status, compression_algorithm, compression_params)
                VALUES ($1, $2, $3, $4, $5)
            """, job_id, original_name, 'pending', algorithm,
                               json.dumps(params) if params else None)

        return job_id

    async def update_job_status(self, job_id: str, status: str) -> bool:
        async with self._pool.acquire() as conn:
            await conn.execute("""
                UPDATE compression_jobs
                SET status = $1, heartbeat = NOW()
                WHERE uuid = $2
            """, status, job_id)
        return True

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async with self._pool.acquire() as conn:
            job = await conn.fetchrow("""
                SELECT * FROM compression_jobs WHERE uuid = $1
            """, job_id)

        if job:
            return dict(job)
        return None

    async def get_stalled_jobs(self, timeout_minutes: int = 5) -> List[Dict[str, Any]]:
        async with self._pool.acquire() as conn:
            jobs = await conn.fetch("""
                SELECT * FROM compression_jobs 
                WHERE status = 'in_progress' 
                AND heartbeat < NOW() - INTERVAL '$1 minutes'
            """, timeout_minutes)

        return [dict(job) for job in jobs]

    async def increment_retry(self, job_id: str) -> int:
        async with self._pool.acquire() as conn:
            result = await conn.fetchval("""
                UPDATE compression_jobs
                SET retry_count = retry_count + 1
                WHERE uuid = $1
                RETURNING retry_count
            """, job_id)
        return result