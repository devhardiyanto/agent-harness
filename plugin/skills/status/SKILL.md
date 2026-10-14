---
name: status
description: Menampilkan tabel work item dan status instalasi harness (doctor).
disable-model-invocation: true
---
# /harness:status

Jalankan dan tampilkan keluarannya apa adanya (tabel), tanpa komentar tambahan kecuali ada baris GAGAL:

```
node .claude/hooks/harness.mjs list
node .claude/hooks/harness.mjs doctor
```
Baris GAGAL → satu baris saran perbaikan per baris.
