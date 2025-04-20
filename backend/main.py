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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

load_dotenv("/app/.env")

# Configuration
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
COMPRESSED_DIR = os.getenv("COMPRESSED_DIR", "compressed")
REDIS_URL = f"redis://{os.getenv('REDIS_HOST')}:{os.getenv('REDIS_PORT_NUMBER')}"
DB_URL = f"postgresql://{os.getenv('PG_BACKEND_USER')}:{os.getenv('PG_BACKEND_PASSWORD')}"

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


# --- File monitoring callback ---

async def handle_new_file(file_path: str, job_data: Dict[str, Any]):
    """Handle new files detected by watchdog"""
    try:
        # Extract file info
        filename = os.path.basename(file_path)
        _, ext = os.path.splitext(filename)
        ext = ext.lower()

        # Determine compression algorithm
        algorithm = "unknown"
        if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
            algorithm = "image_compression"
        elif ext in ['.mp3', '.wav', '.ogg', '.flac']:
            algorithm = "audio_compression"
        elif ext in ['.mp4', '.avi', '.mov', '.flv']:
            algorithm = "video_compression"
        else:
            algorithm = "zip_compression"

        # Create job in database
        db = await get_db()
        job_id = await db.create_job(filename, algorithm)

        # Add job to Redis queue
        redis = await get_redis()
        job_data['job_id'] = job_id
        job_data['algorithm'] = algorithm

        logger.info(f"New job created for file {filename}: {job_id}")

    except Exception as e:
        logger.error(f"Error handling new file {file_path}: {str(e)}")


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

    # Start file monitoring (in a background task to not block startup)
    def start_file_monitor():
        global file_monitor
        file_monitor = FileMonitorService(
            upload_dir=UPLOAD_DIR,
            compressed_dir=COMPRESSED_DIR,
            job_callback=lambda file_path, job_data: asyncio.run(handle_new_file(file_path, job_data))
        )
        file_monitor.start()

    asyncio.create_task(asyncio.to_thread(start_file_monitor))
    logger.info("Application startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    # Stop file monitoring
    if file_monitor:
        file_monitor.stop()

    # Close Redis connection
    if redis_manager:
        await redis_manager.close()

    # Close database connection
    if db_manager:
        await db_manager.close()

    logger.info("Application shutdown complete")


# --- API Endpoints ---

@app.post("/compress/")
async def compress_file(
        file: UploadFile = File(...),
        options: Optional[str] = Form(None),
        background_tasks: BackgroundTasks = BackgroundTasks(),
        redis: RedisManager = Depends(get_redis),
        db: DatabaseManager = Depends(get_db)
):
    # Parse options if provided
    compression_options = {}
    if options:
        try:
            compression_options = json.loads(options)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid options format")

    # Generate unique filename for storage
    job_id = str(uuid.uuid4())
    input_filename = f"{job_id}_{file.filename}"
    input_path = os.path.join(UPLOAD_DIR, input_filename)

    # Save uploaded file
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Determine file type and algorithm
    filename, ext = os.path.splitext(file.filename)
    ext = ext.lower()

    algorithm = "unknown"
    if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
        algorithm = "image_compression"
    elif ext in ['.mp3', '.wav', '.ogg', '.flac']:
        algorithm = "audio_compression"
    elif ext in ['.mp4', '.avi', '.mov', '.flv']:
        algorithm = "video_compression"
    else:
        algorithm = "zip_compression"

    # Create job in database
    await db.create_job(file.filename, algorithm, compression_options)

    # Add job to Redis queue
    job_data = {
        "job_id": job_id,
        "file_path": input_path,
        "original_name": file.filename,
        "created_at": datetime.now().isoformat(),
        "options": compression_options,
        "algorithm": algorithm
    }

    return JSONResponse(
        status_code=202,
        content={
            "message": "Compression task started",
            "job_id": job_id,
            "status": "pending"
        }
    )


@app.get("/jobs/{job_id}")
async def get_job_status(
        job_id: str,
        redis: RedisManager = Depends(get_redis),
        db: DatabaseManager = Depends(get_db)
):
    # Get job status from Redis (faster)
    job_status = await redis.get_job_status(job_id)

    if not job_status:
        # If not in Redis, try the database
        job_data = await db.get_job(job_id)
        if not job_data:
            raise HTTPException(status_code=404, detail="Job not found")

        # Return database status
        return {
            "job_id": job_id,
            "status": job_data.get("status"),
            "created_at": job_data.get("created_at").isoformat() if job_data.get("created_at") else None,
            "algorithm": job_data.get("compression_algorithm")
        }

    # Return Redis status (more detailed)
    result = {
        "job_id": job_id,
        "status": job_status.get("status")
    }

    # Include result data if job is finished
    if job_status.get("status") == "finished" and "result" in job_status:
        result["result"] = json.loads(job_status["result"])

    # Include error if job failed
    if job_status.get("status") == "failed" and "result" in job_status:
        error_data = json.loads(job_status["result"])
        result["error"] = error_data.get("error")

    return result


@app.get("/download/{job_id}")
async def download_file(
        job_id: str,
        redis: RedisManager = Depends(get_redis)
):
    # Get job status from Redis
    job_status = await redis.get_job_status(job_id)

    if not job_status or job_status.get("status") != "finished":
        raise HTTPException(
            status_code=404 if not job_status else 400,
            detail="Job not found" if not job_status else "Job not yet completed"
        )

    # Get result data
    result_data = json.loads(job_status.get("result", "{}"))

    if not result_data or "output_file" not in result_data:
        raise HTTPException(status_code=500, detail="Job result data is missing")

    output_path = result_data["output_file"]
    output_filename = result_data["output_filename"]
    media_type = result_data.get("media_type", "application/octet-stream")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Compressed file not found")

    return FileResponse(
        output_path,
        media_type=media_type,
        filename=output_filename
    )