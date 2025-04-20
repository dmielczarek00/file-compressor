import redis.asyncio as aioredis
import json
from typing import Any, Dict, Optional


class RedisManager:
    _instance = None
    _redis_pool = None

    @classmethod
    async def get_instance(cls, redis_url: str = "redis://localhost:6379"):
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


    async def get_next_job(self) -> Optional[Dict[str, Any]]:
        job_data = await self._redis_pool.lpop("compression_queue")
        if job_data:
            return json.loads(job_data)
        return None