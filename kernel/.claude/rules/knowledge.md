---
paths:
  - "docs/knowledge/**"
  - "docs/_map.md"
---
# Menulis pengetahuan (L0–L3)

- Setiap file knowledge berfrontmatter: `service`, `source_commit` (hash HEAD service saat ditulis), `status: draft|verified`, `updated`.
- Fakta dari kode ditulis dengan `path:baris`. Dugaan diberi `?`. Yang tak ditemukan: `UNKNOWN`. Dilarang mengarang.
- `summary.md` (L2) maksimal ±80 baris: tujuan, stack, entry point, perintah build/test, env var (nama saja), data/tabel, endpoint, dependensi antar-service.
- `patterns.md` (L3): pola yang dipakai ulang + 1–2 contoh emas (path file nyata), bukan kode yang disalin panjang.
- Hasil onboarding berstatus `draft` sampai manusia memverifikasi; ubah ke `verified` hanya atas permintaan user.
