#!/bin/bash
set -euo pipefail

update_heartbeat() {
  while true; do
    sleep 10
    psql postgres://appuser:${DATABASE_PASS}@192.168.1.190:5432/compressiondb \
         -c "UPDATE compression_jobs SET heartbeat=NOW() WHERE uuid='${uuid}';"
  done
}

while true; do

    result=$(redis-cli -u redis://k8s-redis:6379 BLPOP compression_queue 0)

    uuid=$(echo "$result" | tail -n 1 | tr -d '"')
    echo "UUID: ${uuid}"

    psql postgres://appuser:${DATABASE_PASS}@192.168.1.190:5432/compressiondb \
        -c "UPDATE compression_jobs SET status='in_progress', heartbeat=NOW() WHERE uuid='${uuid}';"

    update_heartbeat &
    HEARTBEAT_PID=$!

    sleep 30

    mv /mnt/compression-queue/pending/${uuid}.* /mnt/compression-queue/finished/

    kill $HEARTBEAT_PID || true

    psql postgres://appuser:${DATABASE_PASS}@192.168.1.190:5432/compressiondb \
        -c "UPDATE compression_jobs SET status='finished', heartbeat=NOW() WHERE uuid='${uuid}';"
done