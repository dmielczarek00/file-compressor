#!/bin/bash
set -euo pipefail

### KONFIGURACJA ###
export PGHOST="192.168.1.190"
export PGPORT="5432"
export PGDATABASE="compressiondb"
export PGUSER="appuser"
export PGPASSWORD="admin"

REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_LIST="compression_queue"

# Pliki źródłowe
FILE_SRC_JPEG="/home/alphauser/test.jpg"
FILE_SRC_MP4="/home/alphauser/test.mp4"

# Pliki kontrolne
FILE_CONTROL_JPEG="/home/alphauser/control/test_control.jpg"
FILE_CONTROL_MP4="/home/alphauser/control/test_control.mp4"

# Katalogi docelowe
FILE_DST_DIR="/srv/nfs/compression-queue/pending"
RESULTS_DIR="/tmp/compression_test_results"

TABLE_NAME="compression_jobs"
ITERATIONS_JPEG=15
ITERATIONS_MP4=2
TOTAL_ITERATIONS=$((ITERATIONS_JPEG + ITERATIONS_MP4))
#####################

mkdir -p "$FILE_DST_DIR"
mkdir -p "$RESULTS_DIR"

gen_uuid() {
  if command -v python3 &>/dev/null; then
    python3 - <<'PYCODE'
import uuid, sys
sys.stdout.write(str(uuid.uuid4()))
PYCODE
  elif command -v openssl &>/dev/null; then
    openssl rand -hex 16 | sed -r 's/(.{8})(.{4})(.{4})(.{4})(.{12})/\1-\2-\3-\4-\5/'
  else
    echo "Brak python3 ani openssl – nie mogę wygenerować UUID" >&2
    exit 1
  fi
}

# Sprawdzenie dostępności narzędzi
for cmd in psql redis-cli cmp stat; do
  command -v $cmd &>/dev/null || { echo "Brak polecenia: $cmd" >&2; exit 1; }
done

# Sprawdzenie plików źródłowych
for file in "$FILE_SRC_JPEG" "$FILE_SRC_MP4" "$FILE_CONTROL_JPEG" "$FILE_CONTROL_MP4"; do
  [[ -f "$file" ]] || { echo "Brak pliku: $file" >&2; exit 1; }
done

# Sprawdzenie połączenia z Redis
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null || {
  echo "Błąd połączenia z Redis: $REDIS_HOST:$REDIS_PORT" >&2
  exit 1
}

echo "=== TEST KOMPRESJI JPEG + MP4 ==="
echo "JPEG: $ITERATIONS_JPEG iteracji"
echo "MP4:  $ITERATIONS_MP4 iteracji"
echo "Całkowite zadania: $TOTAL_ITERATIONS"
echo

uuids_jpeg=()
uuids_mp4=()
all_uuids=()

echo "1) Przygotowywanie zadań JPEG ($ITERATIONS_JPEG zadań)..."
for ((i=1; i<=ITERATIONS_JPEG; i++)); do
  id=$(gen_uuid)
  uuids_jpeg+=("$id")
  all_uuids+=("$id")

  psql -q -X <<SQL
INSERT INTO ${TABLE_NAME}
  (uuid, original_name, created_at, status, compression_algorithm, compression_params, heartbeat, retry_count)
VALUES
  (
    '${id}',
    'test.jpg',
    now(),
    'pending',
    'jpegoptim',
    '{"compressionLevel":20}',
    now(),
    0
  );
SQL

  cp "$FILE_SRC_JPEG" "${FILE_DST_DIR}/${id}.jpg"
  printf "   [%3d/%3d] JPEG job %s\n" "$i" "$ITERATIONS_JPEG" "$id"
done

echo
echo "2) Przygotowywanie zadań MP4 ($ITERATIONS_MP4 zadań)..."
for ((i=1; i<=ITERATIONS_MP4; i++)); do
  id=$(gen_uuid)
  uuids_mp4+=("$id")
  all_uuids+=("$id")

  psql -q -X <<SQL
INSERT INTO ${TABLE_NAME}
  (uuid, original_name, created_at, status, compression_algorithm, compression_params, heartbeat, retry_count)
VALUES
  (
    '${id}',
    'test.mp4',
    now(),
    'pending',
    'ffmpeg',
    '{"codec":"libx264","crf":28,"preset":"medium","audio_codec":"aac","audio_bitrate":"128k","faststart":true}',
    now(),
    0
  );
SQL

  cp "$FILE_SRC_MP4" "${FILE_DST_DIR}/${id}.mp4"
  printf "   [%3d/%3d] MP4 job %s\n" "$i" "$ITERATIONS_MP4" "$id"
done

echo
echo "3) Wysyłanie UUID do Redis ($TOTAL_ITERATIONS zadań)..."
t0=$(date +%s.%N)

