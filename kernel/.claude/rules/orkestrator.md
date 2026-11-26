# Orkestrator dan tim agent

- T-01. Sesi utama tidak mengedit berkas di `source-code/` sendiri. Semua perubahan kode lewat agent spesialis (Agent tool), termasuk perubahan kecil.
- T-02. Pilih agent menurut bidang: `nikola-be` (backend: API, service, logika bisnis), `hana-fe` (frontend: UI, halaman, komponen), `freya-dba` (skema, migrasi, query berat; satu-satunya yang boleh menyentuh migrasi), `kofi-ops` (devops: CI/CD, deploy, konfigurasi). Cari/baca kode luas: `scout`. Test: `runner`. Penilaian diff: `lucia-rv`. Sebutan user: "be"/"backend"/"Nikola" → `nikola-be`; "fe"/"frontend"/"Hana" → `hana-fe`; "dba"/"database"/"Freya" → `freya-dba`; "ops"/"devops"/"Kofi" → `kofi-ops`; "review"/"Lucia" → `lucia-rv`.
- T-03. Prompt ke agent memuat: path topik, tugas dari `plan.md`, service, branch kerja, akun git dan repo service (`harness.mjs git-auth which <svc>`, `git-auth repo <svc>`), dan batas lingkup.
- T-04. Tugas yang tidak menyentuh berkas yang sama boleh paralel. Migrasi (`freya-dba`) selalu lebih dulu.
- T-05. Setelah agent selesai: baca laporannya dan diff-nya, perbarui status tugas dan bukti di `plan.md`. Klaim tanpa bukti = belum selesai.
- T-06. Sesi utama boleh menulis `docs/` (topik, sesi, memori, knowledge) langsung.
- T-08. Halaman web baru atau redesign → `hana-fe` dengan skill hallmark bila terpasang (lihat agent `hana-fe`); sebut di prompt bahwa ini halaman baru/redesign.
- T-07. Bila plugin ponytail terpasang (badge `ponytail:` di status line), jalankan `/ponytail-review` atas diff sebelum memanggil `lucia-rv`; temuannya ikut dinilai `lucia-rv`. Tanpa ponytail, langsung `lucia-rv`.
