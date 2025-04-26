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

    async def get_next_job(self) -> Optional[Dict[str, Any]]:
        """Get the next job from the queue"""
        try:
            job_data = await self._redis_pool.lpop("compression_queue")
            if not job_data:
                return None

            # Handle potential byte string vs string issue
            if isinstance(job_data, bytes):
                job_data = job_data.decode('utf-8')

            # Check if the string is empty or whitespace
            if not job_data.strip():
                logging.warning("Received empty job data from Redis")
                return None

            # Log the raw data for debugging
            logging.debug(f"Raw job data from Redis: {repr(job_data)}")

            # Find the first valid JSON object
            start_pos = job_data.find('{')
            if start_pos > 0:
                logging.warning(f"Skipping {start_pos} characters at the beginning of the data")
                job_data = job_data[start_pos:]

            # Fix for multiple JSON objects - take only the first object
            if '}' in job_data:
                end_of_first_json = job_data.find('}') + 1
                job_data = job_data[:end_of_first_json]
                logging.warning("Found multiple JSON objects, using only the first one")

            # Parse the JSON data
            parsed_data = json.loads(job_data)
            return parsed_data

        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse job data: {e}")
            logging.debug(f"Raw job data type: {type(job_data)}")
            logging.debug(f"Raw job data: {repr(job_data)}")
            return None
        except Exception as e:
            logging.error(f"Unexpected error in get_next_job: {str(e)}")
            return None
