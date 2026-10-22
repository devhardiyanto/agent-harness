#!/usr/bin/env bash
# scripts/executor/agy-gate.sh — hook PreToolUse agy (matcher ".*"). Dipanggil lewat PATH ABSOLUT dari
# .agents/hooks.json (hasil install.sh); direktori kerja hook tidak stabil, jadi jangan andalkan cwd.
# Tanpa .agents/active-task.json (pemakaian agy interaktif biasa) gate NONAKTIF dan selalu allow.
# Error di sini = exit non-zero = agy memblokir tool (fail-closed, terverifikasi).
PY="$(command -v python3 || command -v python)"
exec "$PY" "$(dirname "${BASH_SOURCE[0]}")/executor.py" gate
