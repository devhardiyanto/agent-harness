---
paths:
  - "docs/knowledge/**"
  - "docs/_map.md"
---
# Menulis pengetahuan (L0–L3)

- Sumber = commit **baseline** service (`harness.mjs baseline`), bukan branch yang sedang di-checkout. Frontmatter wajib: `service`, `source_commit` (SHA baseline), `status: draft|verified`, `updated`.
- Fakta dari kode ditulis `path:baris` (relatif ke root service; `a.ts:42` atau `a.ts:42-50`), dengan simbol yang diklaim di backtick pada baris yang sama. Dugaan diberi `?`. Yang tak ditemukan: `UNKNOWN`. Dilarang mengarang. `lint-knowledge` memeriksa sitasi, simbol, dan batas panjang.
- `summary.md` (L2) maksimal 80 baris: tujuan, stack, entry point, perintah build/test, env var (nama saja), data/tabel, endpoint, dependensi antar-service.
- `patterns.md` (L3) maksimal 150 baris: pola yang dipakai ulang + 1–2 contoh emas (path file nyata), bukan kode yang disalin.
- Mengutip knowledge `draft` di dokumen lain (impact, plan, review): beri label `[draft]` dan cek ke kode; hanya `verified` yang dikutip tanpa label.
- `verified` hanya oleh manusia (`/harness:knowledge verify <svc>`, hanya bila lint bersih). Mengedit file `verified` = turunkan ke `draft` di edit yang sama. Gate menegakkan keduanya.
- Pola baru/berubah **hanya diusulkan** (`docs/work/<slug>/patterns-proposal.md`, `Status: proposed`); manusia menyetujui lewat `/harness:knowledge patterns`. Fakta boleh diperbarui otomatis sebagai `draft`.
