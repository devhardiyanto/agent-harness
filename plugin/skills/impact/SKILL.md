---
name: impact
description: Langkah pertama setiap permintaan. Membuat work item (brief.md, impact.md) dan memetakan service, kontrak, dan risiko yang terdampak dari prompt pertama.
argument-hint: "<feature|improvement|hotfix|analysis|cross-repo|schema|onboard> <permintaan>"
user-invocable: false
---
# /harness:impact

> **Bentuk tunggal** (frontmatter `bentuk: tunggal` di `plan.md`, bawaan item baru sejak 1.16): semua catatan ada di satu `plan.md`, bukan berkas terpisah. `brief` → `## 1. Objective` dan `## 2. Penjelasan` · `impact` dan `align` → `## 3. Dampak & konfirmasi` (tabel service, `### Klaim vs bukti kode`, `### Keputusan terbuka`; ronde di frontmatter `align_rounds`, jangan menulis `align: aligned`) · AC → `## 4. Eksekusi` (`- AC1: ...`) · bukti → `### Bukti` · review → `### Tinjauan` (`verdict: clean|blockers`) · `### Decision log`, `### Status terkini`. Bagian 1–3 dan teks AC beku setelah approved.

Masukan: `$ARGUMENTS`. Keluaran: file, bukan narasi.

Item **selalu** dibuat, sekecil apa pun perubahannya, **kecuali** sesi ini sudah punya item aktif (hook menyebutnya "Sesi ini sedang membahas item …"): permintaan itu lanjutan item tersebut, jadi perbarui berkasnya, jangan membuat item baru. Item baru hanya bila user mengetik "item baru". Jangan menyarankan `quick:`; lajur cepat hanya bila user sendiri mengetik "quick: <permintaan>" (diproses hook).

**Bentuk tunggal: giliran pertama belum selesai sebelum `### Klaim vs bukti kode` berisi minimal satu klaim** (`| C1 | klaim | bukti path:baris | status |`, status `terbukti`/`dugaan`/`bertentangan`) selain baris D. Tanpa klaim, "align ok" user tidak dicatat hook.

## Langkah
1. Tentukan `type` dari kata pertama (feature, improvement, hotfix, analysis, cross-repo, schema, onboard). Bila tidak ada, simpulkan dan sebut asumsimu di `brief.md`.
2. Buat item: `node .claude/hooks/harness.mjs new <type> "<judul singkat>"` → dapat `docs/work/<slug>`.
3. Baca `docs/_map.md`. Bila masih `status: draft` dan kosong, beri tahu user untuk menjalankan `/harness:init` dan lanjut dengan `UNKNOWN`.
4. Pilih service kandidat dari peta. Baca **hanya** `docs/knowledge/<svc>/summary.md` service kandidat. Jangan membaca seluruh knowledge. Knowledge berstatus `draft` dikutip dengan label `[draft]` di `impact.md` dan dicek ke kode sebelum jadi dasar; `verified` boleh dikutip tanpa label.
5. Verifikasi relasi yang meragukan dengan agent `explorer` (paralel bila lintas service). Untuk simbol yang dirujuk lintas file, minta explorer memakai `LSP` (definisi/referensi) bila tersedia; bila tidak, `Grep`. Relasi antar-service dari graph AST tidak lengkap: cek env var base URL, klien HTTP, queue, tabel bersama.
6. Isi `brief.md` (HANYA objective: objective, success criteria, out of scope, open questions; tanpa solusi atau nama file) dan `impact.md` (tabel). Dugaan diberi `?`, fakta diberi `path:baris`.
7. Tulis pertanyaan yang memblokir plan di bagian "Pertanyaan yang harus dijawab user". Bila ada pilihan yang jawabannya mengubah lingkup (mis. service mana, kompatibel mundur atau tidak), tanyakan langsung dengan `AskUserQuestion` (maks 4 pertanyaan, opsi konkret, rekomendasi di opsi pertama), lalu catat jawabannya di `brief.md`. Jangan menebak. Default yang kamu ambil sendiri tidak dinarasikan di chat: tulis sebagai baris D di `## Keputusan terbuka` `align.md` saat align.

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
`docs/work/<slug>` dibuat · service terdampak: ... · N pertanyaan terbuka · lalu baris terakhir keluaran `node .claude/hooks/harness.mjs next <slug> --md` apa adanya. Jangan menulis plan di sesi ini sebelum align ditutup user (hook menolak).
