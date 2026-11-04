---
name: align
description: Menyepakati objective sebelum plan. Agent skeptis menguji tiap klaim permintaan ke kode (tabel klaim vs bukti), debat maks 3 ronde, temuan sampingan ke parking lot. User menutup dengan "/harness:align <slug> ok".
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
4. Klaim `bertentangan` atau `dugaan` yang menentukan lingkup → tanyakan lewat `AskUserQuestion` (maks 4, opsi konkret, rekomendasi di opsi pertama). Catat jawaban di bagian "Debat" dan naikkan `rounds` di frontmatter. **Maksimal 3 ronde**: hook menolak ronde ke-4. Bila masih beda pendapat setelah ronde 3, tulis titik bedanya dan biarkan user memutuskan.
5. Temuan di luar objective (bug lain, refactor yang menggoda, ide) → bagian "Parking lot" saja. Jangan dikerjakan, jangan masuk lingkup.
6. Jangan menulis `verdict: aligned`: hook menolaknya. Hanya manusia yang menutup align.

## Balasan chat (maks 5 baris)
N klaim (t terverifikasi, d dugaan, b bertentangan) · ronde r/3 · path `align.md` · berikutnya (kamu): bila sepaham ketik `/harness:align <slug> ok`, lalu `/harness:plan <slug>`.
