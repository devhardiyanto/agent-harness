#!/usr/bin/env bash
# scripts/executor/test-executor.sh — uji executor kit TANPA agy asli (pakai agy tiruan di folder sementara).
# Jalankan: bash scripts/executor/test-executor.sh   (butuh bash, python3, git)
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
# Git Bash di Windows: mktemp memberi '/tmp/...' (bentuk MSYS) sedangkan python native memakai 'C:/...'.
# Samakan ke bentuk campuran 'C:/...' agar perbandingan path (gate, trust, hooks.json) konsisten.
command -v cygpath >/dev/null 2>&1 && T="$(cygpath -m "$T")"
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL %s\n' "$1"; }
expect() { [ "$2" = "$3" ] && ok "$1" || bad "$1 (dapat '$2', harapan '$3')"; }

R="$T/root"; mkdir -p "$R/scripts" "$R/source-code" "$T/bin" "$T/home/.gemini/antigravity-cli"
cp -r "$SRC/scripts/executor" "$R/scripts/"
cat > "$R/harness.config.json" <<'J'
{"executor":{"enabled":true,"allowed_commands":["git status","git diff"]},"checks":{"svc":{"test":"npm test","lint":null,"agent_runs":true},"manual":{"test":"make verify","lint":"make lint"}},"projects":{"other":{"test_command":"go test ./...","lint_command":"{{LINT}}"}}}
J
git -C "$R" init -q; git -C "$R" config user.email t@t; git -C "$R" config user.name t
printf 'source-code/\n.agents/hooks.json\n.agents/active-task.json\n' > "$R/.gitignore"
mkdir -p "$R/source-code/svc/src"; S="$R/source-code/svc"
git -C "$S" init -q -b main; git -C "$S" config user.email t@t; git -C "$S" config user.name t
echo base > "$S/src/a.txt"; echo '{}' > "$S/package.json"; git -C "$S" add -A; git -C "$S" commit -qm base
git -C "$S" checkout -qb feat/x
git -C "$R" add -A; git -C "$R" commit -qm init

export AGY_SETTINGS="$T/home/.gemini/antigravity-cli/settings.json" AGY_HOME="$T/home/.gemini/antigravity-cli"
printf '{"trustedWorkspaces":["%s"],"other":{"keep":true}}\n' "$R" > "$AGY_SETTINGS"
# PATH dipisah ':' -> JANGAN pakai bentuk 'C:/...' di sini (titik dua drive memecah entri). Pakai bentuk POSIX/MSYS.
BINDIR="$T/bin"; command -v cygpath >/dev/null 2>&1 && BINDIR="$(cygpath -u "$BINDIR")"
export PATH="$BINDIR:$PATH"

cat > "$T/bin/agy" <<'STUB'
#!/usr/bin/env bash
[ "${1:-}" = "--version" ] && { echo "1.4.2"; exit 0; }
SVC="$PWD/source-code/svc"
case "${STUB_MODE:-ok}" in
  ok)       echo edit > "$SVC/src/b.txt" ;;
  oos)      mkdir -p "$SVC/other"; echo x > "$SVC/other/c.txt" ;;
  manifest) echo '{"x":1}' > "$SVC/package.json" ;;
  commit)   echo y > "$SVC/src/b.txt"; git -C "$SVC" add -A; git -C "$SVC" commit -qm sneaky ;;
  rootchg)  echo z > "$PWD/AGENTS.md" ;;
  gatedeny) echo edit > "$SVC/src/b.txt"; printf '%s' '{"toolCall":{"name":"read_file","args":{"Path":"https://example.com"}}}' | bash "$PWD/scripts/executor/agy-gate.sh" >/dev/null ;;
esac
CID="conv-${STUB_MODE:-ok}"
case "${STUB_MODE:-ok}" in
  denied)    echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"","denied_actions":[{"action":"command","display_name":"RunCommand"}]}' ;;
  empty)     ;;
  nostruct)  echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"ok"}' ;;
  blocked)   echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"ok","structured_output":{"task_id":"T1","status":"BLOCKED","files_changed":[],"commands_run":[],"ac_claims":[],"deviations":[],"open_questions":["Scope kurang?"]}}' ;;
  partial)   echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"ok","structured_output":{"task_id":"T1","status":"PARTIAL","files_changed":[],"commands_run":[],"ac_claims":[],"deviations":[],"open_questions":[]}}' ;;
  hookfail)  echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"Encountered error in tool execution: JSON hook \"x\" failed: command failed: exit status 127","structured_output":{"task_id":"T1","status":"BLOCKED","files_changed":[],"commands_run":[],"ac_claims":[],"deviations":[],"open_questions":["?"]}}' ;;
  *)         echo '{"conversation_id":"'$CID'","status":"SUCCESS","response":"ok","structured_output":{"task_id":"T1","status":"DONE","files_changed":["source-code/svc/src/b.txt"],"commands_run":[],"ac_claims":[{"id":"AC-1","evidence":"src/b.txt"}],"deviations":[],"open_questions":[]}}' ;;
