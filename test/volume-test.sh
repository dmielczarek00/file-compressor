#!/bin/bash
set -euo pipefail

# Configuration
SOURCE_DIR="./source"
COMPRESSED_DIR="/srv/nfs/compression-queue/pending"
REFERENCE_DIR="./reference"
TEST_FILES=("test1.jpg" "test2.mp4")

mkdir -p "$SOURCE_DIR" "$COMPRESSED_DIR" "$REFERENCE_DIR"

compress_file() {
    local input="$1"
    local output="$2"

    local id=$(gen_uuid)
    local output_with_uuid="${output}/${id}.${input##*.}"

    echo "Compressing $input to $output_with_uuid"

    cp "$input" "$output_with_uuid"

    echo "$output_with_uuid:$id"
}

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

compare_sizes() {
    local compressed="$1"
    local reference="$2"

    if [ ! -f "$reference" ]; then
        echo "Reference file not found. Saving current result as reference."
        cp "$compressed" "$reference"
        return 0
    fi

    local compressed_size=$(stat -c %s "$compressed")
    local reference_size=$(stat -c %s "$reference")

    echo "Compressed size: $compressed_size bytes"
    echo "Reference size: $reference_size bytes"

    if [ "$compressed_size" -eq "$reference_size" ]; then
        echo "Test passed: Files have identical size"
        return 0
    else
        echo "Test failed: Size difference of $((compressed_size - reference_size)) bytes"
        return 1
    fi
}

run_tests() {
    local passed=0
    local total=${#TEST_FILES[@]}

    echo "=== Starting Compression Tests ==="

    for file in "${TEST_FILES[@]}"; do
        echo -e "\n--- Testing $file ---"

        if [ ! -f "$SOURCE_DIR/$file" ]; then
            echo "Error: Source file $SOURCE_DIR/$file not found"
            continue
        fi

        local result=$(compress_file "$SOURCE_DIR/$file" "$COMPRESSED_DIR")
        local compressed_file="${result%%:*}"
        local uuid="${result##*:}"

        local reference_file="$REFERENCE_DIR/$file"

        # Compare with reference
        if compare_sizes "$compressed_file" "$reference_file"; then
            ((passed++))
        fi
    done

    echo -e "\n=== Test Summary ==="
    echo "$passed of $total tests passed"

    [ "$passed" -eq "$total" ]
}

run_tests
exit $?