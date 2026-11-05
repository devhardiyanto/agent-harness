# Harness — aturan kerja agent

Bahasa: Indonesia lugas; istilah teknis tetap baku. Sumber kebenaran plan = file di `docs/work/`, bukan chat.

## Peta
- Pertama kali di workspace: `/harness:init` (inventaris, baseline production/main, knowledge, usulan checks). Peringatan "tertinggal" di awal sesi → `/harness:knowledge refresh <svc>`.
- `docs/_map.md` — service, peran, relasi antar-service (L0). Baca dulu.
- `docs/knowledge/<svc>/` — ringkasan (L2) dan pola + contoh emas (L3) per service. Baca hanya service yang kena. Status `draft` = belum diverifikasi manusia: petunjuk, bukan fakta. Kutipannya diberi label `[draft]` dan dicek ke kode sebelum jadi dasar AC.
- `docs/work/<tanggal-slug>/` — `brief.md` `impact.md` `align.md` `plan.md` `progress.md` `review.md`.
- Model: sesi utama Sonnet; `scout`/`runner` Haiku (murah, read-only / menjalankan test); `reviewer` Opus (menolak/menyetujui). Handoff otomatis: `.harness/handoff.md` disuntik di awal sesi berikutnya.

## Alur (satu work item = satu alur penuh)
1. `/harness:impact <permintaan>` — dampak dari prompt pertama → `brief.md` (objective saja), `impact.md`.
2. `/harness:align <slug>` — uji klaim permintaan ke kode secara skeptis → `align.md`. Debat maks 3 ronde; user menutup dengan `/harness:align <slug> ok` (hook menulis `aligned`). Temuan sampingan → parking lot, bukan dikerjakan.
3. `/harness:plan <slug>` — `plan.md` berstatus `draft` (AC bernomor `- AC1: ...`). **Sesi planning berhenti di sini.**
4. User mengetik `/harness:approve <slug>` → hook menulis `approved` (butuh `aligned`). Agent tidak boleh.
5. Sesi baru: `/harness:build <slug>` → `in-progress`, catat bukti per AC di `progress.md`. Test dijalankan agent `runner` (bukti ditulis kode, bukan agent); sesi tidak bisa berhenti bila bukti test belum ada.
6. `/harness:review <slug>` → `review.md` (`verdict: clean|blockers`, agent `reviewer`). Ada blocker → kembali ke build.
7. `done` hanya bila tiap AC punya bukti + review `clean` (hook memeriksa). 
8. `/harness:ship <slug>` — branch kerja, commit, push, PR via `gh`. `merged` setelah PR benar-benar MERGED.

Status: `draft → approved → in-progress → in-review → done → merged`. Plan beku setelah approved; revisi besar = `reopen` lalu approve ulang; tambahan AC kecil = `harness.mjs amend <slug> --ac "..."` (maks 3).

## Lajur quick (perubahan kecil)
User mengetik `/harness:quick <permintaan>`: hook membuat item `approved` (ketikan itu = persetujuan). Satu service, maks 5 file, bukan skema, dikerjakan di sesi yang sama, tanpa `in-review` (bukti AC + checks). Melebihi batas → `harness.mjs promote <slug>` lalu plan + approve. Bingung langkah berikutnya: `/harness:next`.

## Batas keras (ditegakkan hook; jangan dicari celahnya)
- Edit kode di service tanpa work item `approved/in-progress` yang mencakup service itu → diblokir.
- Jangan commit/push ke branch utama/dilindungi, jangan force push, jangan `gh pr merge`.
- Jangan baca/tulis `.env`, kunci privat, atau menulis secret literal. Pakai variabel lingkungan.
- `.claude/hooks/`, `.claude/settings.json`, `harness.config.json` tidak boleh diubah agent.
- Layout multi-repo: root selalu di `main`, tanpa worktree/branch untuk root. Catatan kerja (`docs/`) ditulis langsung di root `main` (commit oleh manusia). Worktree hanya di repo service: `git -C source-code/<svc> worktree add ...`.
- Perubahan skema (migrations/*.sql) hanya di work item bertipe `schema` dan lewat agent `dba`.
- Dependency baru: laporan diff muncul di `deps-report.md`; justifikasi di review.

## Format keluaran
- Plan, analisa, dan temuan = file/tabel/checklist, bukan narasi.
- Balasan chat maksimal 5 baris: apa yang selesai + path file + langkah user berikutnya.
- Jangan mengulang isi file ke chat. Jangan menulis esai.

## Minimalis
Sebelum menambah kode/dependency: perlu ada? sudah ada di codebase? stdlib/native cukup? dependency terpasang cukup? satu baris cukup? Ambil yang terkecil. Tangga lengkap: `.claude/rules/minimalis.md`.

## Konteks
Peringatan di ±400k token: simpan status ke `progress.md`, sarankan sesi baru.
