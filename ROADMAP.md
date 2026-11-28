# Roadmap

Sisa pekerjaan harness 2.x. Yang sudah rilis tercatat di `CHANGELOG.md`; rencana 1.x (work item, Plane, pilot) dibuang di 2.0.0 dan bisa dibaca di riwayat git.

## Berikutnya

| # | hal | rilis |
|---|---|---|
| 1 | Pecah `install.mjs` per modul (rencana, settings, migrasi, laporan) | 2.3.0 |
| 2 | Temuan logika prioritas rendah: `services_dir` hardcoded di `topics.mjs`; `$&` di `setFm`; `slugify` untuk judul non-Latin; remap tidak transaksional; guard lolos bila stdin bukan JSON | 2.3.0 |
| 3 | Ukuran orkestrator di `growth`: porsi edit kode oleh spesialis yang benar (target ≥ 90%) dan ketikan user per topik (target ≤ 3), dari audit | belum dijadwalkan |

## Perlu uji di mesin nyata

| # | hal |
|---|---|
| U1 | `git-auth` untuk remote HTTPS di Windows |
| U2 | lebar status line dari `process.stdout.columns` di Windows Terminal |

## Terbuka untuk diskusi

| # | hal |
|---|---|
| D1 | format dan cakupan bootstrap knowledge (`docs/knowledge/<svc>/`) |
| D2 | dukungan GitLab untuk `git-auth` |
