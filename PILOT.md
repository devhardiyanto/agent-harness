# Paket pilot 1.4.0

Tujuan: membuktikan di mesinmu apa yang di CI hanya diuji dengan tiruan (GitHub asli, Windows, Claude Code asli). Kerjakan berurutan pada **satu project** dulu. Catat hasil di tabel akhir lalu kirim ke saya; yang GAGAL jadi perbaikan, bukan alasan berhenti.

Prasyarat: PR #11–#18 sudah kamu merge ke `main` (atau pasang dari branch `feat/s8-pilot`), `gh auth status` menunjukkan akun yang punya akses tulis ke repo project, Claude Code ≥ 2.1.295.

## 0. Pasang dan periksa (±5 menit)
```bash
d=$(mktemp -d) && gh repo clone devhardiyanto/agent-harness "$d" -- --depth 1
cd /path/ke/project
node "$d/install.mjs" --update --dry-run     # baca rencananya
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
