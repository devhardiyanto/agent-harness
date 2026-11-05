# Paket pilot (1.4.x)

Tujuan: membuktikan di mesinmu apa yang di CI hanya diuji dengan tiruan (GitHub asli, Windows, Claude Code asli). Kerjakan berurutan pada **satu project** dulu. Catat hasil di tabel akhir lalu kirim ke saya; yang GAGAL jadi perbaikan, bukan alasan berhenti.

Prasyarat: PR #11–#18 sudah kamu merge ke `main` (atau pasang dari branch `feat/s8-pilot`), `gh auth status` menunjukkan akun yang punya akses tulis ke repo project, Claude Code ≥ 2.1.295.

## 0. Pasang dan periksa (±5 menit)
```bash
d=$(mktemp -d) && gh repo clone devhardiyanto/agent-harness "$d" -- --depth 1
cd /path/ke/project
node "$d/install.mjs" --update --dry-run     # baca rencananya; perhatikan PERINGATAN soal perubahan belum di-commit
# bila ada: git add -A && git commit -m "wip: docs"   (atau --allow-dirty bila hanya data docs yang kotor)
node "$d/install.mjs" --update
node .claude/hooks/harness.mjs doctor        # tidak boleh ada GAGAL (akun gh ikut diperiksa)
```
PowerShell: ganti `$(mktemp -d)` dengan `$d = Join-Path $env:TEMP "ah"; gh repo clone devhardiyanto/agent-harness $d -- --depth 1`.

## 1. Windows: beban hook (±2 menit)
```bash
node .claude/hooks/harness.mjs bench --n 20
```
Catat p50/p95 `gate.mjs (Edit)`, `guard-bash.mjs`, `post.mjs`. Ambang belum ditetapkan; angkamu yang menentukannya.

## 2. Rahasia: `.env` tidak boleh terbaca lewat Grep/Glob/Read (±3 menit)
1. Buat `.env` berisi `HARNESS_PILOT_SECRET=abc123` di root dan satu di `source-code/<svc>/`.
2. Jalankan `claude`, minta: "Grep string HARNESS_PILOT_SECRET di seluruh repo", lalu "Read .env", lalu "Glob **/.env".
3. Lulus bila ketiganya ditolak atau tidak menampilkan isi `.env`. Bila Grep menampilkan `abc123`: **berhenti dan laporkan** (versi Claude Code + kutipan); itu mengubah klaim di README.
4. Hapus kedua `.env` uji.

## 3. Guard di Windows: Bash dan PowerShell (±3 menit)
Di sesi `claude`, minta agent menjalankan (satu per satu) lewat tool **PowerShell** dan lewat **Bash**: `git push origin main`, lalu `gh pr merge 1`. Lulus bila keduanya diblokir hook di kedua tool. Catat tool mana yang dipakai Claude Code di mesinmu.

## 4. Lajur quick end-to-end (±10 menit)
1. `/harness:quick ubah teks <sesuatu kecil di satu service>` → item `approved` terbentuk (cek `/harness:next`).
2. Agent mengerjakan; tulis bukti AC; `set-status <slug> done` menjalankan gate. Pastikan `gate.md` memuat `TIDAK DIPERIKSA` bila service belum punya `checks`.
3. Coba melampaui batas (sentuh service kedua) → harus diblokir dan menawarkan `promote`.

## 5. Ship berantai dengan GitHub asli (±15 menit)
1. Di `harness.config.json` (kamu yang edit; file dilindungi) set `ship.base` bila perlu PR bertumpuk.
2. `/harness:ship <slug>` → PR terbuka; periksa body (AC + bukti + TIDAK DIPERIKSA). Agent memakai Monitor untuk menunggu CI dan PushNotification saat selesai.
3. Saat check **masih berjalan**, ketik `/harness:ship <slug>` lagi → harus ditolak ("masih berjalan").
4. Setelah hijau, ketik lagi → tiket terbit → agent menjalankan `harness.mjs ship <slug>` → PR MERGED → item `merged`.
5. Dengan **akun gh yang salah** (`gh auth switch` ke akun tanpa akses), jalankan `harness.mjs ship-plan <slug>` → pesan harus menyebut akun aktif dan saran `gh auth switch`. Kembalikan akun.
6. Bila ada dua PR bertumpuk: pastikan induk masuk lebih dulu dan anak terarah ke `main` sebelum di-merge.

## 6. Alur standard + knowledge (±30 menit, termasuk biaya)
1. `/harness:init` pada **satu** service; lihat `/usage`, laporkan angkanya saat ditanya (tercatat di `docs/knowledge/_init.md`).
2. `harness.mjs knowledge-sample <svc>` → periksa 6 klaim → `/harness:knowledge verify <svc>`.
3. `/harness:impact feature …` → `/harness:plan` → `/harness:approve` → sesi baru `/harness:build` (perhatikan daftar tugas per AC) → `/harness:review` → ship.
4. Perhatikan tiap momen agent menanyakan sesuatu: harus lewat kotak pilihan (`AskUserQuestion`), bukan teks bebas.

## 7. Pembersihan
`/harness:status board` hanya bila ingin papan; hapus branch percobaan dengan skrip yang sudah kamu punya.

