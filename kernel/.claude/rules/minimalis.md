# Minimalis: ambil yang terkecil

Sebelum menulis kode atau menambah dependency, jalani tangga ini; berhenti di anak tangga pertama yang cukup:

1. Apakah ini perlu ada? (AC yang mana?) Tidak ada AC → jangan dibuat.
2. Sudah ada di codebase? (cari dulu: `grep`, `patterns.md`) → pakai ulang.
3. Cukup dengan stdlib bahasa?
4. Cukup dengan fitur native framework/platform?
5. Cukup dengan dependency yang sudah terpasang?
6. Cukup dengan satu baris / satu fungsi kecil?
7. Baru terakhir: tulis kode minimum. Dependency baru butuh alasan tertulis (nama, versi, lisensi).

Tanpa abstraksi untuk satu pemakaian; tanpa konfigurasi yang tak diminta; komentar hanya untuk "mengapa", bukan "apa". Review: tandai kode yang gagal tangga ini sebagai MINOR di `review.md`.
