import time
import os
import json
import asyncio
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from typing import Callable, Dict, Any, Optional

logger = logging.getLogger(__name__)


class CompressionFileHandler(FileSystemEventHandler):
    def __init__(self, on_file_created: Callable[[str], None],
                 on_file_deleted: Optional[Callable[[str], None]] = None):
        self.on_file_created = on_file_created
        self.on_file_deleted = on_file_deleted
        # Track files being processed to avoid duplicates
        self.processing_files = set()

    def on_created(self, event):
        if not event.is_directory and event.src_path not in self.processing_files:
            logger.info(f"New file detected: {event.src_path}")
            self.processing_files.add(event.src_path)
            # Give the file system a moment to fully write the file
            time.sleep(0.5)
            self.on_file_created(event.src_path)
            self.processing_files.remove(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory and self.on_file_deleted:
            logger.info(f"File deleted: {event.src_path}")
            self.on_file_deleted(event.src_path)


class FileMonitorService:
    def __init__(self, upload_dir: str, compressed_dir: str,
                 job_callback: Callable[[str, Dict[str, Any]], None]):
        self.upload_dir = upload_dir
        self.compressed_dir = compressed_dir
        self.job_callback = job_callback
        self.observer = Observer()

    def start(self):
        # Ensure directories exist
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(self.compressed_dir, exist_ok=True)

        # Set up upload directory monitoring
        upload_handler = CompressionFileHandler(
            on_file_created=self._handle_new_upload
        )
        self.observer.schedule(upload_handler, self.upload_dir, recursive=False)

        # Set up compressed directory monitoring for cleanup if needed
        compressed_handler = CompressionFileHandler(
            on_file_created=self._handle_new_compressed,
            on_file_deleted=self._handle_deleted_compressed
        )
        self.observer.schedule(compressed_handler, self.compressed_dir, recursive=False)

        # Start the observer
        self.observer.start()
        logger.info(f"File monitoring started for directories: {self.upload_dir}, {self.compressed_dir}")

    def stop(self):
        self.observer.stop()
        self.observer.join()
        logger.info("File monitoring stopped")

    def _handle_new_upload(self, file_path: str):
        filename = os.path.basename(file_path)
        # Create a job for the file
        job_data = {
            "file_path": file_path,
            "original_name": filename,
            "created_at": time.time()
        }
        self.job_callback(file_path, job_data)

    def _handle_new_compressed(self, file_path: str):
        logger.info(f"New compressed file available: {file_path}")

    def _handle_deleted_compressed(self, file_path: str):
        logger.info(f"Compressed file removed: {file_path}")
