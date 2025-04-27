import asyncio
import logging
import os
import json
import signal
from typing import Dict, Any

from dotenv import load_dotenv

from redis_manager import RedisManager
from db_manager import DatabaseManager
from compressions import compress_image, compress_audio, compress_video, compress_file_zip

# Import Prometheus libraries
from prometheus_client import Counter, Histogram, Gauge, push_to_gateway, CollectorRegistry
from prometheus_async.aio.web import start_http_server

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

        # Define Prometheus metrics
        self.jobs_processed = Counter(
            'compression_jobs_processed_total',
            'Total number of compression jobs processed',
            ['status', 'file_type']
        )
        self.job_processing_time = Histogram(
            'compression_job_processing_seconds',
            'Time spent processing compression jobs',
            ['file_type']
        )
        self.queue_size = Gauge(
            'compression_queue_size',
            'Current size of the compression queue'
        )
        self.worker_status = Gauge(
            'compression_worker_status',
            'Status of the compression worker (1=running, 0=stopped)'
        )

        self.worker_status.set(0)

    async def setup(self):
        """Initialize connections"""
        self.redis = await RedisManager.get_instance(self.redis_url)
        self.db = await DatabaseManager.get_instance(self.db_url)

    async def start(self):
        """Start the worker loop"""
        await self.setup()
        await self.setup_signal_handlers()
        self.running = True
        self.worker_status.set(1)
        logger.info("Compression worker started")

        metrics_task = asyncio.create_task(self.metrics_loop())

        while self.running:
            try:
                job_id = await self.redis.get_next_job()
                if job_id:
                    job_details = await self.db.get_job(job_id)
                    if job_details:
                        # Use Histogram to measure processing time
                        with self.job_processing_time.labels(
                                self.get_file_type(job_details.get('original_name', ''))
                        ).time():
                            await self.process_job(job_details)
                    else:
                        logger.error(f"Job details not found for UUID: {job_id}")
                else:
                    await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error in worker loop: {str(e)}")
                await asyncio.sleep(5)

        metrics_task.cancel()

    def get_file_type(self, filename):
        """Get the file type from the filename extension"""
        _, ext = os.path.splitext(filename)
        if ext.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
            return 'image'
        elif ext.lower() in ['.mp3', '.wav', '.ogg', '.flac']:
            return 'audio'
        elif ext.lower() in ['.mp4', '.avi', '.mov', '.flv']:
            return 'video'
        else:
            return 'other'

    async def stop(self):
        """Stop the worker"""
        self.running = False
        self.worker_status.set(0)
        if self.redis:
            await self.redis.close()
        if self.db:
            await self.db.close()

    async def process_job(self, job_data: Dict[str, Any]):
        """Process a compression job"""
        # Extract job details from the database format
        job_id = str(job_data.get('uuid'))
        original_name = job_data.get('original_name')
        file_type = self.get_file_type(original_name)

        name, ext = os.path.splitext(original_name)

        # Construct file path from original_name
        file_path = os.path.join(self.upload_dir, f"{job_id}{ext}")

        # Parse compression parameters from JSON string
        compression_options = {}
        try:
            if job_data.get('compression_params'):
                raw_options = json.loads(job_data.get('compression_params'))
                compression_options = raw_options
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse compression_params: {e}")
            await self.db.update_job_status(job_id, 'failed')
            return

        if not job_id or not original_name:
            logger.error(f"Invalid job data: {job_data}")
            return

        logger.info(f"Processing job {job_id} for file {original_name}")
        logger.debug(f"Using compression options: {compression_options}")

        try:
            # Update job status to in_progress
            await self.db.update_job_status(job_id, 'in_progress')

            # Generate output path
            output_filename = f"{job_id}{ext}"
            output_path = os.path.join(self.compressed_dir, output_filename)

            # Perform compression based on file type
            success = False
            message = ""

            logger.info(f"op: {output_path} -- f_p {file_path}")

            if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
                # Ensure required options have defaults
                if 'compressionType' not in compression_options:
                    compression_options['compressionType'] = 'jpegoptim'
                if 'compressionLevel' not in compression_options:
                    compression_options['compressionLevel'] = 5

                success, message = compress_image(file_path, output_path, compression_options)
                media_type = f"image/{ext[1:]}"
            elif ext in ['.mp3', '.wav', '.ogg', '.flac']:
                # Ensure required options have defaults
                if 'bitrate' not in compression_options:
                    compression_options['bitrate'] = '192k'
                if 'channels' not in compression_options:
                    compression_options['channels'] = 'stereo'
                if 'normalize' not in compression_options:
                    compression_options['normalize'] = True

                success, message = compress_audio(file_path, output_path, compression_options)
                media_type = "audio/mpeg"
            elif ext in ['.mp4', '.avi', '.mov', '.flv']:
                success, message = compress_video(file_path, output_path, compression_options)
                media_type = "video/mp4"
            else:
                output_filename = f"{job_id}.zip"
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
                self.jobs_processed.labels(status='success', file_type=file_type).inc()
            else:
                await self.db.update_job_status(job_id, 'failed')
                logger.error(f"Job {job_id} failed: {message}")
                self.jobs_processed.labels(status='failed', file_type=file_type).inc()

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {str(e)}")
            await self.db.update_job_status(job_id, 'failed')
            self.jobs_processed.labels(status='failed', file_type=file_type).inc()

    async def setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown"""
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda s=sig: asyncio.create_task(self.handle_shutdown(s))
            )
        logger.info("Signal handlers configured")

    async def handle_shutdown(self, sig):
        """Handle shutdown signal"""
        sig_name = signal.Signals(sig).name
        logger.info(f"Received {sig_name} signal, shutting down gracefully...")
        await self.stop()

    async def push_metrics(self):

        registry = CollectorRegistry()

        try:
            push_to_gateway('192.168.0.190:8000', job='compression_worker', registry=registry)
            logger.info("Metrics pushed to gateway")
        except Exception as e:
            logger.error(f"Failed to push metrics: {str(e)}")

    async def metrics_loop(self):
        """Periodically push metrics to the gateway"""
        while self.running:
            await self.push_metrics()
            await asyncio.sleep(15)  # Push every 15 seconds

async def main():
    # Load configuration from environment variables
    load_dotenv("/app/.env")
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
    except asyncio.CancelledError:
        logger.info("Worker task was cancelled")
    finally:
        logger.info("Shutting down worker...")
        await worker.stop()
        logger.info("Worker shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
