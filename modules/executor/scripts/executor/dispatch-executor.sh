#!/usr/bin/env bash
# scripts/executor/dispatch-executor.sh <work-id> <task-id> <service> [--resume]
#
# Menjalankan SATU task di agy dari brief tertulis, lalu audit hasilnya. Dipanggil oleh Claude Code
# (skill /harness:dispatch), bukan oleh manusia. Tidak pernah commit/push; commit adalah tugas Claude (P6).
#
# Exit code:
#   0   selesai, audit lolos, agent_status DONE atau PARTIAL (baca T<n>.result.json; PARTIAL = belum semua AC/cek lulus)
#   10  preflight gagal (lingkungan)        11  prasyarat task gagal (branch/tree/brief/Scope)
#   12  agy gagal (stdout kosong, bukan JSON, status != SUCCESS, tanpa structured_output)
#   13  BLOCKED: izin ditolak (denied_actions) atau hook gagal -> JANGAN diulang tanpa memperbaiki penyebabnya
#   14  audit scope menemukan pelanggaran (lihat T<n>.audit.json)
#   15  agy sendiri melapor BLOCKED (ambigu / butuh di luar Scope): baca open_questions di T<n>.result.json, perbaiki brief
#
# Berkas per task di docs/work/<id>/tasks/: T<n>.brief.md (masukan), T<n>.feedback.md (masukan resume),
# .stdout .stderr .agy.log .envelope.json .result.json .gate.log .audit.json .base .rootbase .conversation (keluaran).
set -uo pipefail

[ $# -ge 3 ] || { sed -n '2,16p' "$0" >&2; exit 11; }
WORK="$1"; TASK="$2"; SVC_NAME="$3"; RESUME=0; [ "${4:-}" = "--resume" ] && RESUME=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$(command -v python3 || command -v python)" || { echo "python3 tidak ditemukan" >&2; exit 10; }
EX="$ROOT/scripts/executor/executor.py"
TD="$ROOT/docs/work/$WORK/tasks"
BRIEF="$TD/$TASK.brief.md"
SVC="$ROOT/source-code/$SVC_NAME"
cfg() { "$PY" "$EX" cfg "$1" "${2:-}" | tr -d '\r'; }  # python di Windows mencetak CRLF; buang CR agar perbandingan string aman

[ -f "$BRIEF" ] || { echo "brief tidak ada: $BRIEF" >&2; exit 11; }
[ -e "$SVC/.git" ] || { echo "bukan repo git: source-code/$SVC_NAME" >&2; exit 11; }

case "$(cfg enabled false)" in True|true) ;; *) [ "${EXECUTOR_FORCE:-0}" = 1 ] || { echo "executor.enabled=false di harness.config.json (aktifkan setelah pilot Claude-only; atau EXECUTOR_FORCE=1 untuk uji)" >&2; exit 10; } ;; esac

"$PY" "$EX" preflight || exit 10

branch="$(git -C "$SVC" branch --show-current)"
for p in $(cfg protected_branches); do
  [ "$branch" = "$p" ] && { echo "branch '$branch' terlindung di source-code/$SVC_NAME; buat branch kerja dulu" >&2; exit 11; }
done
[ -n "$branch" ] || { echo "HEAD detached di source-code/$SVC_NAME" >&2; exit 11; }

CONV=""
if [ "$RESUME" = 1 ]; then
  [ -f "$TD/$TASK.base" ] && [ -f "$TD/$TASK.conversation" ] || { echo "--resume butuh .base dan .conversation dari run sebelumnya" >&2; exit 11; }
  [ -f "$TD/$TASK.feedback.md" ] || { echo "--resume butuh $TASK.feedback.md" >&2; exit 11; }
  CONV="$(cat "$TD/$TASK.conversation")"
else
  [ -z "$(git -C "$SVC" status --porcelain)" ] || { echo "working tree source-code/$SVC_NAME kotor; commit/stash dulu" >&2; exit 11; }
  git -C "$SVC" rev-parse HEAD > "$TD/$TASK.base"
  git -C "$ROOT" status --porcelain 2>/dev/null | sed 's/^...//' > "$TD/$TASK.rootbase"
  rm -f "$TD/$TASK.gate.log"
