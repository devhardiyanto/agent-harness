---
name: patterns
description: Persetujuan manusia atas usulan pola dari review (docs/work/<slug>/patterns-proposal.md). Hook menerapkan item yang disetujui ke patterns.md; agent tidak boleh.
argument-hint: "<slug> <P1,P3|all>"
disable-model-invocation: true
---
# /harness:patterns

Perintah ini diproses hook. Yang berubah: item yang disetujui diterapkan apa adanya ke `docs/knowledge/<svc>/patterns.md` (bagian "Pola disetujui" atau mengganti baris yang ditunjuk), status item menjadi `applied`. Persetujuan manusia adalah atestasi; `patterns.md` yang sudah `verified` tetap `verified`.

Tugasmu:
1. Tanpa `P…` di argumen: jalankan `node .claude/hooks/harness.mjs patterns-check <slug>` dan tampilkan item `proposed` (id, service, aksi, bukti). Minta user memilih: `/harness:patterns <slug> P1,P3` atau `all`.
2. Hook menolak → sampaikan alasannya (sitasi tidak valid, baris "Ganti:" tidak cocok, dll.), perbaiki usulan (hanya tulis `Status: proposed`), minta user mengulang.
3. Berhasil: satu baris konfirmasi. Lalu `lint-knowledge <svc>`; sitasi `@sha` akan di-ground ulang ke baseline pada `/harness:refresh` setelah PR ter-merge.
