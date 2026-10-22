---
name: dispatch
description: Delegasikan task kode dari plan approved ke executor (Antigravity CLI) lewat brief tertulis, lalu audit, verifikasi ulang sendiri, commit, dan catat bukti. Hanya bila modul executor terpasang dan executor.enabled=true.
argument-hint: "<slug> [T<n>]"
disable-model-invocation: true
---
# /harness:dispatch

Masukan: `$ARGUMENTS` (slug, opsional `T<n>`). Claude = perencana + verifikator + yang meng-commit; `agy` = executor satu task. Sesi ini adalah sesi **eksekusi** (pengganti `/harness:build` untuk kode).

## Prasyarat (cek dulu, berhenti bila gagal)
- `harness.config.json` → `executor.enabled` bernilai `true`, dan `scripts/executor/dispatch-executor.sh` ada. Bila tidak: laporkan bahwa modul belum aktif (lihat `scripts/executor/README.md`) dan tawarkan `/harness:build <slug>`.
- `node .claude/hooks/harness.mjs show <slug>`: status `approved` atau `in-progress`. Bila `approved`, jalankan `node .claude/hooks/harness.mjs start <slug>`.
- Perubahan skema/migrasi **tidak** didelegasikan: tetap lewat agent `dba`.

## Langkah per task
1. Baca `plan.md` (tabel Langkah, AC), `impact.md`, `progress.md`. Satu baris Langkah = satu task `T<n>` pada satu service. Tanpa argumen `T<n>`: ambil task berikutnya yang belum selesai di `progress.md`.
2. Pastikan branch kerja di `source-code/<svc>` bukan branch dilindungi dan working tree bersih (dispatch menolak bila tidak).
3. Tulis brief: salin `scripts/executor/templates/brief.md` ke `docs/work/<slug>/tasks/T<n>.brief.md`, isi lengkap. Agy **tidak** melihat chat; semua yang ia perlu harus ada di brief:
   - Scope sesempit mungkin, di bawah `source-code/<svc>/`; direktori diakhiri `/`. Manifest dependency hanya bila memang diperlukan dan disebut persis.
   - AC disalin dari `plan.md` (teks AC, bukan ringkasan).
   - Done-when: jalankan `python3 scripts/executor/executor.py checks <svc>` lalu pilih mode di template. `agent_runs: true` → **Mode A**: agy menjalankan `agent_commands` persis (tanpa `cd`/pipe). `agent_runs: false` → **Mode B**: agy tidak menjalankan cek apa pun; Claude yang menjalankan `commands` di langkah 6. Jangan menaruh perintah cek di brief bila mode B.
4. Jalankan `bash scripts/executor/dispatch-executor.sh <slug> T<n> <svc>` (tanpa redirect atau pipe). Tindak lanjut menurut exit code:

| exit | arti | tindakan |
|---|---|---|
| 0 | audit lolos | lanjut ke langkah 5 |
| 10 | lingkungan/enabled | `bash scripts/executor/preflight.sh`, laporkan, berhenti |
| 11 | prasyarat task (plan/branch/tree/brief/Scope) | baca stderr, perbaiki penyebabnya |
| 12 | agy gagal | baca `T<n>.stderr`; boleh ulang satu kali |
| 13 | izin ditolak / hook gagal | **jangan diulang**; baca `T<n>.gate.log` dan `T<n>.envelope.json`, laporkan ke user |
| 14 | audit melanggar Scope | baca `T<n>.audit.json`; **jangan commit**; laporkan ke user, perubahan dibatalkan oleh user |
| 15 | agy melapor BLOCKED | baca `open_questions` di `T<n>.result.json`; perbaiki brief atau tanya user |

5. Baca hasil sebagai klaim: `T<n>.result.json`, `T<n>.audit.json`, dan `git -C source-code/<svc> diff` (baca diff-nya sendiri). Status `PARTIAL` diperlakukan sebagai belum selesai.
6. Verifikasi sendiri: jalankan `commands` dari `executor.py checks <svc>` (mode B: ini pertama kalinya cek dijalankan, setelah Anda membaca diff; mode A: jalankan ulang) dan buktikan tiap AC dengan output nyata (termasuk perilaku runtime/curl yang tidak boleh dijalankan agy). Jangan mengandalkan `commands_run` milik agy.
7. Gagal → tulis `T<n>.feedback.md` yang konkret (file:baris, output asli, yang diharapkan), lalu `bash scripts/executor/dispatch-executor.sh <slug> T<n> <svc> --resume`. AC yang sama gagal 3× → berhenti dan eskalasi ke user (kemungkinan plan perlu `reopen`).
8. Lolos → commit di service (`git -C source-code/<svc> add -A` lalu `git commit`, pesan sesuai konvensi repo). Tulis `- AC<n>: <bukti>` di `progress.md` bagian `## Verifikasi` dan perbarui "Status terkini".

Semua AC punya bukti → `node .claude/hooks/harness.mjs set-status <slug> in-review`.

## Aturan
- Satu task per panggilan dispatch; urut per service.
- Jangan mengubah `scripts/executor/`, `.agents/`, allowlist, atau `harness.config.json` (dilindungi hook). Jangan meminta `--mode auto` atau `--dangerously-skip-permissions`.
- Penolakan izin bukan alasan mengulang dengan cara lain; perbaiki penyebabnya atau laporkan.
- Temuan di luar plan → `progress.md` bagian "Di luar lingkup".

## Balasan chat (maks 5 baris)
Task selesai x/y · AC terbukti · exit code terakhir · path `progress.md` · berikutnya: `/harness:dispatch <slug>` atau `/harness:review <slug>`
