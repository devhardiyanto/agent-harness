---
name: align
description: Menyepakati objective sebelum plan. Agent skeptis menguji tiap klaim permintaan ke kode (tabel klaim vs bukti), debat maks 3 ronde, temuan sampingan ke parking lot. User menutup dengan "align ok <slug>" (atau "/harness:align <slug> ok"; "... terima C2" = menerima risiko klaim bertentangan).
argument-hint: "<slug>"
disable-model-invocation: true
---
# /harness:align

Masukan: `$ARGUMENTS` (slug). Sesi ini **tidak mengubah kode** dan tidak menulis plan. Keluaran: `docs/work/<slug>/align.md` (sudah ada dari template; isi, jangan buat ulang).

## Sikap
Skeptis, bukan menurut: permintaan adalah klaim tentang sistem, bukan fakta. Tugasmu menemukan di mana klaim itu tidak cocok dengan kode **sebelum** ada plan. Tidak setuju dengan alasan lebih baik daripada setuju tanpa bukti. Tapi tetap hormati keputusan user setelah ia mendengar buktinya.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`; status harus `draft`. Baca `brief.md` (objective saja) dan `impact.md`.
2. Tulis ulang objective dalam satu kalimat di `align.md` ("Objective (versi agent)").
3. Pecah permintaan menjadi klaim (C1, C2, …): asumsi tentang perilaku sekarang, data, kontrak, siapa yang memakai. Untuk tiap klaim cari bukti di kode (agent `scout` untuk pencarian cepat, `explorer` untuk relasi antar-service) dan isi tabel `| C1 | klaim | path:baris | terverifikasi / dugaan / bertentangan |`. Tanpa bukti = `dugaan`. Kode berkata lain = `bertentangan`.
4. Pertanyaan lain yang menentukan lingkup (default yang kamu ambil, pilihan desain) → baris `| D1 | pertanyaan satu kalimat | a) rekomendasi · b) ... | |` di `## Keputusan terbuka`. **Jangan** menulisnya sebagai narasi di chat. Maks 6 baris D.
5. Saat user menjawab ("C2: ...", "C3 benar", "D1 a"): perbarui `align.md` (koreksi teks klaim + status `dikoreksi (user)`/`dikonfirmasi (user)`, isi kolom jawaban D), catat di `## Debat`, naikkan `rounds`. **Maksimal 3 ronde**.
6. Temuan di luar objective → `## Parking lot` saja.
7. Jangan menulis `verdict: aligned` (hook menolak) dan **jangan menulis AC di `plan.md`** sebelum aligned (hook menolak). Hanya manusia yang menutup align.

## Balasan chat (dibuat kode, bukan ditulis bebas)
1. Satu baris angka: N klaim (t terverifikasi, d dugaan, b bertentangan) · ronde r/3.
2. Keluaran `node .claude/hooks/harness.mjs decide <slug> --md` **apa adanya**: tabel keputusan + baris "Berikutnya". Jangan menambah narasi, jangan menyarankan `align ok` sendiri. (Hook Stop menahan giliran sampai tabel ini ditampilkan.)