# Sprawdzenie długości kolejki przed wysłaniem
queue_length_before=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "$REDIS_LIST")
echo "   Długość kolejki przed: $queue_length_before"

# Wysłanie wszystkich UUID jednocześnie
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$REDIS_LIST" "${all_uuids[@]}"

queue_length_after=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "$REDIS_LIST")
echo "   Długość kolejki po: $queue_length_after"
echo "   Dodano ${#all_uuids[@]} zadań do listy $REDIS_LIST"

echo
echo "4) Oczekiwanie na zakończenie zadań..."
while :; do
  pending_count=$(psql -t -A -c "
    SELECT count(*)
      FROM ${TABLE_NAME}
     WHERE uuid IN ($(printf "'%s'," "${all_uuids[@]}" | sed 's/,$//'))
       AND status IN ('pending','in_progress');
  " | xargs)

  # clear line then print
  printf "\r\033[K   Pozostało zadań do ukończenia: %d/%d" "$pending_count" "$TOTAL_ITERATIONS"

  (( pending_count == 0 )) && break
  sleep 2
done
echo

t1=$(date +%s.%N)
elapsed=$(awk "BEGIN {print $t1 - $t0}")

echo
echo "5) Pobieranie skompresowanych plików i porównywanie..."

# Funkcja porównywania plików
compare_file() {
  local uuid="$1"
  local extension="$2"
  local control_file="$3"
  local type_name="$4"

  local compressed_file="/srv/nfs/compression-queue/completed/${uuid}.${extension}"
  local result_file="$RESULTS_DIR/${uuid}_${extension}_comparison.txt"

  if [[ ! -f "$compressed_file" ]]; then
    echo "BŁĄD: Brak skompresowanego pliku: $compressed_file" | tee "$result_file"
    return 1
  fi

  local original_size=$(stat -c%s "$compressed_file")
  local control_size=$(stat -c%s "$control_file")

  echo "=== PORÓWNANIE $type_name (UUID: $uuid) ===" > "$result_file"
  echo "Skompresowany: $compressed_file ($original_size bajtów)" >> "$result_file"
  echo "Kontrolny: $control_file ($control_size bajtów)" >> "$result_file"

  if cmp -s "$compressed_file" "$control_file"; then
    echo "STATUS: IDENTYCZNE" >> "$result_file"
    echo "$type_name $uuid: IDENTYCZNE"
    return 0
  else
    echo "STATUS: RÓŻNE" >> "$result_file"

    # Oblicz różnicę w rozmiarach
    local size_diff=$((original_size - control_size))
    echo "Różnica rozmiaru: $size_diff bajtów" >> "$result_file"

    # Pokaż pierwsze różnice
    echo "Pierwsze różnice:" >> "$result_file"
    cmp -l "$compressed_file" "$control_file" | head -5 >> "$result_file"

    echo " $type_name $uuid: RÓŻNE (diff: $size_diff B)"
    return 1
  fi
}

# Porównywanie plików JPEG
jpeg_identical=0
jpeg_different=0
echo "   Porównywanie plików JPEG..."
for uuid in "${uuids_jpeg[@]}"; do
  if compare_file "$uuid" "jpg" "$FILE_CONTROL_JPEG" "JPEG"; then
    ((jpeg_identical++))
  else
    ((jpeg_different++))
  fi
done

# Porównywanie plików MP4
mp4_identical=0
mp4_different=0
echo "   Porównywanie plików MP4..."
for uuid in "${uuids_mp4[@]}"; do
  if compare_file "$uuid" "mp4" "$FILE_CONTROL_MP4" "MP4"; then
    ((mp4_identical++))
  else
    ((mp4_different++))
  fi
done

echo
echo "=== PODSUMOWANIE WYNIKÓW ==="
printf "Czas przetwarzania: %.2f s\n" "$elapsed"
echo
echo "JPEG:"
echo "  Identyczne: $jpeg_identical/$ITERATIONS_JPEG"
echo "  Różne:      $jpeg_different/$ITERATIONS_JPEG"
echo
echo "MP4:"
echo "  Identyczne: $mp4_identical/$ITERATIONS_MP4"
echo "  Różne:      $mp4_different/$ITERATIONS_MP4"
echo
echo "OGÓŁEM:"
echo "  Identyczne: $((jpeg_identical + mp4_identical))/$TOTAL_ITERATIONS"
echo "  Różne:      $((jpeg_different + mp4_different))/$TOTAL_ITERATIONS"

# Sprawdź sukces całkowitego testu
total_identical=$((jpeg_identical + mp4_identical))
if [[ $total_identical -eq $TOTAL_ITERATIONS ]]; then
  echo
  echo "TEST ZAKOŃCZONY SUKCESEM - wszystkie pliki identyczne!"
  exit 0
else
  echo
  echo "TEST WYKRYŁ RÓŻNICE"
  exit 1
fi