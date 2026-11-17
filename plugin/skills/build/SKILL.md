---
name: build
description: Eksekusi plan yang sudah approved di sesi baru. Menjalankan agent spesialis bidang (backend/frontend/devops/dba) per service, mencatat bukti verifikasi per AC di progress.md, lalu menaikkan status ke in-review.
argument-hint: "<slug>"
user-invocable: false
---
# /harness:build

> **Bentuk tunggal** (frontmatter `bentuk: tunggal` di `plan.md`, bawaan item baru sejak 1.16): semua catatan ada di satu `plan.md`, bukan berkas terpisah. `brief` → `## 1. Objective` dan `## 2. Penjelasan` · `impact` dan `align` → `## 3. Dampak & konfirmasi` (tabel service, `### Klaim vs bukti kode`, `### Keputusan terbuka`; ronde di frontmatter `align_rounds`, jangan menulis `align: aligned`) · AC → `## 4. Eksekusi` (`- AC1: ...`) · bukti → `### Bukti` · review → `### Tinjauan` (`verdict: clean|blockers`) · `### Decision log`, `### Status terkini`. Bagian 1–3 dan teks AC beku setelah approved.

Masukan: `$ARGUMENTS` (slug). Sesi ini adalah sesi **eksekusi**.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`. Status harus `approved` atau `in-progress`. Jika `draft`: berhenti, minta user approve.
2. `node .claude/hooks/harness.mjs start <slug>` (→ `in-progress`).
3. Baca `plan.md`, `impact.md`, dan `progress.md` (lanjutkan dari "Status terkini" bila ada). `TaskCreate` satu tugas per AC (subjek = `AC<n>: ...`, tandai yang sudah punya bukti sebagai selesai); `TaskUpdate` ke `in_progress` saat dikerjakan dan `completed` hanya setelah buktinya tertulis di `progress.md`. Daftar tugas hanya tampilan; sumber kebenaran tetap `progress.md`.
4. Siapkan branch kerja di tiap service tercakup (bukan `root_branch`): `git -C source-code/<svc> switch -c <feat|fix|chore>/<slug-pendek>` (atau `switch` bila sudah ada).
5. Kerjakan sesuai urutan di `plan.md`:
   - kode → agent **spesialis bidang** service itu (`backend`, `frontend`, `devops`; lihat `node .claude/hooks/harness.mjs bidang` atau baris "Eksekusi oleh spesialis" dari hook), satu service pada satu waktu; service tanpa bidang → `implementer`. Sesi utama tidak mengedit kode service sendiri;
   - migrasi/skema → agent `dba` lebih dulu.
6. Setiap AC selesai → tulis bukti nyata di `progress.md` bagian `## Verifikasi`: `- AC1: <output/respons/langkah+hasil>`. Perbarui "Status terkini".
7. Bila hook memperingatkan konteks ±400k token: simpan status ke `progress.md`, berhenti, minta user lanjut di sesi baru dengan "kerjakan <slug>".
8. Semua AC punya bukti → panggil agent `runner` (Haiku) dengan slug: ia menjalankan `node .claude/hooks/harness.mjs run-checks <slug>`, dan KODE harness menulis bukti `.harness/evidence/<slug>/tests.json`. Sesi tidak bisa berhenti selagi bukti itu belum ada, gagal, atau usang (kode berubah setelahnya). FAIL → perbaiki lalu jalankan runner lagi. Bukti PASS → `node .claude/hooks/harness.mjs set-status <slug> in-review`. Gerbang pengiriman (`gate`) tetap berlaku saat `done`.

## Aturan
- Hanya yang ada di plan. Temuan lain → `progress.md` bagian "Di luar lingkup".
- Hook memblokir sesuatu → jangan memutar; catat di `progress.md` dan laporkan.
- Perlu keputusan user di tengah jalan (bukan perubahan plan) → `AskUserQuestion`, catat jawabannya di `progress.md`.
- Perlu mengubah plan → berhenti dan minta user (`reopen` + approve ulang).

## Balasan chat (maks 5 baris)
Status akhir · AC terbukti x/y · path `progress.md` · berikutnya: skill review
