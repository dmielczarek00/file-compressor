import os
import subprocess


# Helper Func
def run_ffmpeg_command(command):
    try:
        result = subprocess.run(command, shell=True, check=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True, result.stdout.decode()
    except subprocess.CalledProcessError as e:
        return False, e.stderr.decode()


# Compress IMG
def compress_image(input_path, output_path, options=None):
    if options is None:
        options = {"compressionType": "jpegoptim", "compressionLevel": 5}

    compression_type = options.get("compressionType", "jpegoptim")
    compression_level = int(options.get("compressionLevel", 5))

    # Map compression level to quality (higher compression = lower quality)
    quality = 100 - ((compression_level - 1) * (100 / 8))

    # Basic FFmpeg quality-based compression
    cmd = f'ffmpeg -i "{input_path}" -q:v {quality} "{output_path}"'

    return run_ffmpeg_command(cmd)


# Compress Audio
def compress_audio(input_path, output_path, options=None):
    if options is None:
        options = {"bitrate": "192k", "channels": "stereo", "normalize": True}

    bitrate = options.get("bitrate", "192k")
    channels = "1" if options.get("channels") == "mono" else "2"
    normalize = options.get("normalize", True)

    cmd = f'ffmpeg -i "{input_path}"'

    if normalize:
        cmd += ' -af "loudnorm=I=-16:TP=-1.5:LRA=11"'

    cmd += f' -ac {channels} -ab {bitrate} "{output_path}"'

    return run_ffmpeg_command(cmd)


# Compress Video
def compress_video(input_path, output_path, options=None):
    if options is None:
        options = {"videoBitrate": "1000k", "audioBitrate": "128k", "resolution": "720p"}

    video_bitrate = options.get("videoBitrate", "1000k")
    audio_bitrate = options.get("audioBitrate", "128k")
    resolution = options.get("resolution", "720p")

    # Map resolution to dimensions
    resolution_map = {
        "480p": "854:480",
        "720p": "1280:720",
        "1080p": "1920:1080"
    }

    scale = resolution_map.get(resolution, "1280:720")

    cmd = f'ffmpeg -i "{input_path}" -c:v libx264 -b:v {video_bitrate} -c:a aac -b:a {audio_bitrate} -vf scale={scale} "{output_path}"'

    return run_ffmpeg_command(cmd)


# General Compression (Should not be used but added for safety)
def compress_file_zip(input_path, output_path):
    import zipfile

    try:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(input_path, os.path.basename(input_path))
        return True, "File compressed successfully"
    except Exception as e:
        return False, str(e)