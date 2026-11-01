---
name: summarize
description: Ringkasan serah-terima sesi (kronologis, hanya versi final yang disepakati) ke docs/sessions/. Dijalankan setelah ship berstatus merged, atau saat user mengetik /harness:summarize.
argument-hint: "[slug]"
---
# /harness:summarize

Masukan: `$ARGUMENTS` (slug work item; kosong = topik utama sesi ini). Tujuan: sesi baru dapat melanjutkan tanpa kehilangan konteks, dan user bisa melihat apa yang pernah dibahas.

## Sumber (urut prioritas)
1. Percakapan sesi ini: permintaan, keputusan, perubahan arah, hal yang ditolak user.
2. Bila ada slug: `docs/work/<slug>/` (`brief` `impact` `plan` `progress` `review` `gate`), isi `pr:` di `plan.md`, dan status akhir dari `node .claude/hooks/harness.mjs status`. Jika percakapan dan berkas berbeda, berkas yang menang; tulis selisihnya di bagian "Belum selesai".
3. Ringkasan sesi sebelumnya di `docs/sessions/` bila topiknya sama: lanjutkan, jangan ulang.

## Aturan isi
- Urutan kronologis. Tiap keputusan ditulis dalam versi terakhir yang disepakati; versi awal yang sudah diganti tidak dimuat.
- Sederhana tapi lengkap: tiap butir satu baris, memuat alasan bila keputusan tidak jelas dari konteks. Rujuk path atau URL, jangan menyalin isi berkas.
- Fakta (sudah dicek: PR, status, hasil gate) dipisah dari asumsi dan pertanyaan terbuka.
- Tanpa secret, kredensial, PII, atau data produksi.

## Keluaran
Satu berkas `docs/sessions/<YYYY-MM-DD>-<slug-atau-topik>.md` (buat folder bila belum ada; nama sudah ada → tambah `-2`). Jangan commit; user yang memutuskan.

```
# <judul singkat>
tanggal · slug · status akhir · PR (URL) · akun/branch bila relevan

## Tujuan
## Kronologi
1. ...
## Keputusan final
- ...
## Keadaan sekarang
| service | branch | PR | status |
## Belum selesai / risiko / TIDAK DIPERIKSA
## Langkah berikutnya
(siapa: kamu/agent · perintah persis)
## Konteks untuk sesi baru
istilah, path penting, perintah yang dipakai
```

## Balasan chat (maks 3 baris)
Path berkas · jumlah keputusan final · langkah berikutnya untuk user.
