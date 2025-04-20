from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from typing import Optional, Dict, Any
import shutil
import os
import uuid
import json
import asyncio
import logging
from datetime import datetime
from dotenv import load_dotenv

from redis_manager import RedisManager
from db_manager import DatabaseManager
from file_monitor import FileMonitorService
from compressions import *

from worker import start_worker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

load_dotenv("/app/.env")

# Configuration
UPLOAD_DIR = os.getenv('NFS_PENDING_PATH')
COMPRESSED_DIR = os.getenv('NFS_DONE_PATH')
REDIS_URL = f"redis://{os.getenv('REDIS_HOST')}:{os.getenv('REDIS_PORT_NUMBER')}"
DB_URL = (
    f"postgresql://{os.getenv('PG_BACKEND_USER')}:{os.getenv('PG_BACKEND_PASSWORD')}"
    f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
)

# Create directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(COMPRESSED_DIR, exist_ok=True)

# Connection managers
redis_manager = None
db_manager = None
file_monitor = None


# --- Dependency functions ---

async def get_redis():
    """Redis connection dependency"""
    return await RedisManager.get_instance(REDIS_URL)


async def get_db():
    """Database connection dependency"""
    return await DatabaseManager.get_instance(DB_URL)

# --- FastAPI startup and shutdown events ---

@app.on_event("startup")
async def startup_event():
    global redis_manager, db_manager, file_monitor

    # Initialize Redis connection
    redis_manager = await RedisManager.get_instance(REDIS_URL)
    logger.info("Redis connection initialized")

    # Initialize database connection
    db_manager = await DatabaseManager.get_instance(DB_URL)
    logger.info("Database connection initialized")

    # Start worker in background task
    asyncio.create_task(start_worker(REDIS_URL, DB_URL, UPLOAD_DIR, COMPRESSED_DIR))

    logger.info("Application startup complete")

@app.on_event("shutdown")
async def shutdown_event():
    # Close Redis connection
    if redis_manager:
        await redis_manager.close()

    # Close database connection
    if db_manager:
        await db_manager.close()


    logger.info("Application shutdown complete")