#!/bin/bash
set -euo pipefail

### KONFIGURACJA ###
export PGHOST
export PGPORT
export PGDATABASE
export PGUSER
export PGPASSWORD

export REDIS_HOST
export REDIS_PORT
export REDIS_LIST

# Pliki źródłowe
FILE_SRC_JPEG="/srv/nfs/compression-queue/test.jpg"
FILE_SRC_MP4="/srv/nfs/compression-queue/test.mp4"

# Pliki kontrolne
FILE_CONTROL_JPEG="/srv/nfs/compression-queue/control/test_control.jpg"
FILE_CONTROL_MP4="/srv/nfs/compression-queue/control/test_control.mp4"

# Katalogi docelowe
FILE_DST_DIR="/srv/nfs/compression-queue/pending"
RESULTS_DIR="/srv/nfs/compression-queue/finished"

TABLE_NAME="compression_jobs"
ITERATIONS_JPEG=15
ITERATIONS_MP4=2
TOTAL_ITERATIONS=$((ITERATIONS_JPEG + ITERATIONS_MP4))

FILE_STABILITY_WAIT=10
STABILITY_DURATION=2
COMPARISON_DELAY=2
#####################

#mkdir -p "$FILE_DST_DIR" "$RESULTS_DIR"

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
  command -v "$cmd" &>/dev/null || { echo "Brak polecenia: $cmd" >&2; exit 1; }
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

echo "=== ULEPSZONY TEST KOMPRESJI JPEG + MP4 ==="
echo "JPEG: $ITERATIONS_JPEG iteracji"
echo "MP4:  $ITERATIONS_MP4 iteracji"
echo "Całkowite zadania: $TOTAL_ITERATIONS"
echo "Stabilizacja: $STABILITY_DURATION s, Max oczekiwanie: $FILE_STABILITY_WAIT s"
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
    '{"crf":28}',
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

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$REDIS_LIST" "${all_uuids[@]}"

