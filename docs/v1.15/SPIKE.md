# Uji M0

Empat hal yang hanya bisa diperiksa di Claude Code asli. Dijalankan di satu root (disarankan `event`) setelah update ke 1.15.0. Butuh sekitar 15 menit. Tidak mengubah work item; hanya menulis `.claude/settings.local.json` (dicadangkan) dan dua berkas uji di `docs/`, semuanya dikembalikan oleh `off`.

## Langkah

1. Di terminal, dari root:
   ```bash
   node .claude/hooks/spike.mjs on
   ```
2. Buka sesi **baru** dengan cara biasa (`claude agents`).
3. Lihat baris status di bawah: apakah tertulis `uji M0 · status line proyek tampil`? Catat nama sesi yang tampil di daftar agents.
4. Ketik: `Tanyakan aku satu pertanyaan memakai tool AskUserQuestion: "Warna?" dengan opsi Merah dan Biru. Jangan lakukan hal lain.` Pilih salah satu. Ulangi, kali ini pilih **Other** dan ketik `hijau`.
5. Ketik: `Tulis kata "uji" ke berkas docs/uji-utama.md.`
6. Ketik: `Panggil satu subagent (tool Agent) dan minta dia menulis kata "uji" ke berkas docs/uji-sub.md.`
7. Ketik `/` dan lihat daftar: apakah `uji-tersembunyi` muncul?
8. Keluar dari sesi, lalu:
   ```bash
   node .claude/hooks/spike.mjs report
   ```
9. Kirim tabelnya, jawaban langkah 7, dan nama sesi dari langkah 3. Lalu:
   ```bash
   node .claude/hooks/spike.mjs off
   ```

## Yang ditentukan hasilnya

| uji | bila YA | bila TIDAK |
|---|---|---|
| 1 hook menerima jawaban pemilih | keputusan D dicatat kode dari pilihan (1.16.0) | pemilih hanya untuk menu dan pelajaran; keputusan tetap diketik |
| 2 hook tahu agent mana yang mengedit | edit kode service berbidang dari sesi utama ditolak, diarahkan ke spesialis (1.17.0) | pemanggilan spesialis menjadi anjuran, dihitung di laporan |
| 3a status line proyek tampil | 1.15.0 bekerja apa adanya | perlu setelan di tingkat user, bukan proyek |
| 3b nama sesi terkirim | `/summarize` memakai nama sesi | `/summarize` memakai 2–4 kata topik |
| 4 skill bisa disembunyikan | skill alur disembunyikan dari daftar `/` (1.16.0) | skill tetap tampil; hanya sarannya yang dihilangkan |

## Yang dicatat

Nama kunci payload hook, jawaban pemilih, nama sesi, dan nilai pendek dari kunci yang namanya memuat "agent". Isi berkas, perintah, dan path lengkap tidak dicatat. Log: `.harness/state/spike/log.jsonl`, hanya di mesin ini.

## Hasil

(diisi setelah uji dijalankan)
