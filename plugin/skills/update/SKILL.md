---
name: update
description: Memperbarui harness di root project ke versi terbaru dari main. Dipicu "/harness:update" atau kalimat "tolong root nya di update ke main". Opsi all (semua project terdaftar) dan rollback (revert update terakhir).
argument-hint: "[all|rollback]"
---
# /harness:update

Hook sudah menerbitkan tiket sekali pakai dari ketikan user (berlaku 30 menit). Tanpa tiket, perintah di bawah ditolak.

1. Jalankan tepat satu perintah:
   - biasa: `node .claude/hooks/harness.mjs update`
   - semua project: `node .claude/hooks/harness.mjs update --all`
   - batalkan update terakhir: `node .claude/hooks/harness.mjs update --rollback`
2. Perintah itu: memastikan root di `main` (pindah bila bersih, berhenti bila ada perubahan tracked), `git fetch origin main` + `pull --ff-only`, memperbarui berkas milik harness (`docs/discussion`, work item, knowledge, config milik user tidak ditimpa), menjalankan `doctor`, lalu commit `chore(harness): update to vX.Y.Z`. Push ke `origin main` hanya bila `update.autoPush` di `harness.config.json` bernilai true.
3. Jangan commit, push, atau merge sendiri. Jangan mengulang perintah bila gagal; laporkan alasannya.

## Balasan chat (ringkas, persona R-13)
versi sebelum → sesudah · hasil doctor · di-push atau tidak · masalah bila ada · rollback: `/harness:update rollback`.
