---
name: impact
description: Langkah pertama setiap permintaan. Membuat work item (brief.md, impact.md) dan memetakan service, kontrak, dan risiko yang terdampak dari prompt pertama.
argument-hint: "<feature|improvement|hotfix|analysis|cross-repo|schema|onboard> <permintaan>"
disable-model-invocation: true
---
# /harness:impact

Masukan: `$ARGUMENTS`. Keluaran: file, bukan narasi.

Perubahan kecil (satu service, ≤5 file, bukan skema)? Sarankan user mengetik `/harness:quick <permintaan>` dan berhenti; jangan membuat item standard.

## Langkah
1. Tentukan `type` dari kata pertama (feature, improvement, hotfix, analysis, cross-repo, schema, onboard). Bila tidak ada, simpulkan dan sebut asumsimu di `brief.md`.
2. Buat item: `node .claude/hooks/harness.mjs new <type> "<judul singkat>"` → dapat `docs/work/<slug>`.
3. Baca `docs/_map.md`. Bila masih `status: draft` dan kosong, beri tahu user untuk menjalankan `/harness:init` dan lanjut dengan `UNKNOWN`.
4. Pilih service kandidat dari peta. Baca **hanya** `docs/knowledge/<svc>/summary.md` service kandidat. Jangan membaca seluruh knowledge.
5. Verifikasi relasi yang meragukan dengan agent `explorer` (paralel bila lintas service). Untuk simbol yang dirujuk lintas file, minta explorer memakai `LSP` (definisi/referensi) bila tersedia; bila tidak, `Grep`. Relasi antar-service dari graph AST tidak lengkap: cek env var base URL, klien HTTP, queue, tabel bersama.
6. Isi `brief.md` dan `impact.md` (tabel). Dugaan diberi `?`, fakta diberi `path:baris`.
7. Tulis pertanyaan yang memblokir plan di bagian "Pertanyaan yang harus dijawab user". Bila ada pilihan yang jawabannya mengubah lingkup (mis. service mana, kompatibel mundur atau tidak), tanyakan langsung dengan `AskUserQuestion` (maks 4 pertanyaan, opsi konkret, rekomendasi di opsi pertama), lalu catat jawabannya di `brief.md`. Jangan menebak.

## Fokus per tipe
| type | tambahan wajib di impact.md |
|---|---|
| feature | kontrak baru, data baru, urutan deploy |
| improvement | perilaku lama vs baru, kompatibilitas mundur |
| hotfix | gejala, dugaan akar masalah (dengan bukti), blast radius minimum |
| analysis | pertanyaan yang dijawab, sumber bukti; tanpa perubahan kode |
| cross-repo | tabel kontrak antar-service + urutan deploy + versi kompatibel |
| schema | pemilik skema, konsumen tabel, strategi expand/migrate/contract (agent `dba`) |
| onboard | service yang belum ber-knowledge; arahkan ke `/harness:init` |

## Balasan chat (maks 5 baris)
`docs/work/<slug>` dibuat · service terdampak: ... · N pertanyaan terbuka · berikutnya: `/harness:plan <slug>`
