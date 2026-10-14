---
name: review
description: Review independen hasil kerja work item (agent reviewer read-only) menjadi review.md. Clean memungkinkan status done; blocker mengembalikan ke build. Juga untuk memasukkan feedback user.
argument-hint: "<slug> [feedback user]"
disable-model-invocation: true
---
# /harness:review

Masukan: `$ARGUMENTS` (slug, opsional feedback).

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`; status harus `in-review` (atau `in-progress` bila user ingin review awal).
2. Panggil agent `reviewer` (subagent) dengan path `docs/work/<slug>/` dan daftar service. Reviewer tidak menulis file; ia mengembalikan tabel temuan + `VERDICT`.
3. Tulis `review.md`: tabel temuan; setiap BLOCKER juga sebagai `- [ ] [BLOCKER] ...`; frontmatter `verdict: clean|blockers`, `reviewed: <tanggal>`. Tambahkan tabel "Dependency baru" dari `deps-report.md` bila ada.
4. Feedback user (bila ada di argumen): catat di `review.md` bagian "Feedback user" sebagai checklist `- [ ]`. Feedback yang mengubah lingkup → butuh `reopen` + plan baru; feedback yang tidak → perbaikan di build.
5. **Ada blocker/feedback terbuka** → `node .claude/hooks/harness.mjs set-status <slug> in-progress`. Balas: jumlah item + `/harness:build <slug>`. Siklus ini berulang tanpa batas sampai user puas.
6. **Clean** → `node .claude/hooks/harness.mjs set-status <slug> done`. Hook gerbang 2 memeriksa bukti tiap AC. Bila ditolak, perbaiki bukti di `progress.md`, jangan melewati gerbang.

## Balasan chat (maks 5 baris)
verdict · N temuan (b blocker) · path `review.md` · berikutnya: `/harness:build` atau `/harness:ship <slug>`
