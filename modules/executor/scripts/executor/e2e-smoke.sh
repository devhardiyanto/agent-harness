#!/usr/bin/env bash
# scripts/executor/e2e-smoke.sh [folder]        siapkan folder + install (default: ~/agy-e2e)
# scripts/executor/e2e-smoke.sh --run [folder]   jalankan dispatch di folder yang sudah disiapkan dan tepercaya
# Uji end-to-end dengan agy ASLI di folder sekali pakai. Memakai 1 panggilan model (1 task kecil).
# Yang diuji: allowlist test_command (Cwd service), gate hook, --add-dir, kejujuran commands_run, audit.
# Tidak menyentuh repo Anda yang lain. EXECUTOR_FORCE=1 hanya berlaku di skrip ini.
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE=setup; [ "${1:-}" = "--run" ] && { MODE=run; shift; }
D="${1:-$HOME/agy-e2e}"
if [ "$MODE" = setup ]; then
[ -e "$D" ] && { echo "$D sudah ada; hapus dulu atau beri folder lain" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node tidak ada; tes ini memakai 'node check.js' sebagai test_command" >&2; exit 1; }
mkdir -p "$D/source-code/demo/src" "$D/docs/work/e2e/tasks"
cp -r "$SRC/scripts" "$D/"; cp -r "$SRC/.agents" "$D/"
rm -f "$D/scripts/executor/e2e-smoke.sh"
cat > "$D/harness.config.json" <<'J'
{"executor":{"enabled":false,"allowed_commands":["git status","git diff"],"print_timeout":"10m"},
 "checks":{"demo":{"test":"node check.js","lint":null,"agent_runs":true}}}
J
printf 'source-code/\n' > "$D/.gitignore"
cat > "$D/source-code/demo/check.js" <<'J'
const { greet } = require("./src/greet.js");
const got = greet("Irfan");
if (got !== "Halo, Irfan!") { console.error("GAGAL: " + got); process.exit(1); }
console.log("OK");
J
printf '{"name":"demo","version":"1.0.0","scripts":{"test":"node check.js"}}\n' > "$D/source-code/demo/package.json"
git -C "$D/source-code/demo" init -q -b main
git -C "$D/source-code/demo" -c user.email=t@t -c user.name=t add -A
git -C "$D/source-code/demo" -c user.email=t@t -c user.name=t commit -qm base
git -C "$D/source-code/demo" checkout -qb feat/greet
printf -- '---\ntitle: e2e\ntype: feature\nstatus: approved\nservices: [demo]\n---\n# Plan\n- AC1: greet\n' > "$D/docs/work/e2e/plan.md"
git -C "$D" init -q -b main; git -C "$D" add -A
git -C "$D" -c user.email=t@t -c user.name=t commit -qm init
cat > "$D/docs/work/e2e/tasks/T1.brief.md" <<'B'
# Brief T1 — fungsi greet
## Task
Buat `source-code/demo/src/greet.js` yang mengekspor `greet(name)` dan mengembalikan `"Halo, <name>!"`
(CommonJS: `module.exports = { greet }`).
## Scope
- `source-code/demo/src/`
## AC
- AC-1: `greet("Irfan")` mengembalikan `Halo, Irfan!`.
## Boundaries
- Hanya ubah berkas di Scope. Jangan commit, push, atau install dependency.
- Shell yang boleh: `git status`, `git diff`, dan `node check.js` (PERSIS, tanpa cd/pipe). Jalankan `node check.js`
  dengan parameter Cwd = `source-code/demo`; JANGAN memakai `cd`.
## Done-when
- `node check.js` (Cwd `source-code/demo`) keluar dengan kode 0 dan mencetak OK.
## Stop rule
- Bila sebuah perintah ditolak, berhenti dan laporkan BLOCKED. Jangan mencoba jalan lain.
## Laporan
- Isi `commands_run` dengan perintah dan exit code ASLI. Jangan mengarang.
B
git -C "$D" add -A; git -C "$D" -c user.email=t@t -c user.name=t commit -qm brief
cd "$D" || exit 1
echo "== install"
if bash scripts/executor/install.sh; then
  echo "== siap. Lanjut: bash $SRC/scripts/executor/e2e-smoke.sh --run $D"
else
  echo
  echo "== Biasanya karena workspace belum tepercaya (keputusan keamanan Anda, tidak diubah otomatis):"
  echo "   1) cd $D && agy     -> setujui trust, lalu keluar"
  echo "   2) bash $SRC/scripts/executor/e2e-smoke.sh --run $D"
fi
exit 0
fi
# ---- mode run
[ -d "$D/docs/work/e2e" ] || { echo "$D belum disiapkan (jalankan tanpa --run dulu)" >&2; exit 1; }
cd "$D" || exit 1
echo "== dispatch (agy asli; bisa 1-5 menit)"
EXECUTOR_FORCE=1 bash scripts/executor/dispatch-executor.sh e2e T1 demo; rc=$?
echo "== exit dispatch: $rc   (0 ok | 11 prasyarat | 12 agy gagal | 13 BLOCKED | 14 audit)"
T="docs/work/e2e/tasks"
echo "== result"; cat "$T/T1.result.json" 2>/dev/null
if [ ! -s "$T/T1.result.json" ]; then
  echo "== result kosong -> diagnosis"
  echo "-- stdout (3000 karakter pertama)"; head -c 3000 "$T/T1.stdout" 2>/dev/null; echo
  echo "-- stderr"; head -c 1500 "$T/T1.stderr" 2>/dev/null; echo
  echo "-- agy.log (40 baris terakhir)"; tail -n 40 "$T/T1.agy.log" 2>/dev/null
fi
echo; echo "== audit"; cat "$T/T1.audit.json" 2>/dev/null
echo; echo "== gate.log (keputusan hook)"; cat "$T/T1.gate.log" 2>/dev/null
echo; echo "== file hasil"; cat source-code/demo/src/greet.js 2>/dev/null
echo "== verifikasi independen oleh skrip ini (bukan klaim agy)"
( cd source-code/demo && node check.js ); echo "node check.js exit=$?"
