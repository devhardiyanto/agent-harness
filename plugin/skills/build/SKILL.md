---
name: build
description: Eksekusi plan yang sudah approved di sesi baru. Menjalankan implementer per service, mencatat bukti verifikasi per AC di progress.md, lalu menaikkan status ke in-review.
argument-hint: "<slug>"
disable-model-invocation: true
---
# /harness:build

Masukan: `$ARGUMENTS` (slug). Sesi ini adalah sesi **eksekusi**.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`. Status harus `approved` atau `in-progress`. Jika `draft`: berhenti, minta user approve.
2. `node .claude/hooks/harness.mjs start <slug>` (→ `in-progress`). Lalu ikuti skill `plane` untuk menyinkronkan bila Plane aktif di `harness.config.json`.
3. Baca `plan.md`, `impact.md`, dan `progress.md` (lanjutkan dari "Status terkini" bila ada).
4. Siapkan branch kerja di tiap service tercakup (bukan `root_branch`): `git -C source-code/<svc> switch -c <feat|fix|chore>/<slug-pendek>` (atau `switch` bila sudah ada).
5. Kerjakan sesuai urutan di `plan.md`:
   - kode → agent `implementer`, satu service pada satu waktu. Bila `executor.enabled` bernilai `true` di `harness.config.json` dan user memilih jalur executor: berhenti di sini dan arahkan ke `/harness:dispatch <slug>`;
   - migrasi/skema → agent `dba` lebih dulu.
6. Setiap AC selesai → tulis bukti nyata di `progress.md` bagian `## Verifikasi`: `- AC1: <output/respons/langkah+hasil>`. Perbarui "Status terkini".
7. Bila hook memperingatkan konteks ±400k token: simpan status ke `progress.md`, berhenti, minta user lanjut di sesi baru dengan `/harness:build <slug>`.
8. Semua AC punya bukti → `node .claude/hooks/harness.mjs set-status <slug> in-review`.

## Aturan
- Hanya yang ada di plan. Temuan lain → `progress.md` bagian "Di luar lingkup".
- Hook memblokir sesuatu → jangan memutar; catat di `progress.md` dan laporkan.
- Perlu mengubah plan → berhenti dan minta user (`reopen` + approve ulang).

## Balasan chat (maks 5 baris)
Status akhir · AC terbukti x/y · path `progress.md` · berikutnya: `/harness:review <slug>`