echo
echo "4) Oczekiwanie na zakończenie zadań..."
while :; do
  uuid_list=$(printf "'%s'," "${all_uuids[@]}")
  uuid_list="${uuid_list%,}"  # usuń ostatni przecinek
  pending_count=$(psql -t -A -c "
    SELECT count(*)
      FROM ${TABLE_NAME}
     WHERE uuid IN (${uuid_list})
       AND status IN ('pending','in_progress');
  " | xargs)

  printf "\r\033[K   Pozostało zadań do ukończenia: %d/%d" "$pending_count" "$TOTAL_ITERATIONS"

  (( pending_count == 0 )) && break
  sleep 2
done
echo

t1=$(date +%s.%N)
elapsed=$(awk "BEGIN {print $t1 - $t0}")

echo
echo "5) Pobieranie skompresowanych plików i porównywanie..."
echo "   Implementacja ulepszonej synchronizacji plików..."

wait_for_file_stability() {
  local file_path="$1"
  local max_wait_seconds="${2:-$FILE_STABILITY_WAIT}"
  local stability_duration="${3:-$STABILITY_DURATION}"

  local start_time
  start_time=$(date +%s)
  local last_size=-1
  local last_mtime=-1
  local stable_count=0

  while (( $(date +%s) - start_time < max_wait_seconds )); do
    if [[ ! -f "$file_path" ]]; then
      sleep 1
      continue
    fi

    local temp_file="${file_path}.tmp"
    local lock_file="${file_path}.lock"
    if [[ -f "$temp_file" ]] || [[ -f "$lock_file" ]]; then
      stable_count=0
      sleep 1
      continue
    fi

    local current_size
    current_size=$(stat -c%s "$file_path" 2>/dev/null || echo "0")
    local current_mtime
    current_mtime=$(stat -c%Y "$file_path" 2>/dev/null || echo "0")

    if [[ "$current_size" -eq "$last_size" ]] && [[ "$current_mtime" -eq "$last_mtime" ]] && [[ "$current_size" -gt 0 ]]; then
      ((stable_count++))
      if (( stable_count >= stability_duration )); then
        return 0
      fi
    else
      stable_count=0
      last_size=$current_size
      last_mtime=$current_mtime
    fi

    sleep 1
  done

  return 1
}

is_file_locked() {
  local file_path="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof "$file_path" >/dev/null 2>&1 && return 0
  fi
  [[ -f "${file_path}.lock" ]] || [[ -f "${file_path}.tmp" ]]
}

compare_file() {
  local uuid="$1"
  local extension="$2"
  local control_file="$3"
  local type_name="$4"

  local compressed_file="$RESULTS_DIR/${uuid}.${extension}"
  local result_file="$RESULTS_DIR/${uuid}_${extension}_comparison.txt"

  echo "   Sprawdzanie $type_name $uuid..."
  if [[ ! -f "$compressed_file" ]]; then
    echo "BŁĄD: Brak skompresowanego pliku: $compressed_file" | tee "$result_file"
    return 1
  fi

  echo "     Oczekiwanie na stabilizację..."
  if ! wait_for_file_stability "$compressed_file" "$FILE_STABILITY_WAIT" "$STABILITY_DURATION"; then
    local current_size
    current_size=$(stat -c%s "$compressed_file" 2>/dev/null || echo "nieznany")
    echo "BŁĄD: Plik nie ustabilizował się w wyznaczonym czasie: $compressed_file (rozmiar: $current_size)" | tee "$result_file"
    return 1
  fi

  echo "     Plik ustabilizowany, sprawdzanie blokad..."
  if is_file_locked "$compressed_file"; then
    echo "BŁĄD: Plik jest nadal blokowany przez inny proces: $compressed_file" | tee "$result_file"
    return 1
  fi

  sleep "$COMPARISON_DELAY"

  local original_size
  original_size=$(stat -c%s "$compressed_file")
  local control_size
  control_size=$(stat -c%s "$control_file")

  echo "=== PORÓWNANIE $type_name (UUID: $uuid) ===" > "$result_file"
  echo "Skompresowany: $compressed_file ($original_size bajtów)" >> "$result_file"
  echo "Kontrolny: $control_file ($control_size bajtów)" >> "$result_file"
  echo "Czas sprawdzenia: $(date '+%Y-%m-%d %H:%M:%S')" >> "$result_file"
  echo "Stabilizacja: ${STABILITY_DURATION}s, Max oczekiwanie: ${FILE_STABILITY_WAIT}s" >> "$result_file"

  echo "     Porównywanie zawartości..."
  if cmp -s "$compressed_file" "$control_file" 2>/dev/null; then
    echo "STATUS: IDENTYCZNE" >> "$result_file"
    echo "$type_name $uuid: IDENTYCZNE"
    return 0
  else
    echo "STATUS: RÓŻNE" >> "$result_file"
    local size_diff=$((original_size - control_size))
    echo "Różnica rozmiaru: $size_diff bajtów" >> "$result_file"
    echo "Pierwsze różnice:" >> "$result_file"
    cmp -l "$compressed_file" "$control_file" 2>/dev/null | head -5 >> "$result_file" || echo "Pliki drastycznie różne (nie można porównać szczegółowo)" >> "$result_file"
    echo " $type_name $uuid: RÓŻNE (diff: $size_diff B)"
    return 1
  fi
}

ERRORS=0
jpeg_identical=0
jpeg_different=0
mp4_identical=0
mp4_different=0

echo "   Porównywanie plików JPEG..."
for uuid in "${uuids_jpeg[@]}"; do
  set +e
  compare_file "$uuid" "jpg" "$FILE_CONTROL_JPEG" "JPEG"
  result=$?
  if [[ $result -eq 0 ]]; then
    ((jpeg_identical++))
  else
    ((jpeg_different++))
  fi
  (( ERRORS += result ))
  set -e
done

echo "   Porównywanie plików MP4..."
for uuid in "${uuids_mp4[@]}"; do
  set +e
  compare_file "$uuid" "mp4" "$FILE_CONTROL_MP4" "MP4"
  result=$?
  if [[ $result -eq 0 ]]; then
    ((mp4_identical++))
  else
    ((mp4_different++))
  fi
  (( ERRORS += result ))
  set -e
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
echo
echo "ULEPSZENIA SYNCHRONIZACJI:"
echo "  - Oczekiwanie na stabilizację plików: ${STABILITY_DURATION}s"
echo "  - Maksymalny czas oczekiwania: ${FILE_STABILITY_WAIT}s"
echo "  - Sprawdzanie blokad procesów"
echo "  - Dodatkowe opóźnienie przed porównaniem: ${COMPARISON_DELAY}s"

if [[ $ERRORS -eq 0 ]]; then
  echo
  echo "TEST ZAKOŃCZONY SUKCESEM - wszystkie pliki identyczne!"
  exit 0
else
  echo
  echo "TEST WYKRYŁ RÓŻNICE (liczba błędów: $ERRORS)"
  exit 1
fi