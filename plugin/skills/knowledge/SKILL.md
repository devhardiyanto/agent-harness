---
name: knowledge
description: Satu pintu untuk knowledge per service: onboard (bangun dari baseline), refresh (perbarui yang tertinggal), verify (manusia: draft menjadi verified), patterns (manusia: setujui usulan pola).
argument-hint: "onboard|refresh|verify|patterns <service|slug> [P1,P3|all]"
disable-model-invocation: true
---
# /harness:knowledge

Masukan: `$ARGUMENTS`; kata pertama = subperintah. Daftar service: `harness.config.json` → `services`.

| subperintah | siapa | efek |
|---|---|---|
| `onboard <svc\|all>` | agent | bangun `summary.md` + `patterns.md` (status `draft`) dari commit baseline |
| `refresh <svc\|all>` | agent | perbarui hanya area yang berubah sejak `source_commit` |
| `verify <svc>` | **hanya manusia** (hook) | `draft → verified` bila `lint-knowledge` bersih |
| `patterns <slug> <P1,P3\|all>` | **hanya manusia** (hook) | terapkan usulan pola dari review ke `patterns.md` |

`verify` dan `patterns` diproses hook sebelum sampai ke kamu; agent tidak boleh menulis status `verified`/`applied`.

## onboard `<svc|all>`
1. **Ukur dulu.** Bila `all` dan belum ada satu pun `docs/knowledge/<svc>/summary.md`: kerjakan HANYA service pertama, lalu berhenti dan minta user melihat `/usage` dan memutuskan lanjut.
2. `node .claude/hooks/harness.mjs baseline <svc> --json` → catat `sha`, `ref`. Gagal → hentikan, sampaikan alasan.
3. `node .claude/hooks/harness.mjs worktree add <svc>` → `.claude/state/worktrees/<svc>` (isi = commit baseline; checkout user tidak tersentuh).
4. Agent `explorer` (paralel maks 4 antar-service) membaca dari worktree dan mengisi:
   - `summary.md` (≤80 baris): tujuan, stack, entry point, perintah build/test, env var (**nama saja**), data/tabel, endpoint, dependensi antar-service;
   - `patterns.md` (≤150 baris): pola berulang + 1–2 contoh emas (path nyata).
   Sitasi `path:baris` relatif ke root service (`src/x.ts:42` atau `src/x.ts:42-50`), simbol yang diklaim di backtick pada baris yang sama. Tidak ketemu: `UNKNOWN`; dugaan: `?`. Dilarang mengarang.
5. Tulis (kamu, bukan explorer) kedua file dengan frontmatter `service`, `source_commit: <sha baseline>`, `status: draft`, `updated`. Lalu `node .claude/hooks/harness.mjs lint-knowledge <svc>`; perbaiki ERROR (hapus klaim tak terbukti atau tulis `UNKNOWN`; jangan memutus sitasi hanya agar lint lolos). Maksimal dua putaran; sisanya laporkan.
6. `worktree rm <svc>`. Perbarui `docs/_map.md` (baris service, relasi yang terbukti).
7. **Graph (L1), hanya bila `graphify.enabled`:** `graphify update .claude/state/worktrees/<svc>` sebelum langkah 6; pindahkan `graphify-out` ke `docs/knowledge/graph/<svc>` (di-gitignore). Graph hanya menambah daftar dampak.

Balasan (≤5 baris): service ter-onboard · baseline ref@sha · lint bersih/n ERROR · UNKNOWN n · berikutnya `knowledge-sample <svc>` lalu `/harness:knowledge verify <svc>`.

## refresh `<svc|all>`
Peringatan "tertinggal N commit" muncul otomatis di awal sesi.
1. `node .claude/hooks/harness.mjs knowledge-status <svc>`. `ok` → lewati. `unknown-commit` → ulangi `onboard`.
2. `baseline <svc> --fetch --json` → `sha` baru; `git -C source-code/<svc> diff --stat <source_commit>..<sha>` dan `--name-only`; explore ulang hanya area yang berubah (`worktree add <svc>`).
3. **Fakta**: edit bagian terdampak; ground ulang sitasi yang bergeser (termasuk `@sha` dari work item); perbarui `source_commit` dan `updated`. File yang sebelumnya `verified` WAJIB turun ke `draft` dalam edit yang sama (gate menolak sebaliknya).
4. **Pola**: jangan menulis pola baru atau mengubah maknanya. Bila diff menunjukkan pola baru/berubah: `harness.mjs new onboard "refresh-pola <svc>"` dan tulis `docs/work/<slug>/patterns-proposal.md` (`Status: proposed`, sitasi `path:baris@<sha baseline>`). Manusia menyetujui lewat `patterns`.
5. `lint-knowledge <svc>` bersih; `worktree rm <svc>`; perbarui `_map.md` bila relasi berubah.

Balasan (≤5 baris): n diperbarui, m dilewati · lint · usulan pola: slug · berikutnya `/harness:knowledge verify <svc>`.

## verify `<svc>` (hook)
Yang berubah: `docs/knowledge/<svc>/{summary,patterns}.md` → `status: verified` (+ `verified_by`, `verified_at`), hanya bila lint bersih.
1. Hook menolak (lint ERROR): tampilkan temuan, perbaiki hanya yang jelas salah (hapus klaim tak terbukti atau `UNKNOWN`/`?`; jangan mengubah sitasi tanpa membaca kodenya), minta user mengetik perintah lagi.
2. Tidak ada pesan hook sama sekali: hook tidak aktif; minta user menjalankan `! node .claude/hooks/harness.mjs verify-knowledge <svc>`.
3. Berhasil: satu baris.

## patterns `<slug> <P1,P3|all>` (hook)
Item yang disetujui diterapkan apa adanya ke `patterns.md`; status item menjadi `applied`.
1. Tanpa `P…`: `node .claude/hooks/harness.mjs patterns-check <slug>`, tampilkan item `proposed`, minta user memilih.
2. Hook menolak → sampaikan alasannya, perbaiki usulan (hanya `Status: proposed`), minta user mengulang.
3. Berhasil: satu baris, lalu `lint-knowledge <svc>`.
