---
name: belajar
description: Review belajar dari sesi ini — simpan fakta awet ke memori, perbaiki atau buat skill dari cara kerja yang berhasil dan koreksi user. Pakai saat menutup topik, sebelum /compact atau /summarize, dan langsung setelah user mengoreksi cara kerja agent.
---
# Belajar dari sesi

Tinjau percakapan sesi ini. Simpan hanya yang **ada buktinya** di percakapan (pesan user atau hasil tool yang bisa ditunjuk). Ragu = jangan simpan: fakta salah menyesatkan semua sesi berikutnya. "Tidak ada yang perlu disimpan" boleh, tapi bukan jawaban bawaan.

## 1. Pilih tempat (satu fakta, satu tempat)
| jenis | tempat |
|---|---|
| siapa user dan cara kerjanya (bahasa, gaya jawab, preferensi format, kebiasaan review) | `~/.harness/USER.md` |
| fakta project: konvensi, jebakan tool, keputusan lintas topik, alamat/branch penting | `docs/memory/MEMORY.md` |
| cara kerja berulang: langkah, perintah, urutan, jebakan suatu jenis tugas | skill proyek (bagian 3) |
| fakta kode satu service | `docs/knowledge/<svc>/` (skill `bootstrap`) |

## 2. Memori
- Satu baris per fakta, diawali `- `. Tanpa tanggal, tanpa cerita.
- Fakta lama yang salah: **ubah di tempat**, jangan tambah baris "UPDATE".
- Batas `MEMORY.md` 3.000 dan `USER.md` 1.500 karakter (guard menolak bila lewat). Penuh: gabungkan atau hapus baris usang dulu.
- Jangan simpan: hal sekali pakai, narasi tugas, isi berkas yang mudah dibaca ulang, secret.

## 3. Skill dari pengalaman
Sinyal: teknik/perbaikan/jalan keluar galat yang tidak sepele, alur multi-langkah yang akan terulang, user mengoreksi gaya/format/cara kerja ("jangan begitu lagi").
Urutan:
1. Perbaiki skill yang sedang dipakai atau yang paling dekat (`ls .claude/skills/`). Baca dulu sebelum mengubah.
2. Tambah bagian ke skill payung yang sudah ada.
3. Baru buat skill baru bila tidak ada yang cocok: `.claude/skills/<nama-pendek>/SKILL.md`.
Pelajaran yang sama dua kali = satu aturan. Skill bawaan harness (`topic`, `summarize`, `remap`, `bootstrap`, `belajar`, `antislop*`) tidak diubah (guard menolak).

Format skill baru:
```
---
name: <nama-pendek>
description: <≤ 160 karakter: apa, dan "Pakai saat …">
asal: belajar
dibuat: YYYY-MM-DD
---
# <Judul>
## Kapan dipakai
## Langkah
## Jebakan
## Verifikasi
```
Maks ±6.000 karakter. Tanpa secret, tanpa data produksi.

## 4. Lapor
Satu baris: "belajar: memori +N, user +N, skill <nama> (baru/diperbarui)" atau "belajar: tidak ada yang disimpan".
