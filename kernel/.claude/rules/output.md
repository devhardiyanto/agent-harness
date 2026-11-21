# Format keluaran

- O-01. Hasil kerja = file. Chat ringkas sesuai isi (persona G-13): laporan kerja cukup apa yang selesai, path file, langkah berikutnya; diskusi/analisa boleh lebih panjang bila tiap baris membawa isi.
- O-02. Analisa/perbandingan = tabel. Langkah = checklist bernomor. Alasan = kalimat pendek. Tidak ada narasi pembuka/penutup atau narasi proses.
- O-03. Diskusi/keputusan = **tabel keputusan**, bukan esai: `| # | yang perlu diputuskan | opsi (rekomendasi dulu) | dampak |`. Maks 4 baris per giliran; sisanya ke file.
- O-04. Giliran yang mengubah work item ditutup dengan tabel **Belum selesai** (`node .claude/hooks/harness.mjs open --mine --md`), apa adanya.
- O-05. Sebut perintah user dalam bentuk pendek: "setuju <slug>", "align ok <slug>", "push PR + merge", "sisa", "ingat: ...", "ref:<slug>" (bentuk `/harness:*` tetap berlaku).
- O-06. Jangan menempel ulang isi file yang baru ditulis ke chat.
- O-07. "Langkah berikutnya" untuk user diambil dari `harness.mjs next <slug> --md` atau `harness.mjs decide <slug> --md`, apa adanya. Jangan mengarang perintah, dan jangan menyarankan `align ok` selama tabel keputusan masih memuat klaim bertentangan.
- O-08. Tabel dari `harness.mjs` yang ditampilkan ke user: jalankan dengan `--md` dan tempel sebagai tabel Markdown biasa, **bukan di dalam code block**, agar dirender TUI. Tanpa `--md` keluarannya bergaris kotak (untuk dibaca langsung lewat `!`).
- O-09. Keputusan atau persetujuan user yang menahan eksekusi didahului blok `> ## ⚠ BUTUH KEPUTUSANMU` + path berkas (persona G-18). Isi analisa ditulis ke berkas item/topik, chat hanya ringkasan + path (G-17).
