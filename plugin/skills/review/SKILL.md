---
name: review
description: Review independen hasil kerja work item (agent reviewer read-only) menjadi review.md. Clean memungkinkan status done; blocker mengembalikan ke build. Juga untuk memasukkan feedback user.
argument-hint: "<slug> [feedback user]"
disable-model-invocation: true
---
# /harness:review

Masukan: `$ARGUMENTS` (slug, opsional feedback). Item lajur quick tidak di-review (tidak punya `in-review`); langsung `/harness:ship <slug>`.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`; status harus `in-review` (atau `in-progress` bila user ingin review awal).
2. Panggil agent `reviewer` (subagent) dengan path `docs/work/<slug>/` dan daftar service. Reviewer tidak menulis file; ia mengembalikan tabel temuan, blok `POLA` (pola baru/menyimpang), dan `VERDICT`.
3. Tulis `review.md`: tabel temuan; setiap BLOCKER juga sebagai `- [ ] [BLOCKER] ...`; frontmatter `verdict: clean|blockers`, `reviewed: <tanggal>`. Tambahkan tabel "Dependency baru" dari `deps-report.md` bila ada.
4. Feedback user (bila ada di argumen): catat di `review.md` bagian "Feedback user" sebagai checklist `- [ ]`. Feedback yang mengubah lingkup → butuh `reopen` + plan baru; feedback yang tidak → perbaikan di build.
5. **Ada blocker/feedback terbuka** → `node .claude/hooks/harness.mjs set-status <slug> in-progress`. Balas: jumlah item + `/harness:build <slug>`. Siklus ini berulang tanpa batas sampai user puas.
6. **Clean** → `node .claude/hooks/harness.mjs set-status <slug> done`. Hook gerbang 2 memeriksa bukti tiap AC. Bila ditolak, perbaiki bukti di `progress.md`, jangan melewati gerbang.

7. **Pola berubah (hanya bila verdict clean).** Dari blok `POLA` reviewer, tulis bagian `## Pola (usulan)` di `review.md` (tabel ringkas) dan, bila ada yang layak, `docs/work/<slug>/patterns-proposal.md`. Syarat usulan: pola dipakai ≥2 tempat di diff, atau menyimpang dari `patterns.md` dengan alasan; maksimal 3 usulan; bukti `path:baris@<sha>` dengan `<sha>` = `git -C source-code/<svc> rev-parse HEAD`. Format tiap item (persis):

   ````
   ## P1 · <service> · tambah            (atau: ganti)
   Bukti: src/x.ts:12@<sha>; src/y.ts:30@<sha>
   Ganti: <baris persis di patterns.md>   (hanya untuk "ganti")
   Status: proposed

   ```pola
   - <satu butir pola, ≤8 baris, dengan sitasi path:baris@<sha>>
   ```
   ````
   Agent hanya boleh menulis `Status: proposed`; gate menolak `approved/applied`. Validasi: `node .claude/hooks/harness.mjs patterns-check <slug>`. AI **hanya mengusulkan**: pola adalah aturan yang akan diikuti sesi-sesi berikutnya, jadi persetujuannya milik manusia (`/harness:knowledge patterns <slug> P1,P3` atau `all`). Tidak disetujui = patterns.md tidak berubah.

## Balasan chat (maks 5 baris)
verdict · N temuan (b blocker) · usulan pola: n (`/harness:knowledge patterns <slug> ...`) · path `review.md` · berikutnya: `/harness:build` atau `/harness:ship <slug>`
