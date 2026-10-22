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
| L3 | hook `PreToolUse` agy (`executor.py gate`): tulis hanya di Scope, path harness tak pernah boleh, tool jaringan ditolak; **baca**: rahasia (`.env*`, `*.pem`, `*.key`, `.ssh`, `.aws`, `.git/**`, …), path di luar root workspace, dan pencarian isi (grep) di luar Scope ditolak |
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
   "checks": { "<service>": { "lint": "npm run lint", "test": "npm test", "agent_runs": false } }
   ```
   `lint`/`test` adalah perintah yang Claude jalankan saat verifikasi. `agent_runs` menentukan apakah **agy juga boleh** menjalankannya (lihat "Keputusan D7"). Bawaan `false`. Null/kosong dilewati. Skema lama `projects.<svc>.{lint_command,test_command}` tetap dibaca sebagai cadangan dan mengikuti `executor.agent_runs_checks`.
2. `bash scripts/executor/test-executor.sh` — uji tanpa agy asli (agy tiruan).
3. `bash scripts/executor/install.sh` — menulis `.agents/hooks.json` (path absolut, lokal mesin) dan menggabungkan allowlist ke `settings.json` agy **global** (backup otomatis). Trust workspace diatur sendiri lewat agy interaktif; tanpa itu hook tidak dimuat.
4. (opsional, disarankan sebelum aktif) uji dengan agy asli di folder sekali pakai (masing-masing 1 panggilan model):
   - `bash scripts/executor/e2e-smoke.sh ~/agy-e2e` (siapkan; folder lama dihapus dulu: salinan `scripts/` di dalamnya dibuat saat setup dan tidak ikut diperbarui)
   - `... --run ~/agy-e2e` — jalur **positif**: task kecil harus selesai dan lolos audit. Briefnya mengikuti `checks.demo.agent_runs` di `~/agy-e2e/harness.config.json`: `true` = Mode A (agy menjalankan `node check.js`), `false` = Mode B (agy tidak menjalankan cek; `commands_run` harus kosong). Untuk menguji Mode B ubah nilainya lalu jalankan `--run` lagi; sisa run sebelumnya dibuang otomatis, dan skrip menilai PASS/FAIL sesuai mode.
   - `... --negative ~/agy-e2e` — jalur **negatif**: agy diminta mencoba baca `.env` (canary), tulis di luar Scope / path terlindung, shell di luar allowlist, baca di luar root, baca `.git`, grep di luar Scope, dan jaringan. Hasil per probe: `OK` ditolak gate, `FAIL` lolos/bocor (exit 2), `TIDAK TERUJI` agy tidak mencoba (exit 3, ulangi). Penolakan oleh hook gate **tidak** mengubah exit dispatch (agy hanya melihat tool ditolak lalu lanjut; terbukti di agy 1.4.5: exit 0, `denied_actions` kosong); sinyalnya `gate.log` dan warning audit "gate menolak N panggilan".
5. Aktifkan: `"executor": { "enabled": true }`, lalu `/harness:dispatch <slug>`.

## Konfigurasi (`harness.config.json` → `executor`)

| kunci | bawaan | arti |
|---|---|---|
| `enabled` | `false` | `EXECUTOR_FORCE=1` mengabaikannya (hanya untuk uji) |
| `print_timeout` | `"10m"` | batas waktu satu run agy |
| `sandbox` | `true` | `false` hanya bila mode A di mesin yang toolchain-nya tidak terjangkau sandbox (lihat D7) |
| `path_prepend` | `[]` | direktori yang ditambahkan ke PATH agy (mis. shim mise/nvm), slash maju |
| `allowed_commands` | `git status`, `git diff` | ditambah perintah cek service yang `agent_runs`-nya aktif |
| `agent_runs_checks` | `false` | bawaan global bila `checks.<svc>.agent_runs` tidak diisi |
| `require_approved_plan` | `true` | `false` hanya untuk uji |
| `read_outside_root` | `false` | `true` mengizinkan baca di luar root workspace (rahasia tetap ditolak). Hanya bila agy memang perlu membaca pustaka sistem |
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

Exit code agy sendiri tidak mencerminkan penolakan izin; sinyalnya `denied_actions`, teks `JSON hook ... failed`, dan `T<n>.gate.log`. Penolakan oleh **hook gate** (agent mencoba tindakan terlarang tetapi tool ditolak) tidak masuk `denied_actions` dan tidak mengubah exit code; audit menambahkan warning "gate menolak N panggilan" dan Claude wajib membacanya saat verifikasi.

Berkas per task di `docs/work/<slug>/tasks/`: `T<n>.brief.md` dan `T<n>.feedback.md` (masukan), `.envelope.json .result.json .gate.log .audit.json .base .rootbase .conversation` (keluaran), `.stdout .stderr .agy.log` (log lokal, di-gitignore).

## Keputusan D7: siapa yang menjalankan lint/test (per service)

`checks.<svc>.agent_runs` diputuskan **per service**, di `harness.config.json` root (bukan di repo service: izin eksekusi adalah keputusan pemilik workspace; file di repo service bisa diubah kontributor atau oleh agy sendiri).

| `agent_runs` | mode brief | yang terjadi |
|---|---|---|
| `false` (bawaan) | B | agy hanya `git status`/`git diff`. Claude membaca diff dulu, lalu menjalankan `checks` sendiri. Perintah cek **tidak** masuk allowlist agy |
| `true` | A | agy menjalankan `lint`/`test` sendiri dan memperbaiki kegagalan; kode yang baru ditulis agy berjalan **sebelum** Claude membacanya, dengan hak penuh pengguna |

Aktifkan `true` hanya untuk service dengan tes hermetik (tanpa jaringan, DB, atau secret). Claude melihat keduanya lewat `python3 scripts/executor/executor.py checks <svc>`.

Terverifikasi di Windows 11 + Git Bash (agy 1.4.3): dengan `--sandbox`, toolchain di luar workspace (node via mise) tidak ditemukan; agy meminta eksekusi `unsandboxed`, yang ditolak otomatis di headless (exit 13). Mode A di mesin itu karenanya butuh `executor.sandbox: false` (terverifikasi: `node check.js` exit 0, audit bersih). Mode B tidak membutuhkan `sandbox: false`. Kekuatan `--sandbox` di Windows belum diuji — jangan dihitung sebagai pagar.

## Batas yang diketahui

- Gate hanya memeriksa tool tulis yang pernah teramati (`write_file`, `edit_file`, dan nama berpola write/edit/replace/delete/remove/move/rename/create/patch); tool lain diizinkan dan dicatat di `gate.log`. Audit diff git tetap otoritas.
- Agy dapat membaca file harness sendiri (gate hanya membatasi penulisan dan shell).
- Perintah shell tambahan di luar allowlist (mis. `git check-ignore`) menghentikan run tanpa laporan; agent diinstruksikan tidak melakukannya.
- Perubahan pada file root yang sudah kotor sebelum dispatch tidak terdeteksi (audit membandingkan daftar path, bukan isi).
- `transcript_full.jsonl` adalah lokasi internal agy: bukti tambahan, bukan otoritas.
- `settings.json` agy bersifat global dan memuat izin hasil "always allow" interaktif; preflight hanya memperingatkan entri di luar harness.
- Diverifikasi pada agy 1.4.3. Agent kustom wajib mendeklarasikan `tools:` (termasuk `finish`), kalau tidak `structured_output` tidak muncul.

## Batas yang diketahui (jujur)

- Gate baca bekerja pada **path argumen tool**. Tool pencarian isi (grep) dibatasi ke direktori di dalam Scope, tetapi bila Scope berupa `source-code/<svc>/` penuh dan berkas rahasia ada di dalamnya (mis. `.env` yang tidak masuk `.gitignore`), hasil grep di dalam Scope masih dapat memuat barisnya. Jaga Scope sesempit mungkin dan jangan menyimpan rahasia sungguhan di dalam direktori yang menjadi Scope.
- Argumen tingkat atas berbentuk URL (`scheme://`) ditolak di semua tool: terbukti di agy 1.4.5 bahwa `read_file` dengan `Path` URL mengambil halaman web (celah jaringan lewat tool baca yang ditemukan `--negative`).
- Nama tool agy yang tak dikenal gate tetap diperiksa path-nya, tetapi bila argumennya tidak berisi path yang dikenali, tool itu diizinkan dan dicatat (`unknown` di `gate.log`). `e2e-smoke.sh --negative` mencetak daftar nama tool yang teramati agar celah ini terlihat.
- Terminal/`run_command` hanya lolos bila **tepat** ada di allowlist; perintah yang diizinkan (mis. `node check.js` pada mode A) tetap menjalankan kode service yang belum ditinjau.
- Bukti keamanan nyata hanya dari run dengan agy asli di mesin Anda; test tiruan membuktikan logika gate, bukan perilaku agy.
