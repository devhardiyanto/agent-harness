---
name: quick
description: Lajur cepat untuk perubahan kecil (satu service, bukan skema, maksimal 5 file). Ketikanmu menjadi persetujuan: hook membuat work item berstatus approved, dikerjakan di sesi yang sama, tanpa review subagent.
argument-hint: "<permintaan>"
disable-model-invocation: true
---
# /harness:quick

Perintah ini diproses hook sebelum sampai ke kamu. Hook membuat `docs/work/<slug>/` (`lane: quick`, `status: approved`, AC1 = permintaan user, `approved_by` = user). Agent tidak pernah membuat item quick sendiri.

## Batas (ditegakkan hook)
- Satu service: terikat pada service pertama yang diedit; service lain diblokir.
- Maksimal `quick.max_files` file (bawaan 5); file ke-6 diblokir.
- Bukan skema (`schema_paths`) dan bukan dependency baru yang butuh justifikasi.
- Tanpa review subagent; gantinya gerbang pengiriman (`gate.md`) dan checks service.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>` (slug ada di pesan hook). Baca `docs/knowledge/<svc>/summary.md` dan `patterns.md` service yang kena, bila ada.
2. Kerjakan perubahan minimal (`.claude/rules/minimalis.md`). Perlu AC tambahan yang kecil: `node .claude/hooks/harness.mjs amend <slug> --ac "<kalimat yang bisa diverifikasi>"`.
3. Tulis bukti nyata per AC di `progress.md` bagian `## Verifikasi` (`- AC1: <output/hasil>`).
4. `node .claude/hooks/harness.mjs set-status <slug> done` (menjalankan gerbang pengiriman: bukti AC, checks service yang terkonfigurasi, secret di diff → `gate.md`; FAIL menolak done).
5. Hook menolak karena melebihi batas (service kedua, file ke-6, skema): berhenti dan tanyakan lewat `AskUserQuestion` apakah di-`promote` ke standard atau lingkupnya dipangkas. `node .claude/hooks/harness.mjs promote <slug>` mengubahnya ke lajur standard (`draft`), lalu minta user menjalankan `/harness:plan <slug>` dan `/harness:approve <slug>`.

## Balasan chat (maks 3 baris)
Selesai: apa yang berubah · file n · berikutnya: "push PR + merge <slug>"
