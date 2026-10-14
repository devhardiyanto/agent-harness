---
name: onboard
description: Membangun pengetahuan project (L0 peta, L1 graph opsional, L2 ringkasan, L3 pola) untuk satu service atau semua service. Mulai dari satu service untuk mengukur biaya sebelum menjalankan semuanya.
argument-hint: "<nama-service|all>"
disable-model-invocation: true
---
# /harness:onboard

Masukan: `$ARGUMENTS`. Daftar service: `harness.config.json` → `services`.

## Langkah
1. **Ukur dulu.** Bila `$ARGUMENTS` = `all` dan belum ada satu pun `docs/knowledge/<svc>/summary.md` berstatus draft/verified: kerjakan HANYA service pertama, lalu berhenti dan minta user melihat `/usage` (biaya satu service) dan menjawab apakah lanjut `all`.
2. Per service, panggil agent `explorer` (paralel maks 4) dengan perintah: isi `summary.md` (≤80 baris: tujuan, stack, entry point, perintah build/test, env var **nama saja**, data/tabel, endpoint, dependensi antar-service) dan `patterns.md` (pola berulang + 1–2 contoh emas berupa path nyata). Tiap fakta `path:baris`; yang tidak ketemu `UNKNOWN`.
3. Kamu (bukan explorer) menulis hasilnya ke `docs/knowledge/<svc>/summary.md` dan `patterns.md` dengan frontmatter: `service`, `source_commit` (`git -C source-code/<svc> rev-parse HEAD`), `status: draft`, `updated`.
4. **Graph (L1), opsional, tanpa token.** Hanya bila `graphify.enabled` dan perintah `graphify` ada (terverifikasi pada graphifyy 0.9.90; pin di `harness.config.json` → `graphify.version`; pasang: `pip install graphifyy==<versi>`):
   - `graphify update source-code/<svc>` — ekstraksi AST code-only, offline, tanpa LLM. **Jangan** menjalankan `graphify install` (menulis hook/skill ke config global) dan **jangan** mode semantik (memakai token) tanpa persetujuan user.
   - Pindahkan hasilnya keluar dari repo service: `mv source-code/<svc>/graphify-out docs/knowledge/graph/<svc>`.
   - Gabungan lintas service: `graphify merge-graphs docs/knowledge/graph/*/graph.json --out docs/knowledge/graph/merged-graph.json`.
   - Query (jangan baca graph utuh): `graphify explain "<simbol>" --graph docs/knowledge/graph/<svc>/graph.json`, `graphify path "A" "B" --graph ...`.
   - Graph AST tidak menangkap panggilan HTTP antar-service; relasi itu tetap dari langkah 5.
   Tidak ada/gagal → lewati dan catat satu baris di `_map.md`.
5. Perbarui `docs/_map.md`: tabel service (stack, peran, aktif?, pemilik skema?), relasi antar-service (dari env var base URL, klien HTTP, queue, tabel bersama; bukan dari graph saja), data bersama. Tandai `?` untuk dugaan, jangan mengarang.
6. Tanyakan ke user (satu pesan) hal yang `UNKNOWN` dan menentukan: service tak aktif, pemilik skema.

## Balasan chat (maks 5 baris)
Service ter-onboard: ... · UNKNOWN: n item (di `_map.md`) · berikutnya: verifikasi `draft` lalu `/harness:impact`
