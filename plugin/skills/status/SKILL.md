---
name: status
description: Tabel work item dan status instalasi (doctor). Dengan argumen "board": papan HTML lokal per service dan kesegaran knowledge.
argument-hint: "[board]"
disable-model-invocation: true
---
# /harness:status

Tanpa argumen, jalankan dan tampilkan keluarannya apa adanya (tabel), tanpa komentar tambahan kecuali ada baris GAGAL:

```
node .claude/hooks/harness.mjs list
node .claude/hooks/harness.mjs doctor
```
Baris GAGAL → satu baris saran perbaikan per baris.

## `board`
Papan hanya memuat metadata snapshot (tanpa judul, teks AC, isi bukti, atau path kode):

```
node .claude/hooks/harness.mjs board --open
```
Keluaran: path berkas (`.claude/state/board.html`, di-gitignore), URL `file://`, jumlah item/service. Gagal membuka browser → berikan URL-nya saja. Berkas tidak ter-update sendiri; ulangi perintah setelah status berubah. Balasan maks 3 baris.
