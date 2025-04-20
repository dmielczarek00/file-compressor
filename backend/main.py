from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from typing import Optional
from compressions import *
import shutil
import os
import subprocess
import uuid
import json

app = FastAPI()

UPLOAD_DIR = "uploads"
COMPRESSED_DIR = "compressed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(COMPRESSED_DIR, exist_ok=True)


@app.post("/compress/")
async def compress_file(
        file: UploadFile = File(...),
        options: Optional[str] = Form(None)
):
    # Parse options if provided
    compression_options = {}
    if options:
        try:
            compression_options = json.loads(options)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid options format")

    # GET FILE
    input_filename = f"{uuid.uuid4()}_{file.filename}"
    input_path = os.path.join(UPLOAD_DIR, input_filename)

    # Save uploaded file
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # CHECK TYPE OF FILE
    filename, ext = os.path.splitext(file.filename)
    ext = ext.lower()

    # Determine output path and compression method based on file type
    success = False
    message = ""

    # Img Compression
    if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
        output_filename = f"compressed_{filename}{ext}"
        output_path = os.path.join(COMPRESSED_DIR, output_filename)
        success, message = compress_image(input_path, output_path, compression_options)
        media_type = f"image/{ext[1:]}"

    # Audio Compression
    elif ext in ['.mp3', '.wav', '.ogg', '.flac']:
        output_filename = f"compressed_{filename}{ext}"
        output_path = os.path.join(COMPRESSED_DIR, output_filename)
        success, message = compress_audio(input_path, output_path, compression_options)
        media_type = "audio/mpeg"

    # Video Compression
    elif ext in ['.mp4', '.avi', '.mov', '.flv']:
        output_filename = f"compressed_{filename}{ext}"
        output_path = os.path.join(COMPRESSED_DIR, output_filename)
        success, message = compress_video(input_path, output_path, compression_options)
        media_type = "video/mp4"

    # Everything else Compression should be not used but for safety (will always return zip file)
    else:
        output_filename = f"compressed_{filename}.zip"
        output_path = os.path.join(COMPRESSED_DIR, output_filename)
        success, message = compress_file_zip(input_path, output_path)
        media_type = "application/zip"

    # Del input file
    try:
        os.remove(input_path)
    except:
        pass

    if not success:
        raise HTTPException(status_code=500, detail=f"Compression failed: {message}")

    # return composed file
    return FileResponse(
        output_path,
        media_type=media_type,
        filename=output_filename
    )
