# Harness v1 — aturan kerja agent

Bahasa: Indonesia lugas; istilah teknis tetap baku. Sumber kebenaran plan = file di `docs/work/`, bukan chat.

## Peta
- Pertama kali di workspace: `/harness:init` (inventaris, baseline production/main, knowledge, usulan checks). Peringatan "tertinggal" di awal sesi → `/harness:refresh <svc>`.
- `docs/_map.md` — service, peran, relasi antar-service (L0). Baca dulu.
- `docs/knowledge/<svc>/` — ringkasan (L2) dan pola + contoh emas (L3) per service. Baca hanya service yang kena. Status `draft` = belum diverifikasi manusia: perlakukan sebagai petunjuk, cek ke kode.
- `docs/work/<tanggal-slug>/` — `brief.md` `impact.md` `plan.md` `progress.md` `review.md`.
- `docs/knowledge/graph/` — graph struktural (L1), opsional (nonaktif bawaan), di-gitignore; hanya menambah daftar dampak; jangan dibaca utuh: `graphify explain "<simbol>" --graph docs/knowledge/graph/<svc>/graph.json`.

## Alur (satu work item = satu alur penuh)
1. `/harness:impact <permintaan>` — dampak dari prompt pertama → `brief.md`, `impact.md`.
2. `/harness:plan <slug>` — `plan.md` berstatus `draft` (AC bernomor `- AC1: ...`). **Sesi planning berhenti di sini.**
3. User mengetik `/harness:approve <slug>` → hook menulis `approved`. Agent tidak boleh.
4. Sesi baru: `/harness:build <slug>` → `in-progress`, catat bukti per AC di `progress.md`.
5. `/harness:review <slug>` → `review.md` (`verdict: clean|blockers`). Ada blocker → kembali ke build.
6. `done` hanya bila tiap AC punya bukti + review `clean` (hook memeriksa). 
7. `/harness:ship <slug>` — branch kerja, commit, push, PR via `gh`. `merged` setelah PR benar-benar MERGED.

Status: `draft → approved → in-progress → in-review → done → merged`. Plan beku setelah approved; revisi = `reopen` lalu approve ulang.

## Batas keras (ditegakkan hook; jangan dicari celahnya)
- Edit kode di service tanpa work item `approved/in-progress` yang mencakup service itu → diblokir.
- Jangan commit/push ke branch utama/dilindungi, jangan force push, jangan `gh pr merge`.
- Jangan baca/tulis `.env`, kunci privat, atau menulis secret literal. Pakai variabel lingkungan.
- `.claude/hooks/`, `.claude/settings.json`, `harness.config.json` tidak boleh diubah agent.
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
