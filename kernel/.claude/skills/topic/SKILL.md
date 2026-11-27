---
name: topic
description: Membuka, melanjutkan (termasuk dari kalimat biasa seperti "lanjut topik X"), atau menutup topik di docs/topics/YYYY-MM-DD/<slug>/. Pakai di pesan pertama sesi yang menjelaskan tujuan, saat user merujuk topik lama, dan saat user bilang "topik selesai" / "tutup topik".
argument-hint: "[judul | selesai]"
---
# Topik

## Buka (pesan pertama yang berisi tujuan)
1. Topik serupa sudah ada? `node .claude/hooks/harness.mjs topic find <kata kunci>`. Bila ada yang cocok, ikuti bagian "Lanjut pekerjaan lama".
2. `node .claude/hooks/harness.mjs topic new "<judul pendek dari tujuan user>"` (tambah `--ref <topik lama>` bila merujuk). Judul ≤ 6 kata, tanpa kata kerja pengisi.
3. Isi `topic.md`: `## Tujuan` (kalimat user, dirapikan) dan `## Lingkup` (dibahas / di luar lingkup, dari detail yang user sebut saja).
4. Balas: path topik + pertanyaan klarifikasi bila tujuan belum jelas (maks 3). Lalu mulai analisa.
5. `node .claude/hooks/harness.mjs topic list --stale 7`. Ada hasil → satu baris di akhir balasan: "Topik terbuka > 7 hari: <slug>, … Tutup?" (maks 5 slug). User setuju → tutup tiap topik dengan bagian "Tutup" mode ringkas: `summary.md` dari isi `topic.md`/`plan.md` (tanpa bertanya), `topic close`, catatan menunggu merge bila ada branch, satu kali `belajar` di akhir untuk semuanya; tanpa `summarize` per topik. Tidak dijawab → jangan tanya lagi di sesi ini.

## Lanjut pekerjaan lama (user bicara biasa, tanpa slug)
Contoh: "lanjut topik feedback microservices-go bagian booking_service".
1. `node .claude/hooks/harness.mjs topic find <kata kunci dari kalimat user>`.
2. Satu kandidat jelas (skor tertinggi jauh di atas yang lain) di `docs/topics` → `node .claude/hooks/harness.mjs topic use <tanggal/slug>`, lalu satu baris ke user: "lanjut di topik <slug>". Baca `summary.md`/`topic.md`-nya, lalu jawab pertanyaannya.
3. Beberapa kandidat mirip → satu `AskUserQuestion` (maks 3 opsi + "topik baru").
4. Kandidat hanya di `docs/_legacy` → `topic new "<judul>" --ref <tanggal/slug lama>`, baca berkas lama sebagai rujukan.
5. Tidak ada → topik baru seperti biasa.
Jangan meminta user menyebut slug.

## Selama topik
- Temuan → tabel `## Diskusi dan temuan` (`path:baris` untuk fakta). Keputusan user → `## Keputusan` dengan tanggal.
- Rencana → `plan.md` `## Tugas`. Eksekusi hanya setelah user bilang jelas; delegasikan ke spesialis (`.claude/rules/orkestrator.md`).
- Lingkup bertambah karena permintaan user: perbarui `## Lingkup`, jangan buat topik baru kecuali user minta.

## Tutup ("topik selesai", "tutup topik", "/topic selesai")
1. Tulis `summary.md` di folder topik:
   ```
   # <judul>
   ditutup YYYY-MM-DD · status: selesai/sebagian · PR: <url> bila ada
   ## Hasil
   ## Keputusan final
   ## Yang belum / risiko
   ## Rujukan
   (path berkas, PR, topik terkait)
   ```
   Frontmatter `summary.md`: `koreksi: <jumlah koreksi user di topik ini>` (untuk laporan `growth`).
2. `node .claude/hooks/harness.mjs topic close <tanggal/slug>` (status closed + baris di `docs/memory/INDEX.md`).
3. Rangkuman sesi: jalankan skill `summarize` (keluaran ke `docs/sessions/YYYY-MM-DD/<slug-topik>.md`).
4. Knowledge: untuk tiap service yang kodenya berubah di topik ini, tambahkan baris ke `## Menunggu merge` di `docs/knowledge/<svc>/summary.md`:
   `- YYYY-MM-DD · <slug-topik> · <branch>@<sha7> · <apa yang berubah, satu kalimat>` (sha = `git -C source-code/<svc> rev-parse --short HEAD`). Service tanpa summary.md → skill `bootstrap <svc>` (ringkas) dulu.
5. Jalankan skill `belajar`.
6. Balasan terakhir (3 baris): path `summary.md` · hasil `belajar` · `siap /compact`.

Jangan commit; user yang memutuskan.
