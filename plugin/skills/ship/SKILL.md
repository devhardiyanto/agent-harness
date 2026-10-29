---
name: ship
description: Commit, push branch kerja, dan buka PR via gh untuk work item berstatus done; pada panggilan berikutnya memeriksa lewat gh apakah PR sudah merged lalu menutup work item.
argument-hint: "<slug>"
disable-model-invocation: true
---
# /harness:ship

Masukan: `$ARGUMENTS` (slug). Merge adalah keputusan manusia; kamu tidak pernah merge.

## Fase A — status `done`, `pr:` kosong
0. Baca `docs/work/<slug>/gate.md`: `verdict` harus `pass` dan masih berlaku (`node .claude/hooks/harness.mjs gate <slug>` menjalankannya ulang). Baris `TIDAK DIPERIKSA` (service tanpa checks) dicantumkan apa adanya di body PR.
1. Tiap service di `services:`: pastikan di branch kerja (bukan `root_branch`), `git -C source-code/<svc> status --short`; commit perubahan terkait saja dengan pesan mengikuti konvensi repo (ringkas, rujuk slug).
2. `git -C source-code/<svc> push -u origin <branch>`.
3. `gh pr create --base <root_branch> --title "<judul>" --body-file <file sementara>`; body berupa tabel: ringkasan, AC + bukti (dari `progress.md`), risiko, rollback, dependency baru, tautan work item. Satu PR per service; sebutkan urutan merge bila lintas service.
4. Tulis `pr: [url1, url2]` ke frontmatter `plan.md` (Edit biasa; hook mengizinkan field `pr`).

## Fase B — `pr:` terisi, user menyatakan PR sudah merged
1. `node .claude/hooks/harness.mjs set-status <slug> merged` — hook memeriksa lewat `gh pr view` bahwa semua PR `MERGED`.
2. Ditolak → sampaikan PR mana yang belum merged. Jangan memaksa.
3. Berhasil → work item selesai.

## Balasan chat (maks 5 baris)
URL PR (satu per baris) · urutan merge · berikutnya: "merge manual, lalu `/harness:ship <slug>` lagi"
