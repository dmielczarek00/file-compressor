import redis.asyncio as aioredis
import json
from typing import Any, Dict, Optional
import logging


class RedisManager:
    _instance = None
    _redis_pool = None

    @classmethod
    async def get_instance(cls, redis_url: str):
        if cls._instance is None:
            cls._instance = RedisManager()
            cls._redis_pool = await aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True
            )
        return cls._instance

    async def close(self):
        if self._redis_pool:
            await self._redis_pool.close()

    async def get_next_job(self) -> Optional[str]:
        """Get the next job UUID from the queue"""
        try:
            job_data = await self._redis_pool.lpop("compression_queue")
            if not job_data:
                return None
            if isinstance(job_data, bytes):
                job_data = job_data.decode('utf-8')
            if not job_data.strip():
                logging.warning("Received empty job data from Redis")
                return None
            return job_data.strip()  # Return the UUID string
        except Exception as e:
            logging.error(f"Unexpected error in get_next_job: {str(e)}")
            return None