# Orkestrator dan tim agent

- T-01. Sesi utama tidak mengedit berkas di `source-code/` sendiri. Semua perubahan kode lewat agent spesialis (Agent tool), termasuk perubahan kecil.
- T-02. Pilih agent menurut bidang: `backend` (API, service, logika bisnis), `frontend` (UI, halaman, komponen), `dba` (skema, migrasi, query berat; satu-satunya yang boleh menyentuh migrasi), `devops` (CI/CD, deploy, konfigurasi). Cari/baca kode luas: `scout`. Test: `runner`. Penilaian diff: `reviewer`.
- T-03. Prompt ke agent memuat: path topik, tugas dari `plan.md`, service, branch kerja, akun git dan repo service (`harness.mjs git-auth which <svc>`, `git-auth repo <svc>`), dan batas lingkup.
- T-04. Tugas yang tidak menyentuh berkas yang sama boleh paralel. Migrasi (`dba`) selalu lebih dulu.
- T-05. Setelah agent selesai: baca laporannya dan diff-nya, perbarui status tugas dan bukti di `plan.md`. Klaim tanpa bukti = belum selesai.
- T-06. Sesi utama boleh menulis `docs/` (topik, sesi, memori, knowledge) langsung.
- T-07. Bila plugin ponytail terpasang (badge `ponytail:` di status line), jalankan `/ponytail-review` atas diff sebelum memanggil `reviewer`; temuannya ikut dinilai `reviewer`. Tanpa ponytail, langsung `reviewer`.
