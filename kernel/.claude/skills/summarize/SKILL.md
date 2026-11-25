---
name: summarize
description: Rangkum percakapan sesi ini ke docs/sessions/YYYY-MM-DD/<slug>.md agar bisa dilanjutkan di sesi lain. Dipakai saat user mengetik /summarize, meminta rangkuman sesi, sebelum /compact, atau saat menutup topik.
argument-hint: "[catatan tambahan: yang perlu ditekankan, ditambah, atau dilewati]"
---
# Instructions Summarize

Rangkum seluruh isi percakapan kita di dalam room chat ini secara chronological order. Jika kita sudah menyepakati suatu perubahan di akhir sesi chat ini, tunjukkan versi terbarunya, tidak perlu menyertakan versi awal dari apa yang kita diskusikan. Tulis rangkuman ini dalam format yang sederhana namun lengkap, agar saya bisa melanjutkan percakapan ini di room chat berbeda tanpa kehilangan grounding context.

## Catatan tambahan
`$ARGUMENTS` (boleh kosong) = catatan untuk rangkuman ini: yang ditekankan ditulis lebih rinci, yang diminta ditambah dimasukkan, yang diminta dilewati tidak ditulis. Fakta dari user (bukan dari percakapan) ditandai `(catatan user)`. Bukan nama berkas.

## Lokasi berkas
`docs/sessions/YYYY-MM-DD/<slug>.md`
- `YYYY-MM-DD` = tanggal hari ini.
- `<slug>` = slug topik yang dibuka atau dikerjakan di sesi ini (yang tampil di status line); tanpa topik: 2–4 kata topik utama, huruf kecil, dipisah tanda hubung.
- Berkas dengan slug itu sudah ada hari ini → **perbarui**, jangan buat `-2`.

## Isi
```
# <judul singkat>
diperbarui YYYY-MM-DD · topik: docs/topics/YYYY-MM-DD/<slug>/ · PR: <url> bila ada

## Tujuan
## Kronologi
1. ...
## Keputusan final
## Keadaan sekarang
## Belum selesai / risiko
## Langkah berikutnya
(siapa · apa persisnya)
## Konteks untuk sesi baru
path penting, perintah, istilah
```
- Satu butir satu baris; rujuk path/URL, jangan menyalin isi berkas.
- Fakta yang sudah dicek dipisah dari dugaan.
- Tanpa secret, kredensial, PII, atau data produksi.
- Jangan commit.

## Balasan chat (maks 3 baris)
path berkas · dibuat/diperbarui · `siap /compact` bila user akan melanjutkan di sesi ini.
