---
name: update
description: Memperbarui harness di root project ke versi terbaru dari main. Dipicu "/harness:update" atau permintaan update harness. Opsi all (semua project terdaftar) dan rollback (revert update terakhir).
argument-hint: "[all|rollback]"
disable-model-invocation: true
---
# /harness:update

1. Jalankan tepat satu perintah:
   - biasa: `node .claude/hooks/harness.mjs update`
   - semua project: `node .claude/hooks/harness.mjs update --all`
   - batalkan update terakhir: `node .claude/hooks/harness.mjs update --rollback`
2. Perintah itu memastikan root di `main`, `pull --ff-only`, memperbarui berkas milik harness (data di `docs/` tidak ditimpa), menjalankan `doctor`, lalu commit `chore(harness): update to vX.Y.Z`.
3. Jangan commit, push, atau merge sendiri. Gagal → laporkan alasannya, jangan ulangi.

Balasan: versi sebelum → sesudah · hasil doctor · di-push atau tidak.