esac
STUB
chmod +x "$T/bin/agy"
# Pengaman: bash HARUS memakai agy tiruan, bukan agy asli yang mungkin terpasang (agy asli = panggilan model sungguhan).
[ "$(bash -c 'agy --version' 2>/dev/null | tr -d '\r')" = "1.4.2" ] && [ "$(command -v agy)" = "$BINDIR/agy" ] \
  || { echo "ABORT: 'agy' di PATH bukan agy tiruan ($(command -v agy)); tes dihentikan agar agy asli tidak terpanggil" >&2; exit 2; }

mkdir -p "$R/docs/work/w1/tasks"
setplan() { printf -- '---\ntitle: w1\ntype: feature\nstatus: %s\nservices: [%s]\n---\n# Plan\n- AC1: x\n' "$1" "$2" > "$R/docs/work/w1/plan.md"; }
setplan approved svc
cat > "$R/docs/work/w1/tasks/T1.brief.md" <<'B'
# Brief T1
## Task
x
## Scope
- `source-code/svc/src/`
## AC
- AC-1
B

echo "== 1. gate (unit)"
python3 "$R/scripts/executor/executor.py" gate-selftest; expect "gate-selftest" "$?" 0

echo "== 2. install + preflight"
bash "$R/scripts/executor/install.sh" >/dev/null 2>"$T/pre.err"; expect "install.sh exit" "$?" 0
grep -q '"command(git status)"' "$AGY_SETTINGS" && ok "allowlist digabung" || bad "allowlist digabung"
grep -q '"command(npm test)"' "$AGY_SETTINGS" && ok "agent_runs:true -> checks.<svc>.test masuk allowlist" || bad "agent_runs:true masuk allowlist"
grep -q 'make verify' "$AGY_SETTINGS" && bad "agent_runs tidak diset (bawaan false) tidak boleh masuk allowlist" || ok "agent_runs bawaan false: cek TIDAK masuk allowlist"
grep -q 'go test' "$AGY_SETTINGS" && bad "fallback projects.<svc> mengikuti bawaan false" || ok "fallback projects.<svc>: bawaan false, tidak masuk allowlist"
CK="$(python3 "$R/scripts/executor/executor.py" checks manual | tr -d '\r')"
echo "$CK" | grep -q '"agent_runs": false' && echo "$CK" | grep -q 'make verify' && echo "$CK" | grep -q '"agent_commands": \[\]' && ok "executor.py checks: Claude melihat perintah, agent_commands kosong" || bad "executor.py checks manual: $CK"
python3 "$R/scripts/executor/executor.py" checks svc | tr -d '\r' | grep -q '"agent_runs": true' && ok "executor.py checks svc: agent_runs true" || bad "checks svc"
grep -q '{{LINT}}' "$AGY_SETTINGS" && bad "placeholder tidak boleh masuk allowlist" || ok "placeholder/null dilewati"
grep -q '"keep": true' "$AGY_SETTINGS" && ok "field lain di settings.json utuh" || bad "field lain utuh"
grep -q "$R/scripts/executor/executor.py" "$R/.agents/hooks.json" && ok "hooks.json path absolut" || bad "hooks.json path absolut"
grep -q '"command": "bash' "$R/.agents/hooks.json" && bad "hooks.json tidak boleh memakai bash (WSL di Windows)" || ok "hooks.json tanpa bash"
bash "$R/scripts/executor/install.sh" >/dev/null 2>&1; expect "install idempoten" "$(grep -c 'command(git status)' "$AGY_SETTINGS")" 1
grep -q "hook gate jalan dari direktori kerja asing" "$T/pre.err" && ok "preflight menguji hook dari cwd asing" || bad "preflight cwd asing"

