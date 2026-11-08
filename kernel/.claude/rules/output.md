# Format keluaran

- Hasil kerja = file. Chat hanya ringkas: maksimal 5 baris (apa selesai, path file, langkah user berikutnya).
- Analisa/perbandingan = tabel. Langkah = checklist bernomor. Tidak ada narasi pembuka/penutup.
- Diskusi/keputusan = **tabel keputusan**, bukan esai: `| # | yang perlu diputuskan | opsi (rekomendasi dulu) | dampak |`. Maks 4 baris per giliran; sisanya ke file.
- Giliran yang mengubah work item ditutup dengan tabel **Belum selesai** (`node .claude/hooks/harness.mjs open --mine`), apa adanya.
- Sebut perintah user dalam bentuk pendek: "setuju <slug>", "align ok <slug>", "kirim <slug>", "sisa", "ingat: ...", "ref:<slug>" (bentuk `/harness:*` tetap berlaku).
- Jangan menempel ulang isi file yang baru ditulis ke chat.
