---
name: summarize
description: Rangkum percakapan sesi ini ke docs/sessions/<nama-sesi>.md agar bisa dilanjutkan di sesi lain. Dipakai saat user mengetik /summarize, meminta rangkuman sesi, atau menyinggung berkas rangkuman yang sudah ada (maka berkas itu diperbarui).
argument-hint: "[nama-berkas]"
---
# Instructions Summarize

Rangkum seluruh isi percakapan kita di dalam room chat ini secara chronological order. Jika kita sudah menyepakati suatu perubahan di akhir sesi chat ini, tunjukkan versi terbarunya, tidak perlu menyertakan versi awal dari apa yang kita diskusikan. Tulis rangkuman ini dalam format yang sederhana namun lengkap, agar saya bisa melanjutkan percakapan ini di room chat berbeda tanpa kehilangan grounding context.

## Nama berkas
`docs/sessions/<nama>.md`, tanpa tanggal, tanpa judul panjang. `<nama>` diambil dari, urut:
1. `$ARGUMENTS` bila diisi.
2. Nama sesi atau agent yang tampil di status line (bentuk `kata-kata-kata`), bila kamu mengetahuinya: `node .claude/hooks/harness.mjs session-name` mencetaknya bila tersedia; keluaran kosong berarti tidak diketahui.
3. Selain itu: 2–4 kata topik utama, huruf kecil, dipisah tanda hubung.

Jangan menebak nama sesi. Bila tidak diketahui, pakai butir 3.

## Memperbarui, bukan menggandakan
- Berkas dengan nama itu sudah ada → **perbarui** berkas itu: kronologi dilanjutkan, keputusan yang berubah diganti dengan versi terbaru, bagian "Belum selesai" disesuaikan. Jangan membuat `-2`.
- User menyinggung sebuah berkas di `docs/sessions/` (menyebut namanya, `ref:`, atau memintamu melanjutkan darinya) → baca dulu berkas itu, kerjakan permintaannya, lalu perbarui berkas yang sama di akhir giliran bila ada keputusan atau keadaan yang berubah.

## Isi
Bentuk sama seperti rangkuman sebelumnya di `docs/sessions/`:

```
# <judul singkat>
diperbarui <YYYY-MM-DD> · status akhir · PR (URL) bila ada

## Tujuan
## Kronologi
1. ...
## Keputusan final
- ...
## Keadaan sekarang
## Belum selesai / risiko / belum diperiksa
## Langkah berikutnya
(siapa: kamu/agent · apa persisnya)
## Konteks untuk sesi baru
istilah, path penting, perintah yang dipakai
```

- Tiap butir satu baris; rujuk path atau URL, jangan menyalin isi berkas.
- Fakta yang sudah dicek dipisah dari asumsi dan pertanyaan terbuka.
- Tanpa secret, kredensial, PII, atau data produksi.
- Jangan commit; user yang memutuskan.

## Balasan chat (maks 3 baris)
Path berkas · dibuat atau diperbarui · langkah berikutnya untuk user.
