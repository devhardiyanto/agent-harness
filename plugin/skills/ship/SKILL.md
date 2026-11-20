---
name: ship
description: Kirim work item berstatus done — commit, push, buka PR (mendukung PR bertumpuk), merge saat check hijau, ringkasan. Agent memanggilnya HANYA bila konteks memuat "[harness] ... meminta SHIP <slug>" dari hook (ketikan user "push PR + merge", "kirim <slug>", atau /harness:ship).
argument-hint: "<slug>"
user-invocable: false
---
# /harness:ship

Masukan: `$ARGUMENTS` (slug). Agent tidak pernah menjalankan `gh pr merge`. Merge terjadi hanya lewat `harness.mjs ship`, dan itu butuh tiket dari ketikan manusia.

## Fase A — status `done`, `pr:` kosong
1. `node .claude/hooks/harness.mjs ship-plan <slug>`: tabel repo (`owner/repo`), branch kerja, base, akun gh, masalah. Selalu beri `-R <repo>` pada `gh`: remote beralias SSH (`git@alias:owner/repo`) tidak dikenali gh tanpa itu. Ada masalah (di branch utama, akun gh tanpa akses, dst.) → laporkan persis dan berhenti; jangan memutar. Akun salah → user menjalankan `gh auth switch --user <akun>`.
2. Baca `docs/work/<slug>/gate.md`: `verdict` harus `pass`; baris `TIDAK DIPERIKSA` dicantumkan apa adanya di body PR. Kode yang di-commit tidak membuat gate usang; kode yang berubah setelah gate, ya (jalankan `harness.mjs gate <slug>` lagi).
3. Tiap service: `git -C source-code/<svc> status --short`; commit hanya perubahan terkait (pesan ringkas, rujuk slug). Nama branch `<feat|fix|chore>/<slug-pendek>`.
4. `git -C source-code/<svc> push -u origin <branch>`.
5. `gh pr create -R <repo dari ship-plan> --base <base dari ship-plan> --head <branch> --title "<judul>" --body-file <file sementara>`. Body = tabel: ringkasan, AC + bukti (dari `progress.md`), risiko, rollback, dependency baru, `TIDAK DIPERIKSA` dari gate, tautan work item. Satu PR per service. Base yang bukan branch utama = PR bertumpuk: sebut urutan merge di body.
6. Tulis `pr: [url1, url2]` ke frontmatter `plan.md` (Edit biasa).
7. Menunggu CI: `Monitor` dengan `gh pr checks <url> --watch` (satu per PR). Begitu semua selesai, kirim `PushNotification` ("check PR <slug>: hijau/merah") agar user tahu tanpa memantau sesi.
8. Bila konteks hook menyebut izin merge tercatat (`ship.merge_on_request`, bawaan): semua check hijau → `node .claude/hooks/harness.mjs ship <slug>` (kode menerbitkan tiket dari izin itu dan memeriksa ulang gate, check, akses, SHA), lalu skill `summarize <slug>` dan tampilkan `docs/work/<slug>/summary.md`. Check merah → laporkan; jangan memperbaiki di item `done` (perlu `reopen`).

## Fase B — `pr:` terisi
User mengetik "push PR + merge <slug>" lagi setelah check hijau. Hook memeriksa gate, check tiap PR (merah atau berjalan = ditolak), draft, dan akun gh, lalu menerbitkan tiket. Bila konteksmu memuat "memutuskan MERGE":
1. `node .claude/hooks/harness.mjs ship <slug>`: merge berurutan (PR yang basenya bukan PR lain lebih dulu; PR bertumpuk diarahkan ke base induknya setelah induk masuk), lalu `merged`.
2. Ditolak → sampaikan alasannya; jangan memaksa, jangan merge manual. Sebagian sudah merged → user mengetik "push PR + merge <slug>" lagi untuk sisanya.
3. Setelah status `merged` (semua PR masuk), jalankan skill `summarize <slug>` supaya sesi bisa dilanjutkan tanpa kehilangan konteks.
4. Tanpa pesan "memutuskan MERGE" di konteksmu, hook menolak sendiri (alasan sudah tampil ke user): jangan mengulang, jangan mencari jalan lain.

## Balasan chat (ringkas, persona R-13)
Fase A: URL PR (satu per baris) · urutan merge · status check · (izin tercatat) hasil merge + path ringkasan, atau (tanpa izin) "ketik `kirim <slug>` setelah hijau".
Fase B: hasil tiap PR · status akhir · path ringkasan sesi.
