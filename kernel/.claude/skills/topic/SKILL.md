---
name: topic
description: Membuka, melanjutkan, atau menutup topik di docs/topics/YYYY-MM-DD/<slug>/. Pakai di pesan pertama sesi yang menjelaskan tujuan, saat user merujuk topik lama, dan saat user bilang "topik selesai" / "tutup topik".
argument-hint: "[judul | selesai]"
---
# Topik

## Buka (pesan pertama yang berisi tujuan)
1. Topik serupa sudah ada? `node .claude/hooks/harness.mjs topic list --open`. Bila user menyebut topik lama, baca `summary.md`/`topic.md`-nya dulu.
2. `node .claude/hooks/harness.mjs topic new "<judul pendek dari tujuan user>"` (tambah `--ref <topik lama>` bila merujuk). Judul ≤ 6 kata, tanpa kata kerja pengisi.
3. Isi `topic.md`: `## Tujuan` (kalimat user, dirapikan) dan `## Lingkup` (dibahas / di luar lingkup, dari detail yang user sebut saja).
4. Balas: path topik + pertanyaan klarifikasi bila tujuan belum jelas (maks 3). Lalu mulai analisa.

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
2. `node .claude/hooks/harness.mjs topic close <tanggal/slug>` (status closed + baris di `docs/memory/INDEX.md`).
3. Rangkuman sesi: jalankan skill `summarize` (keluaran ke `docs/sessions/YYYY-MM-DD/<slug-topik>.md`).
4. Memori: tambahkan ke `docs/memory/MEMORY.md` hanya fakta awet dari topik ini (konvensi, jebakan, keputusan yang berlaku lintas topik). Satu baris per fakta, maks 3 baris baru. MEMORY.md > 40 baris → rapikan baris usang dulu.
5. Balasan terakhir (3 baris): path `summary.md` · path rangkuman sesi · `siap /compact`.

Jangan commit; user yang memutuskan.