fi
# keluaran run sebelumnya dibuang SEBELUM agy jalan: result/audit lama tidak boleh tampak seperti hasil run ini
rm -f "$TD/$TASK.result.json" "$TD/$TASK.envelope.json" "$TD/$TASK.audit.json" "$TD/$TASK.stdout" "$TD/$TASK.stderr"

"$PY" "$EX" prepare "$WORK" "$TASK" "$SVC_NAME" || exit 11
trap 'rm -f "$ROOT/.agents/active-task.json"' EXIT

REL="docs/work/$WORK/tasks"
if [ "$RESUME" = 1 ]; then
  PROMPT="Perbaiki sesuai feedback di $REL/$TASK.feedback.md. Baca berkas itu dulu, tetap di dalam Scope pada $REL/$TASK.brief.md, lalu laporkan hasil sesuai skema."
else
  PROMPT="Kerjakan task sesuai brief di $REL/$TASK.brief.md. Baca berkas itu dulu, patuhi Boundaries dan Stop rule, lalu laporkan hasil sesuai skema."
fi

ARGS=(-p "$PROMPT" --agent implementer --mode accept-edits --add-dir "source-code/$SVC_NAME"
      --output-format json --json-schema scripts/executor/result.schema.json
      --print-timeout "$(cfg print_timeout 10m)" --disable-slash-commands --log-file "$TD/$TASK.agy.log")
# --sandbox: bawaan nyala. Di mesin Windows terverifikasi sandbox membuat toolchain (node via mise) tidak ditemukan dan agy
# lalu meminta eksekusi "unsandboxed" (ditolak otomatis -> exit 13). Matikan hanya dengan sadar: executor.sandbox=false.
case "$(cfg sandbox true)" in False|false|0|no) echo "PERINGATAN: executor.sandbox=false; perintah cek berjalan tanpa sandbox" >&2 ;; *) ARGS+=(--sandbox) ;; esac
m="$(cfg model)";  [ -n "$m" ] && ARGS+=(--model "$m")
e="$(cfg effort)"; [ -n "$e" ] && ARGS+=(--effort "$e")
[ -n "$CONV" ] && ARGS+=(--conversation "$CONV")

# PATH untuk agy (mis. shim mise/nvm yang tidak ada di PATH shell pemanggil): executor.path_prepend di harness.config.json
for d in $(cfg path_prepend); do command -v cygpath >/dev/null 2>&1 && d="$(cygpath -u "$d")"; PATH="$d:$PATH"; done; export PATH
( cd "$ROOT" && "$(cfg command agy)" "${ARGS[@]}" > "$TD/$TASK.stdout" 2> "$TD/$TASK.stderr" )
echo "agy exit=$? (diabaikan: exit code agy tidak mencerminkan penolakan izin)" >&2

rc=0
"$PY" "$EX" envelope "$WORK" "$TASK"; erc=$?
[ "$erc" -ne 0 ] && rc=$erc
"$PY" - "$TD/$TASK.envelope.json" "$TD/$TASK.conversation" <<'PYEOF' 2>/dev/null
import json, sys
try: open(sys.argv[2], "w").write(json.load(open(sys.argv[1])).get("conversation_id", ""))
except Exception: pass
PYEOF

"$PY" "$EX" audit "$WORK" "$TASK" "$SVC_NAME"; arc=$?
[ "$rc" -eq 0 ] && [ "$arc" -ne 0 ] && rc=$arc
if [ "$rc" -eq 0 ]; then  # audit lolos; agy yang melapor BLOCKED tetap bukan "selesai"
  st="$("$PY" - "$TD/$TASK.result.json" <<'PYEOF' 2>/dev/null
import json, sys
try: print(json.load(open(sys.argv[1])).get("status", ""))
except Exception: print("")
PYEOF
)"
  [ "$(printf %s "$st" | tr -d '\r')" = "BLOCKED" ] && rc=15
fi
exit "$rc"
