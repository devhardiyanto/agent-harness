#!/usr/bin/env bash
# scripts/executor/install.sh — pasang executor di mesin ini (idempoten, aman diulang).
#   1. tulis .agents/hooks.json dengan path ABSOLUT ke gate (berkas lokal mesin, masuk .gitignore)
#   2. gabungkan allowlist command() ke settings.json agy (backup otomatis; field lain tidak disentuh)
#   3. cek trust workspace via preflight (trust TIDAK diubah otomatis: itu keputusan keamanan Anda)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$(command -v python3 || command -v python)" || { echo "python3 tidak ditemukan" >&2; exit 10; }
EX="$ROOT/scripts/executor/executor.py"
"$PY" "$EX" hooks-gen
"$PY" "$EX" settings-merge
touch "$ROOT/.gitignore"
for l in ".agents/hooks.json" ".agents/active-task.json" "docs/work/*/tasks/*.stdout" "docs/work/*/tasks/*.stderr" "docs/work/*/tasks/*.agy.log"; do
  grep -qxF "$l" "$ROOT/.gitignore" || echo "$l" >> "$ROOT/.gitignore"
done
echo "--- preflight" >&2
"$PY" "$EX" preflight
