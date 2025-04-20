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

    async def add_job(self, job_id: str, job_data: Dict[str, Any]) -> bool:
        job_str = json.dumps(job_data)
        # Add to a List for queue processing
        await self._redis_pool.lpush("compression_queue", job_str)
        # Also set a key for job status tracking
        await self._redis_pool.hset(f"job:{job_id}", mapping={
            "status": "pending",
            "data": job_str
        })
        return True

    async def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        job_data = await self._redis_pool.hgetall(f"job:{job_id}")
        if not job_data:
            return None

        if "data" in job_data:
            job_data["data"] = json.loads(job_data["data"])

        return job_data

    async def update_job_status(self, job_id: str, status: str, result: Optional[Dict[str, Any]] = None) -> bool:
        update_data = {"status": status}
        if result:
            update_data["result"] = json.dumps(result)

        await self._redis_pool.hmset(f"job:{job_id}", update_data)
        return True

    async def get_next_job(self) -> Optional[Dict[str, Any]]:
        job_data = await self._redis_pool.rpop("compression_queue")
        if job_data:
            return json.loads(job_data)
        return None

    async def publish_job_update(self, job_id: str, status: str) -> None:
        await self._redis_pool.publish("job_updates",
                                       json.dumps({"job_id": job_id, "status": status}))