run() { ( cd "$R" && STUB_MODE="$1" bash scripts/executor/dispatch-executor.sh w1 T1 svc "${@:2}" >"$T/out.txt" 2>"$T/err.txt" ); echo $?; }
reset() { git -C "$S" reset -q --hard "$(cat "$R/docs/work/w1/tasks/T1.base" 2>/dev/null || git -C "$S" rev-parse HEAD)"; git -C "$S" clean -qfd; git -C "$R" checkout -q -- AGENTS.md 2>/dev/null; rm -f "$R/AGENTS.md" "$R"/docs/work/w1/tasks/T1.{base,rootbase,conversation,stdout,stderr,envelope.json,result.json,audit.json,gate.log}; }

echo "== 3. dispatch"
expect "jalur normal -> 0" "$(run ok)" 0; reset
expect "edit di luar Scope -> 14" "$(run oos)" 14; grep -q out_of_scope "$R/docs/work/w1/tasks/T1.audit.json" && ok "audit mencatat out_of_scope" || bad "audit out_of_scope"; reset
expect "edit manifest di luar Scope -> 14" "$(run manifest)" 14; reset
sed -i 's#`source-code/svc/src/`#`source-code/svc/**`#' "$R/docs/work/w1/tasks/T1.brief.md"
expect "manifest di dalam glob lebar -> 14" "$(run manifest)" 14; grep -q manifest_change "$R/docs/work/w1/tasks/T1.audit.json" && ok "audit mencatat manifest_change" || bad "audit manifest_change"; reset
sed -i 's#`source-code/svc/\*\*`#`source-code/svc/src/`#' "$R/docs/work/w1/tasks/T1.brief.md"
expect "commit liar -> 14" "$(run commit)" 14; grep -q commit_made "$R/docs/work/w1/tasks/T1.audit.json" && ok "audit mencatat commit_made" || bad "audit commit_made"; reset
expect "perubahan liar di root -> 14" "$(run rootchg)" 14; reset
expect "run ok (untuk uji hasil basi)" "$(run ok)" 0
git -C "$S" clean -qfd   # bersihkan service saja; result.json run sebelumnya sengaja dibiarkan
expect "hook gate menolak tapi agy lanjut -> exit 0 (tidak terlihat di denied_actions)" "$(run gatedeny)" 0
grep -q "gate menolak 1 panggilan" "$R/docs/work/w1/tasks/T1.audit.json" && ok "audit memberi warning penolakan gate" || bad "warning penolakan gate"; reset
expect "denied_actions -> 13" "$(run denied)" 13
[ ! -e "$R/docs/work/w1/tasks/T1.result.json" ] && ok "result.json lama dibuang sebelum run" || bad "result.json lama masih ada (hasil basi)"
reset
expect "hook gagal -> 13" "$(run hookfail)" 13; reset
expect "stdout kosong -> 12" "$(run empty)" 12; reset
expect "agy melapor BLOCKED -> 15" "$(run blocked)" 15; reset
expect "agy melapor PARTIAL -> 0" "$(run partial)" 0; reset
setplan draft svc;           expect "plan draft -> 11" "$(run ok)" 11; grep -q "berstatus 'draft'" "$T/err.txt" && ok "pesan: plan belum approved" || bad "pesan plan draft"
setplan approved other;      expect "plan tidak mencakup service -> 11" "$(run ok)" 11
setplan in-progress svc;     expect "plan in-progress -> 0" "$(run ok)" 0; reset
rm -f "$R/docs/work/w1/plan.md"; expect "plan.md hilang -> 11" "$(run ok)" 11
setplan approved svc
expect "tanpa structured_output -> 12" "$(run nostruct)" 12; reset
echo dirty > "$S/src/a.txt"; expect "tree kotor -> 11" "$(run ok)" 11; git -C "$S" checkout -q -- .
git -C "$S" checkout -q main; expect "branch terlindung -> 11" "$(run ok)" 11; git -C "$S" checkout -q feat/x
[ ! -e "$R/.agents/active-task.json" ] && ok "active-task.json dibersihkan" || bad "active-task.json dibersihkan"

echo "== 4. resume"
run ok >/dev/null; echo "perbaiki b.txt" > "$R/docs/work/w1/tasks/T1.feedback.md"
expect "resume -> 0" "$(run ok --resume)" 0
grep -q -- "--conversation" "$T/err.txt" || true

