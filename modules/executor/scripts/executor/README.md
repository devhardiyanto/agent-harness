# Modul executor (opsional) — Claude Code merencanakan, Antigravity CLI (`agy`) mengeksekusi

Default **nonaktif** (`executor.enabled: false`). Tanpa modul ini, harness v1 berjalan persis seperti biasa.

## Pembagian peran

| Fase harness | Pemilik | Catatan |
|---|---|---|
| impact, plan, approve | Claude + manusia | tidak berubah; `plan.md` approved adalah syarat dispatch |
| build (kode) | `agy` lewat `/harness:dispatch` | satu task per panggilan, tanpa commit/push |
| audit scope | skrip (`executor.py audit`) | deterministik: diff git vs Scope, manifest, commit liar, perubahan root |
| verifikasi | Claude | membaca diff sendiri, menjalankan ulang perintah cek, bukti per AC di `progress.md` |
| commit per task | Claude | di branch kerja service |
| review, ship | tidak berubah | `/harness:review`, `/harness:ship` |

## Lapisan kontrol

| lapisan | mekanisme |
|---|---|
| L0 | `plan.md` harus `approved`/`in-progress` dan mencakup service (diperiksa `prepare`, karena agy menulis di luar hook Claude) |
| L1 | branch kerja wajib (bukan branch dilindungi), working tree bersih sebelum run |
| L2 | `--mode accept-edits` + allowlist `command(...)` agy (pencocokan tepat); tanpa `--mode auto` |
| L3 | hook `PreToolUse` agy (`executor.py gate`): tulis hanya di Scope, path harness tak pernah boleh, tool jaringan ditolak |
| L4 | audit pasca-run: diff vs Scope, manifest dependency, commit tak sah, perubahan liar di root |
| L5 | Claude membaca diff dan menjalankan ulang cek yang sama; laporan agy hanya klaim |
| sisi Claude | `.agents/**` dan `scripts/executor/**` dilindungi hook gerbang harness (Edit/Write/Bash) |

## Pasang

```bash
node install.mjs /path/ke/project --with-executor     # dari repo agent-harness; tambah --dry-run untuk meninjau
```
Lalu di root project (Windows: **Git Bash**):

1. Isi perintah cek per service di `harness.config.json` (edit manual; file dilindungi dari agent):
   ```json
   "checks": { "<service>": { "lint": "npm run lint", "test": "npm test" } }
   ```
   Hanya perintah ini (dan `git status`, `git diff`) yang boleh dijalankan agy; null/kosong dilewati. Skema lama `projects.<svc>.{lint_command,test_command}` tetap dibaca sebagai cadangan.
2. `bash scripts/executor/test-executor.sh` — uji tanpa agy asli (agy tiruan).
3. `bash scripts/executor/install.sh` — menulis `.agents/hooks.json` (path absolut, lokal mesin) dan menggabungkan allowlist ke `settings.json` agy **global** (backup otomatis). Trust workspace diatur sendiri lewat agy interaktif; tanpa itu hook tidak dimuat.
4. (opsional) `bash scripts/executor/e2e-smoke.sh ~/agy-e2e` lalu `... --run ~/agy-e2e` — uji dengan agy asli di folder sekali pakai (1 panggilan model).
5. Aktifkan: `"executor": { "enabled": true }`, lalu `/harness:dispatch <slug>`.

## Konfigurasi (`harness.config.json` → `executor`)

| kunci | bawaan | arti |
|---|---|---|
| `enabled` | `false` | `EXECUTOR_FORCE=1` mengabaikannya (hanya untuk uji) |
| `print_timeout` | `"10m"` | batas waktu satu run agy |
| `sandbox` | `true` | lihat "Sandbox dan keputusan D7" |
| `path_prepend` | `[]` | direktori yang ditambahkan ke PATH agy (mis. shim mise/nvm), slash maju |
| `allowed_commands` | `git status`, `git diff` | ditambah perintah dari `checks.<svc>` |
| `require_approved_plan` | `true` | `false` hanya untuk uji |
| `min_version`, `model`, `effort`, `ttl_minutes`, `protected_branches` | lihat `executor.py` | |

## Exit code `dispatch-executor.sh`

| exit | arti |
|---|---|
| 0 | audit lolos, status agy DONE/PARTIAL (PARTIAL = belum selesai; baca `T<n>.result.json`) |
| 10 | preflight gagal / `enabled=false` |
| 11 | prasyarat task (plan, branch, tree kotor, brief, Scope) |
| 12 | agy gagal (stdout kosong, bukan JSON, tanpa `structured_output`) |
| 13 | izin ditolak (`denied_actions`) atau hook gagal — **jangan diulang** sebelum penyebabnya diperbaiki |
| 14 | audit menemukan pelanggaran (`T<n>.audit.json`) |
| 15 | agy melapor `BLOCKED` (ambigu / butuh di luar Scope) — baca `open_questions` |

Exit code agy sendiri tidak mencerminkan penolakan izin; sinyalnya `denied_actions`, teks `JSON hook ... failed`, dan `T<n>.gate.log`.

Berkas per task di `docs/work/<slug>/tasks/`: `T<n>.brief.md` dan `T<n>.feedback.md` (masukan), `.envelope.json .result.json .gate.log .audit.json .base .rootbase .conversation` (keluaran), `.stdout .stderr .agy.log` (log lokal, di-gitignore).

## Sandbox dan keputusan D7

Terverifikasi di Windows 11 + Git Bash: dengan `--sandbox`, toolchain di luar workspace (node via mise) tidak ditemukan; agy lalu meminta eksekusi `unsandboxed`, yang ditolak otomatis di headless (exit 13). Dua jalan:

| pilihan | konsekuensi |
|---|---|
| `sandbox: false` + agy menjalankan cek | kode yang baru ditulis agy (test/linter) berjalan **sebelum** Claude membacanya, dengan hak penuh pengguna |
| agy tidak menjalankan cek (kosongkan `checks`) | lebih aman: Claude membaca diff dulu, lalu menjalankan cek sendiri |

Keputusan ada pada pemilik project; modul tidak memutuskan untuk Anda. Kekuatan `--sandbox` di Windows belum diuji — jangan dihitung sebagai pagar.

## Batas yang diketahui

- Gate hanya memeriksa tool tulis yang pernah teramati (`write_file`, `edit_file`, dan nama berpola write/edit/replace/delete/remove/move/rename/create/patch); tool lain diizinkan dan dicatat di `gate.log`. Audit diff git tetap otoritas.
- Agy dapat membaca file harness sendiri (gate hanya membatasi penulisan dan shell).
- Perintah shell tambahan di luar allowlist (mis. `git check-ignore`) menghentikan run tanpa laporan; agent diinstruksikan tidak melakukannya.
- Perubahan pada file root yang sudah kotor sebelum dispatch tidak terdeteksi (audit membandingkan daftar path, bukan isi).
- `transcript_full.jsonl` adalah lokasi internal agy: bukti tambahan, bukan otoritas.
- `settings.json` agy bersifat global dan memuat izin hasil "always allow" interaktif; preflight hanya memperingatkan entri di luar harness.
- Diverifikasi pada agy 1.4.3. Agent kustom wajib mendeklarasikan `tools:` (termasuk `finish`), kalau tidak `structured_output` tidak muncul.
