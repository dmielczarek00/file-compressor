import asyncio
import os
import logging
import argparse
from worker import CompressionWorker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def run_worker(worker_id):
    # Get environment variables
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    db_url = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/compression_db")
    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    compressed_dir = os.getenv("COMPRESSED_DIR", "compressed")

    logger.info(f"Starting worker {worker_id}...")

    # Create and start worker
    worker = CompressionWorker(redis_url, db_url, upload_dir, compressed_dir)
    await worker.setup()
    await worker.start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start compression workers")
    parser.add_argument("--workers", type=int, default=1, help="Number of worker processes to start")
    args = parser.parse_args()

    logger.info(f"Starting {args.workers} compression workers...")

    # Run multiple workers
    if args.workers == 1:
        asyncio.run(run_worker(1))
    else:
        # For multiple workers, we'll use asyncio.gather
        async def main():
            tasks = [run_worker(i + 1) for i in range(args.workers)]
            await asyncio.gather(*tasks)


        asyncio.run(main())