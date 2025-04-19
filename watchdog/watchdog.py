import os
import time
import logging

import psycopg2
import redis
from dotenv import load_dotenv
from prometheus_client import start_http_server, Counter

load_dotenv("/app/.env")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

PG_CONN_STR = (
    f"postgresql://{os.getenv('PG_BACKEND_USER')}:{os.getenv('PG_BACKEND_PASSWORD')}"
    f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
)
REDIS_URL = f"redis://{os.getenv('REDIS_HOST')}:{os.getenv('REDIS_PORT_NUMBER')}"

OVERDUE_JOBS = Counter(
    'watchdog_overdue_jobs_total',
    'Total number of pending jobs detected by the watchdog'
)
FAILED_JOBS = Counter(
    "watchdog_failed_jobs_total",
    "Total number of jobs that could not be processed"
)
WATCHDOG_ERRORS = Counter(
    'watchdog_errors_total',
    'Total number of errors occurring in the watchdog loop',
    ['stage']
)

def init_postgres():
    try:
        conn = psycopg2.connect(PG_CONN_STR)
        conn.autocommit = False
        return conn
    except Exception as e:
        WATCHDOG_ERRORS.labels(stage='init_postgres').inc()
        logging.error(f"Error connecting to PostgreSQL: {e}")
        raise

def init_redis():
    try:
        client = redis.Redis.from_url(REDIS_URL)
        client.ping()
        return client
    except Exception as e:
        WATCHDOG_ERRORS.labels(stage='init_redis').inc()
        logging.error(f"Error connecting to Redis: {e}")
        raise

def process_job(conn, redis_client, job_uuid, retry_count):
    cursor = conn.cursor()
    try:
        cursor.execute("BEGIN;")
        if retry_count >= 3:
            cursor.execute(
                "UPDATE compression_jobs SET status = 'failed' WHERE uuid = %s;",
                (job_uuid,)
            )
            logging.warning("Marking job %s as FAILED (retry_count=%s)", job_uuid, retry_count)
            FAILED_JOBS.inc()
        else:
            cursor.execute("""
                UPDATE compression_jobs
                SET status = 'pending',
                    retry_count = retry_count + 1
                WHERE uuid = %s;
            """, (job_uuid,))
            redis_client.lpush("compression_queue", str(job_uuid))
        conn.commit()
    except Exception as e:
        conn.rollback()
        WATCHDOG_ERRORS.labels(stage='process_job').inc()
        logging.error(f"Error processing job {job_uuid}: {e}")
    finally:
        cursor.close()

def watchdog_loop():
    while True:
        try:
            pg_conn = init_postgres()
            redis_client = init_redis()
        except Exception:
            time.sleep(15)
            continue

        try:
            cursor = pg_conn.cursor()
            cursor.execute("""
                SELECT uuid, retry_count
                FROM compression_jobs
                WHERE status = 'in_progress'
                  AND heartbeat < NOW() - INTERVAL '10 seconds';
            """)
            jobs = cursor.fetchall()
            cursor.close()

            if jobs:
                OVERDUE_JOBS.inc(len(jobs))
                logging.info(f"Found {len(jobs)} overdue job(s).")
            else:
                logging.info("No overdue jobs found.")

            for job_uuid, retry_count in jobs:
                process_job(pg_conn, redis_client, job_uuid, retry_count)

        except Exception as e:
            WATCHDOG_ERRORS.labels(stage='query_jobs').inc()
            logging.error(f"Error fetching or processing jobs: {e}")

        finally:
            try:
                pg_conn.close()
            except Exception as e:
                WATCHDOG_ERRORS.labels(stage='close_postgres').inc()
                logging.error(f"Error closing PostgreSQL connection: {e}")

        time.sleep(15)

if __name__ == "__main__":
    start_http_server(8000)
    watchdog_loop()
