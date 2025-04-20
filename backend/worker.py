import asyncio
import logging
import os
import json
from typing import Dict, Any

from redis_manager import RedisManager
from db_manager import DatabaseManager
from compressions import compress_image, compress_audio, compress_video, compress_file_zip

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CompressionWorker:
    def __init__(self, redis_url: str, db_url: str,
                 upload_dir: str, compressed_dir: str):
        self.redis_url = redis_url
        self.db_url = db_url
        self.upload_dir = upload_dir
        self.compressed_dir = compressed_dir
        self.running = False
        self.redis = None
        self.db = None

    async def setup(self):
        """Initialize connections"""
        self.redis = await RedisManager.get_instance(self.redis_url)
        self.db = await DatabaseManager.get_instance(self.db_url)

    async def start(self):
        """Start the worker loop"""
        await self.setup()
        self.running = True
        logger.info("Compression worker started")

        while self.running:
            try:
                # Get next job from Redis queue
                job_data = await self.redis.get_next_job()
                if job_data:
                    # Process the job
                    await self.process_job(job_data)
                else:
                    # No job available, wait a bit
                    await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error in worker loop: {str(e)}")
                await asyncio.sleep(5)  # Wait before retrying

    async def stop(self):
        """Stop the worker"""
        self.running = False
        if self.redis:
            await self.redis.close()
        if self.db:
            await self.db.close()

    async def process_job(self, job_data: Dict[str, Any]):
        """Process a compression job"""
        job_id = job_data.get('job_id')
        file_path = job_data.get('file_path')
        original_name = job_data.get('original_name')
        compression_options = job_data.get('options', {})

        if not job_id or not file_path or not original_name:
            logger.error(f"Invalid job data: {job_data}")
            return

        logger.info(f"Processing job {job_id} for file {original_name}")

        try:
            # Update job status to in_progress
            await self.db.update_job_status(job_id, 'in_progress')

            # Determine file type
            filename, ext = os.path.splitext(original_name)
            ext = ext.lower()

            # Generate output path
            output_filename = f"compressed_{job_id}{ext}"
            output_path = os.path.join(self.compressed_dir, output_filename)

            # Perform compression based on file type
            success = False
            message = ""

            if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
                success, message = compress_image(file_path, output_path, compression_options)
                media_type = f"image/{ext[1:]}"
            elif ext in ['.mp3', '.wav', '.ogg', '.flac']:
                success, message = compress_audio(file_path, output_path, compression_options)
                media_type = "audio/mpeg"
            elif ext in ['.mp4', '.avi', '.mov', '.flv']:
                success, message = compress_video(file_path, output_path, compression_options)
                media_type = "video/mp4"
            else:
                output_filename = f"compressed_{job_id}.zip"
                output_path = os.path.join(self.compressed_dir, output_filename)
                success, message = compress_file_zip(file_path, output_path)
                media_type = "application/zip"

            # Update job status based on result
            if success:
                result = {
                    "output_file": output_path,
                    "output_filename": output_filename,
                    "media_type": media_type,
                    "message": message
                }
                await self.db.update_job_status(job_id, 'finished')
                logger.info(f"Job {job_id} completed successfully")
            else:
                await self.db.update_job_status(job_id, 'failed')
                logger.error(f"Job {job_id} failed: {message}")

            # Clean up input file
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e:
                logger.error(f"Error removing input file {file_path}: {str(e)}")

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {str(e)}")
            await self.db.update_job_status(job_id, 'failed')




async def main():
    # Load configuration from environment variables
    upload_dir = os.getenv('NFS_PENDING_PATH')
    compressed_dir = os.getenv('NFS_DONE_PATH')
    redis_url = f"redis://{os.getenv('REDIS_HOST')}:{os.getenv('REDIS_PORT_NUMBER')}"
    db_url = (
        f"postgresql://{os.getenv('PG_BACKEND_USER')}:{os.getenv('PG_BACKEND_PASSWORD')}"
        f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
    )

    # Create directories if they don't exist
    os.makedirs(upload_dir, exist_ok=True)
    os.makedirs(compressed_dir, exist_ok=True)

    # Create and start worker
    worker = CompressionWorker(redis_url, db_url, upload_dir, compressed_dir)
    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    finally:
        await worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
