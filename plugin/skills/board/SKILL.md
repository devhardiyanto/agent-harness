---
name: board
description: Membuat papan HTML lokal (lajur per service, status work item, kesegaran knowledge) dari snapshot project dan membukanya di browser.
disable-model-invocation: true
---
# /harness:board

Papan hanya memuat metadata snapshot (tanpa judul, teks AC, isi bukti, atau path kode). Jalankan:

```
node .claude/hooks/harness.mjs board --open
```

Keluaran: path berkas (`.claude/state/board.html`, di-gitignore), URL `file://`, dan jumlah work item/service. Gagal membuka browser → berikan URL-nya saja.

Balasan chat (maks 3 baris): path + jumlah item/service + "ulangi `/harness:board` setelah status berubah; berkas tidak ter-update sendiri".
