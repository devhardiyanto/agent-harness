---
title: {{title}}
type: {{type}}
bentuk: tunggal
status: draft
bidang: []
services: []
align: open
align_rounds: 0
created: {{date}}
updated: {{date}}
test_command: null
pr: null
---
# {{title}}

## 1. Objective
<!-- satu kalimat: hasil yang diinginkan user, bukan cara. -->

## 2. Penjelasan
<!-- maks 8 baris: apa yang diubah dan di mana (path), sekilas. -->

## 3. Dampak & konfirmasi
| service | yang berubah | risiko |
|---|---|---|

### Klaim vs bukti kode
| # | klaim | bukti path:baris | status |
|---|---|---|---|
<!-- status: terverifikasi | dugaan | bertentangan -->

### Keputusan terbuka
| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |
|---|---|---|---|

<!-- Ditutup user: "align ok {{slug}}" (hook menulis align: aligned), lalu "setuju {{slug}}". -->

## 4. Eksekusi
<!-- AC bernomor, ditulis setelah aligned: - AC1: ... (yang bisa dibuktikan) -->

### Rencana eksekusi
| # | tugas | AC | agent | urutan | status |
|---|---|---|---|---|---|
<!-- diisi orkestrator saat "kerjakan", sebelum kode diedit: satu baris per tugas (T1, T2, ...). agent = spesialis service (backend/frontend/devops/dba/implementer) lalu runner, reviewer. urutan sama = paralel. status: rencana | jalan | selesai | gagal -->

### Bukti
<!-- satu baris per AC: - AC1: output nyata / langkah + hasil -->

### Tinjauan
verdict: pending
<!-- temuan reviewer; blocker: - [ ] [BLOCKER] ... -->

### Decision log
-

### Status terkini
-
