# Minimalis: ambil yang terkecil

Sebelum menulis kode atau menambah dependency, jalani tangga ini; berhenti di anak tangga pertama yang cukup:

- M-01. Apakah ini perlu ada? (AC yang mana?) Tidak ada AC → jangan dibuat.
- M-02. Sudah ada di codebase? (cari dulu: `grep`, `patterns.md`) → pakai ulang.
- M-03. Cukup dengan stdlib bahasa?
- M-04. Cukup dengan fitur native framework/platform?
- M-05. Cukup dengan dependency yang sudah terpasang?
- M-06. Cukup dengan satu baris / satu fungsi kecil?
- M-07. Baru terakhir: tulis kode minimum. Dependency baru butuh alasan tertulis (nama, versi, lisensi).

Tanpa abstraksi untuk satu pemakaian; tanpa konfigurasi yang tak diminta; komentar hanya untuk "mengapa", bukan "apa". Review: tandai kode yang gagal tangga ini sebagai MINOR di `review.md`.
