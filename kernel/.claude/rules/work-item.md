---
paths:
  - "docs/work/**"
---
# Menulis work item

- `plan.md`: frontmatter wajib `title`, `type`, `status`, `services: [a, b]`; opsional `test_command`, `pr`, `schema_change`.
- Acceptance criteria: satu baris per AC, format persis `- AC1: kalimat yang bisa diverifikasi`. Tanpa AC, plan tidak bisa di-approve.
- `progress.md`: bagian `## Verifikasi` berisi `- AC1: <bukti>` per AC. Bukti = output nyata, bukan klaim.
- `review.md`: frontmatter `verdict: clean|blockers`; blocker ditulis `- [ ] [BLOCKER] ...` dan dicentang `[x]` hanya setelah diperbaiki.
- Lajur quick (`lane: quick`): dibuat hook dari `/harness:quick`; hanya AC1 (permintaan user) + amandemen; tanpa `review.md`. `services`/`files` diisi hook saat edit pertama.
- Hotfix: plan ringkas empat baris (gejala, akar masalah, perubahan minimal, verifikasi) tetap melewati semua gerbang.
- Isi tabel/checklist, bukan paragraf. Rujuk kode dengan `path:baris`.
