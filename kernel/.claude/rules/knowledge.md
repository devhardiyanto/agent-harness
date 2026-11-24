---
paths:
  - "docs/knowledge/**"
  - "docs/_map.md"
---
# Menulis pengetahuan

- K-01. Sumber = branch baseline service (production/main yang dipakai deploy), bukan branch fitur yang sedang di-checkout. Frontmatter: `service`, `source_commit`, `updated`.
- K-02. Fakta dari kode ditulis dengan `path:baris`. Dugaan diberi `?`. Yang tidak ditemukan: `UNKNOWN`. Tidak mengarang.
- K-03. `summary.md` ≤ 80 baris: tujuan, stack, entry point, perintah build/test/lint, env var (nama saja), tabel data, endpoint, ketergantungan antar-service.
- K-04. `patterns.md` ≤ 150 baris: pola yang dipakai ulang + 1–2 contoh nyata (path), bukan salinan kode.
