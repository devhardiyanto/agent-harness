---
name: refresh
description: Memperbarui knowledge service yang tertinggal dari baseline, hanya area yang berubah sejak source_commit. Fakta diperbarui sebagai draft; perubahan pola hanya diusulkan, disetujui manusia.
argument-hint: "<nama-service|all>"
disable-model-invocation: true
---
# /harness:refresh

Masukan: `$ARGUMENTS`. Peringatan "tertinggal N commit" muncul otomatis di awal sesi (`knowledge-status`, nol token).

## Langkah (per service)
1. `node .claude/hooks/harness.mjs knowledge-status <svc>`. `ok` → lewati. `unknown-commit` → knowledge dibangun dari commit yang tak ada di repo ini: ulangi `/harness:onboard <svc>`.
2. `baseline <svc> --fetch --json` (git fetch saja) → `sha` baru. `git -C source-code/<svc> diff --stat <source_commit>..<sha>` dan `--name-only`; hanya area yang berubah yang di-explore ulang (agent `explorer` pada `worktree add <svc>`).
3. **Fakta** (`summary.md`, sitasi di `patterns.md`): edit bagian terdampak; **ground ulang** sitasi yang bergeser (termasuk `@sha` dari work item → ganti dengan baris di `source_commit` baru); perbarui `source_commit` = sha baseline dan `updated`. File yang sebelumnya `verified` WAJIB diturunkan ke `status: draft` dalam edit yang sama (gate menolak sebaliknya); verifikasi ulang oleh manusia via `/harness:verify`.
4. **Pola**: JANGAN menulis pola baru atau mengubah makna pola. Bila diff menunjukkan pola baru/berubah, buat work item `node .claude/hooks/harness.mjs new onboard "refresh-pola <svc>"` dan tulis usulan di `docs/work/<slug>/patterns-proposal.md` (format di `/harness:review` langkah 7; `Status: proposed`, sitasi `path:baris@<sha baseline>`). Manusia menyetujui dengan `/harness:patterns <slug> P1`.
5. `lint-knowledge <svc>` harus bersih. `worktree rm <svc>`. Perbarui `_map.md` bila relasi berubah (dan graph bila `graphify.enabled`).
6. Tabel hasil: service | commit lama→baru | berkas berubah | bagian diubah | usulan pola.

## Balasan chat (maks 5 baris)
n diperbarui, m dilewati · lint bersih/ERROR · usulan pola: slug · berikutnya: `/harness:verify <svc>`
