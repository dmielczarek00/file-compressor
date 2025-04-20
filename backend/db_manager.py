import asyncpg
import json
import uuid
from typing import Dict, Any, List, Optional
import logging

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

    async def update_job_status(self, job_id: str, status: str) -> bool:
        """Update the status of a job in the database"""
        async with self._pool.acquire() as conn:
            await conn.execute("""
                UPDATE compression_jobs
                SET status = $1, heartbeat = NOW()
                WHERE uuid = $2
            """, status, job_id)
            return True

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job details from the database"""
        async with self._pool.acquire() as conn:
            job = await conn.fetchrow("""
                SELECT * FROM compression_jobs WHERE uuid = $1
            """, job_id)
            if job:
                return dict(job)
            return None