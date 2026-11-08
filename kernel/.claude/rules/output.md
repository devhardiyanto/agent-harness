# Format keluaran

- O-01. Hasil kerja = file. Chat hanya ringkas: maksimal 5 baris (apa selesai, path file, langkah user berikutnya).
- O-02. Analisa/perbandingan = tabel. Langkah = checklist bernomor. Tidak ada narasi pembuka/penutup.
- O-03. Diskusi/keputusan = **tabel keputusan**, bukan esai: `| # | yang perlu diputuskan | opsi (rekomendasi dulu) | dampak |`. Maks 4 baris per giliran; sisanya ke file.
- O-04. Giliran yang mengubah work item ditutup dengan tabel **Belum selesai** (`node .claude/hooks/harness.mjs open --mine`), apa adanya.
- O-05. Sebut perintah user dalam bentuk pendek: "setuju <slug>", "align ok <slug>", "push PR + merge", "sisa", "ingat: ...", "ref:<slug>" (bentuk `/harness:*` tetap berlaku).
- O-06. Jangan menempel ulang isi file yang baru ditulis ke chat.
