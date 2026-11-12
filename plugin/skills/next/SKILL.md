---
name: next
description: Menampilkan langkah berikutnya untuk tiap work item terbuka: siapa yang bertindak dan perintah persisnya.
argument-hint: "[slug]"
disable-model-invocation: true
allowed-tools: Bash(node .claude/hooks/harness.mjs *)
---
# /harness:next

Jalankan dan tampilkan keluarannya apa adanya (tabel):

```
node .claude/hooks/harness.mjs next $ARGUMENTS --md
```

Tanpa argumen: semua item yang belum `merged`. Untuk daftar lengkap yang menggantung (pertanyaan terbuka, klaim, AC tanpa bukti, usulan memori): `node .claude/hooks/harness.mjs open --md` (user cukup mengetik "sisa"). Jangan menambah komentar; jangan menjalankan langkah yang ditandai untuk "kamu" (user).
