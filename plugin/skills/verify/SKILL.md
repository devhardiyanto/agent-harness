---
name: verify
description: Verifikasi knowledge service oleh manusia (draft → verified). Hook memproses perintah ini dan hanya menulis status bila lint-knowledge bersih; agent tidak boleh menaikkan status sendiri.
argument-hint: "<service>"
disable-model-invocation: true
---
# /harness:verify

Perintah ini diproses hook sebelum sampai ke kamu. Yang berubah: `docs/knowledge/$ARGUMENTS/{summary,patterns}.md` → `status: verified` (+ `verified_by`, `verified_at`), ditulis hook, hanya bila `lint-knowledge` bersih.

Tugasmu:
1. Bila hook menolak (lint ERROR): tampilkan temuan (tabel), perbaiki hanya yang jelas salah di file knowledge (hapus klaim yang tak terbukti atau tulis `UNKNOWN`/`?`; jangan mengubah sitasi agar lolos tanpa membaca kodenya), lalu minta user mengetik `/harness:verify $ARGUMENTS` lagi.
2. Bila belum ada pesan hook sama sekali: hook tidak aktif. Minta user menjalankan sendiri: `! node .claude/hooks/harness.mjs verify-knowledge $ARGUMENTS`.
3. Berhasil: balas satu baris.

Jangan menulis `status: verified` dengan cara apa pun; gate menolaknya.
