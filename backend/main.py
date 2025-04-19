from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import ffmpeg
import shutil
import os
import uuid

app = FastAPI()

UPLOAD_DIR = "uploads"
COMPRESSED_DIR = "compressed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(COMPRESSED_DIR, exist_ok=True)

@app.post("/compress/")
async def compress_file(file: UploadFile = File(...)):

    input_filename = f"{uuid.uuid4()}_{file.filename}"
    input_path = os.path.join(UPLOAD_DIR, input_filename)
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    output_filename = f"compressed_{input_filename}.mp4"
    output_path = os.path.join(COMPRESSED_DIR, output_filename)


    # TODO: Create better way to compress it this will only lowerbitrate of file
    try:
        (
            ffmpeg
            .input(input_path)
            .output(output_path, video_bitrate='500k', audio_bitrate='128k')
            .run(overwrite_output=True)
        )
    except ffmpeg.Error as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg error: {e.stderr.decode()}")

    # Return the compressed file for download
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=output_filename
    )
