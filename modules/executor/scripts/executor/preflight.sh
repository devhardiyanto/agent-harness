#!/usr/bin/env bash
# scripts/executor/preflight.sh — cek lingkungan sebelum dispatch. Exit 10 bila ada FAIL.
PY="$(command -v python3 || command -v python)"
exec "$PY" "$(dirname "${BASH_SOURCE[0]}")/executor.py" preflight