echo "== 5. gate aktif lewat hook (payload nyata)"
( cd "$R" && python3 scripts/executor/executor.py prepare w1 T1 svc )
d() { printf '%s' "$1" | bash "$R/scripts/executor/agy-gate.sh" | python3 -c 'import json,sys;print(json.load(sys.stdin)["decision"])'; }
expect "write dalam Scope" "$(d '{"toolCall":{"name":"write_file","args":{"Path":"'"$R"'/source-code/svc/src/n.txt","Content":"x"}}}')" allow
expect "write di luar Scope" "$(d '{"toolCall":{"name":"write_file","args":{"Path":"'"$R"'/source-code/svc/zzz.txt","Content":"x"}}}')" deny
expect "test_command service ini diizinkan" "$(d '{"toolCall":{"name":"run_command","args":{"CommandLine":"npm test"}}}')" allow
expect "cek service lain ditolak" "$(d '{"toolCall":{"name":"run_command","args":{"CommandLine":"go test ./..."}}}')" deny
expect "cek service agent_runs:false ditolak untuk svc" "$(d '{"toolCall":{"name":"run_command","args":{"CommandLine":"make verify"}}}')" deny
expect "cd + perintah ditolak (pencocokan tepat)" "$(d '{"toolCall":{"name":"run_command","args":{"CommandLine":"cd source-code/svc; npm test"}}}')" deny
expect "git push ditolak" "$(d '{"toolCall":{"name":"run_command","args":{"CommandLine":"git push"}}}')" deny
# pembacaan: rahasia, riwayat git, luar root, pencarian isi di luar Scope
expect "baca berkas Scope" "$(d '{"toolCall":{"name":"read_file","args":{"AbsolutePath":"'"$R"'/source-code/svc/src/a.txt"}}}')" allow
expect "baca .env ditolak" "$(d '{"toolCall":{"name":"read_file","args":{"AbsolutePath":"'"$R"'/source-code/svc/.env"}}}')" deny
expect "baca .env.example boleh" "$(d '{"toolCall":{"name":"read_file","args":{"AbsolutePath":"'"$R"'/source-code/svc/.env.example"}}}')" allow
expect "baca .git ditolak" "$(d '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"'"$R"'/source-code/svc/.git/config"}}}')" deny
expect "baca di luar root ditolak" "$(d '{"toolCall":{"name":"read_file","args":{"AbsolutePath":"/etc/passwd"}}}')" deny
expect "read_file dengan URL (mengambil jaringan) ditolak" "$(d '{"toolCall":{"name":"read_file","args":{"Path":"https://example.com"}}}')" deny
expect "baca ~/.ssh ditolak" "$(d '{"toolCall":{"name":"read_file","args":{"AbsolutePath":"~/.ssh/id_rsa"}}}')" deny
expect "grep di root service (luar Scope) ditolak" "$(d '{"toolCall":{"name":"grep_search","args":{"SearchPath":"'"$R"'/source-code/svc","Query":"KEY"}}}')" deny
expect "grep di dalam Scope boleh" "$(d '{"toolCall":{"name":"grep_search","args":{"SearchPath":"'"$R"'/source-code/svc/src","Query":"KEY"}}}')" allow
grep -q '"secret": true' "$R/docs/work/w1/tasks/T1.gate.log" && ok "penolakan rahasia tercatat di gate.log" || bad "gate.log mencatat secret"
rm -f "$R/.agents/active-task.json"
# bawaan global agent_runs_checks=true mengaktifkan cek untuk service tanpa flag sendiri (termasuk skema lama)
python3 - "$R/harness.config.json" <<'PY'
import json, sys
p = sys.argv[1]; c = json.load(open(p)); c["executor"]["agent_runs_checks"] = True; json.dump(c, open(p, "w"))
PY
[ "$(python3 "$R/scripts/executor/executor.py" checks manual | tr -d '\r' | grep -c '"agent_runs": true')" = 1 ] && ok "executor.agent_runs_checks=true berlaku untuk service tanpa flag" || bad "agent_runs_checks global"
python3 "$R/scripts/executor/executor.py" checks other | tr -d '\r' | grep -q 'go test' && ok "skema lama ikut bawaan global" || bad "skema lama bawaan global"
expect "tanpa task aktif: gate nonaktif" "$(d '{"toolCall":{"name":"write_file","args":{"Path":"/anywhere","Content":"x"}}}')" allow

echo; echo "lulus=$pass gagal=$fail"; [ "$fail" -eq 0 ]
