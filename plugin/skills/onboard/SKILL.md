---
name: onboard
description: Membangun (ulang) knowledge satu service dari commit baseline (production/main), bukan dari branch yang sedang di-checkout. Dipanggil oleh /harness:init per service; bisa dipakai sendiri untuk satu service.
argument-hint: "<nama-service|all>"
disable-model-invocation: true
---
# /harness:onboard

Masukan: `$ARGUMENTS`. Daftar service: `harness.config.json` → `services`. Untuk bootstrap seluruh workspace pakai `/harness:init`.

## Langkah (per service)
1. **Ukur dulu.** Bila `$ARGUMENTS` = `all` dan belum ada satu pun `docs/knowledge/<svc>/summary.md`: kerjakan HANYA service pertama, lalu berhenti dan minta user melihat `/usage` dan menjawab apakah lanjut.
2. **Baseline.** `node .claude/hooks/harness.mjs baseline <svc> --json` → catat `sha` dan `ref`. Gagal → hentikan, sampaikan alasan.
3. **Worktree sementara.** `node .claude/hooks/harness.mjs worktree add <svc>` → path `.claude/state/worktrees/<svc>` (isi = commit baseline; checkout user tidak tersentuh).
4. **Explorer** (agent `explorer`, paralel maks 4 antar-service): baca dari path worktree itu dan isi
   - `summary.md` (≤80 baris): tujuan, stack, entry point, perintah build/test, env var (**nama saja**), data/tabel, endpoint, dependensi antar-service;
   - `patterns.md` (≤150 baris): pola berulang + 1–2 contoh emas (path nyata).
   Sitasi `path:baris` **relatif ke root service** (tanpa awalan worktree), format `src/x.ts:42` atau `src/x.ts:42-50`, dengan simbol yang diklaim di backtick pada baris yang sama: `` `withAuth` (src/http/auth.ts:1-5) ``. Yang tidak ketemu: `UNKNOWN`; dugaan: `?`. Dilarang mengarang.
5. **Tulis** (kamu, bukan explorer) `docs/knowledge/<svc>/summary.md` dan `patterns.md` dengan frontmatter: `service`, `source_commit: <sha baseline>`, `status: draft`, `updated`. Lalu `node .claude/hooks/harness.mjs lint-knowledge <svc>`; perbaiki ERROR (hapus klaim tak terbukti atau tulis `UNKNOWN`; jangan memutus sitasi hanya agar lint lolos). Maksimal dua putaran; sisanya laporkan.
6. **Lepas worktree**: `node .claude/hooks/harness.mjs worktree rm <svc>`.
7. **Graph (L1), hanya bila `graphify.enabled`** dan `graphify` ada (pin `graphify.version`; `pip install graphifyy==<versi>`), dijalankan SEBELUM langkah 6 terhadap worktree: `graphify update .claude/state/worktrees/<svc>` (AST code-only, offline, tanpa LLM; **jangan** `graphify install`, **jangan** mode semantik tanpa persetujuan) → pindahkan `graphify-out` ke `docs/knowledge/graph/<svc>` (di-gitignore). Query: `graphify explain "<simbol>" --graph docs/knowledge/graph/<svc>/graph.json`. Graph tidak menangkap HTTP antar-service dan wiring implisit; ia hanya menambah daftar dampak.
8. `docs/_map.md`: tambah/ubah baris service (stack, peran, branch baseline) dan relasi yang terbukti.

Status tetap `draft` sampai manusia mengetik `/harness:verify <svc>`.

## Balasan chat (maks 5 baris)
Service ter-onboard: ... · baseline: ref@sha · lint: bersih/n ERROR · UNKNOWN: n · berikutnya: `knowledge-sample <svc>` lalu `/harness:verify <svc>`