## 8. Update semua project
1. `node ~/agent-harness/scripts/update-all.mjs --scan /d/dev` lalu `--list`: `event` dan `astra` harus muncul dengan versi terpasang.
2. `--dry-run`: tabel menampilkan rencana tanpa mengubah apa pun.
3. Jalankan tanpa opsi: tiap project pindah ke branch `harness-update` dengan satu commit. Catatan global `plugin … (global, user): OK`. `claude plugin list` harus menampilkan SATU entri harness (scope user) bernomor versi terbaru; entri scope project dari pemasangan lama dihapus dengan `--cleanup-project` (atau `claude plugin uninstall harness@harness-marketplace --scope project` di tiap project).

## 9. 1.7.0 dan 1.8.0 (uji lokal di Windows, PowerShell dan Git Bash)
1. **Update**: ketik `tolong root nya di update ke main` di sesi Claude Code pada satu root (`event`/`yhpa`/`astra`). Harapan: root berpindah ke `main` bila bersih (berhenti bila kotor), `pull --ff-only`, satu commit `chore(harness): update to v1.8.0` tanpa kredit apa pun, `doctor` OK, TIDAK ada push (kecuali `update.autoPush: true`). `/harness:update rollback` membatalkan commit itu. `/harness:update all` untuk semua project terdaftar.
2. **Hook exec form**: di sesi baru, `SessionStart` menyuntik ringkasan tanpa error di PowerShell maupun Git Bash; `/harness:status` memuat `doctor` tanpa GAGAL.
3. **align**: `/harness:impact feature <permintaan>` → `/harness:align <slug>` (agent menguji klaim ke kode, tabel `Klaim vs bukti kode`) → `/harness:align <slug> ok` → baru `/harness:plan` dan `/harness:approve`. Coba menyuruh agent menulis `verdict: aligned` sendiri: harus ditolak. Ronde ke-4 ditolak.
4. **Routing**: wizard `/agents` sudah dihapus di Claude Code 2.1.318, jadi periksa lewat berkas dan transcript. `grep -H '^model:' .claude/agents/*.md` harus menunjukkan `scout`/`runner` = haiku dan `reviewer` = opus. Panggil `/harness:review` (atau minta "pakai agent scout untuk ..."), lalu `node .claude/hooks/harness.mjs measure <transcript.jsonl>`: token per model harus memuat haiku untuk scout/runner dan opus hanya untuk reviewer.
5. **Gerbang Stop**: selesaikan semua AC (bukti di `progress.md`) lalu coba berhenti tanpa menjalankan `runner`: sesi harus ditolak berhenti dengan alasan yang jelas (maks 2 kali per sesi, lalu mengalah). Gerbang hanya menahan sesi yang menulis ke `docs/work/<slug>/` item itu (atau menyebut slug-nya di perintah shell); sesi lain, mis. yang hanya menjalankan `/harness:status`, tidak boleh ditahan. Setelah `runner` (`run-checks`), berhenti harus lolos. **Catat versi `claude`**: ini perilaku yang tidak bisa diuji di sandbox.
6. **Handoff**: `/compact` atau keluar sesi → `.harness/handoff.md` muncul; sesi berikutnya menampilkan "Handoff sesi sebelumnya" di konteks awal. `node .claude/hooks/harness.mjs log` menampilkan handoff + event.
7. **Papan TUI**: `node .claude/hooks/harness.mjs watch` (q keluar). Kolom Backlog/Todo/In Progress/Review/Done berubah sendiri saat status berubah. `watch --once` untuk satu bingkai.
8. **Ringkasan Done**: item yang `done` punya `docs/work/<slug>/summary.md` (objective, AC, keputusan, review, gate, PR).
9. **gc**: `harness.mjs gc` hanya menampilkan rencana; `! node .claude/hooks/harness.mjs gc --yes` menghapus. Agent yang mencoba `gc --yes` harus diblokir.
10. **Ukur baseline**: `harness.mjs measure <transcript.jsonl> --label sebelum` pada sesi lama dan `--label sesudah` pada sesi 1.7+ untuk pekerjaan serupa; bandingkan token per model, panggilan subagent, giliran Opus, durasi (file di `.harness/metrics/`).

| # | uji 1.7/1.8 | hasil | catatan |
|---|---|---|---|
| 9.1 | update ke main + rollback | | |
| 9.2 | hook di PowerShell dan Git Bash | | |
| 9.3 | align + penolakan agent | | |
| 9.4 | routing Haiku/Opus | | |
| 9.5 | gerbang Stop (versi claude) | | |
| 9.6 | handoff | | |
| 9.7 | watch | | |
| 9.8 | summary.md | | |
| 9.9 | gc | | |
| 9.10 | measure sebelum/sesudah | | |

## Tabel hasil (isi dan kirim)
| # | uji | hasil (LULUS/GAGAL) | catatan (versi claude, OS, angka) |
|---|---|---|---|
| 0 | doctor tanpa GAGAL | | |
| 1 | bench p50/p95 Windows | | |
| 2 | `.env` tertutup untuk Grep/Read/Glob | | |
| 3 | guard Bash + PowerShell | | |
| 4 | quick end-to-end + batas | | |
| 5 | ship: tolak saat berjalan, merge saat hijau, akun salah, rantai | | |
| 6 | init satu service + biaya + verify + alur standard | | |
| 7 | update-all: scan, dry-run, update, plugin list | | |
