FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y ffmpeg gcc libpq-dev python3-dev gettext-base && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


WORKDIR /app

COPY requirements.txt .

# Install watchdog for filesystem monitoring
RUN pip install --no-cache-dir -r requirements.txt watchdog

COPY . .

EXPOSE 8002

CMD ["python", "worker.py"]
