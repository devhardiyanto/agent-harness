#!/usr/bin/env bash
# scripts/executor/audit-scope.sh <work-id> <task-id> <service>
# Audit pasca-eksekusi (L4): diff git di source-code/<service> vs Scope di brief, file manifest,
# commit tak sah, perubahan liar di root, plus transcript agy sebagai bukti tambahan. Exit 14 bila melanggar.
PY="$(command -v python3 || command -v python)"
exec "$PY" "$(dirname "${BASH_SOURCE[0]}")/executor.py" audit "$@"
