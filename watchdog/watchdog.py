import os
import time
import logging
import psycopg2
import redis
from dotenv import load_dotenv

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

if not PG_CONN_STR:
    logging.error("DATABASE_URL environment variable not set!")
    exit(1)

def init_postgres():
    try:
        conn = psycopg2.connect(PG_CONN_STR)
        conn.autocommit = False
        return conn
    except Exception as e:
        logging.error(f"Error connecting to PostgreSQL: {e}")
        raise

def init_redis():
    try:
        client = redis.Redis.from_url(REDIS_URL)
        client.ping()
        return client
    except Exception as e:
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
            conn.commit()
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
        logging.error(f"Error processing job {job_uuid}: {e}")
    finally:
        cursor.close()

def watchdog_loop():
    while True:
        pg_conn = None
        redis_client = None
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

            if not jobs:
                logging.info("No overdue jobs found.")
            else:
                overdue_uuids = ", ".join(str(job[0]) for job in jobs)
                logging.info(f"Found {len(jobs)} overdue job(s): {overdue_uuids}")

            for job in jobs:
                job_uuid, retry_count = job
                process_job(pg_conn, redis_client, job_uuid, retry_count)

        except Exception as e:
            logging.error(f"Error fetching or processing jobs: {e}")
        finally:
            if pg_conn:
                try:
                    pg_conn.close()
                except Exception as e:
                    logging.error(f"Error closing PostgreSQL connection: {e}")
        time.sleep(15)

if __name__ == "__main__":
    watchdog_loop()