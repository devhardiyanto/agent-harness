---
name: init
description: Mulai memakai harness di root project baru: cek pemasangan, isi akun git per service, lalu bootstrap knowledge per service.
disable-model-invocation: true
---
# /harness:init

1. `node .claude/hooks/harness.mjs doctor`. Tampilkan tabelnya; GAGAL → sebutkan perbaikannya, berhenti.
2. Akun git: `harness.config.json` → `git.default_account` (dan `git.services` untuk pengecualian) belum diisi → tanya user akunnya, isi config, lalu `node .claude/hooks/harness.mjs git-auth --apply`.
3. Ada sisa 1.x (`docs/work`, `.harness`) → sarankan `/remap`.
4. Tampilkan daftar service dan sarankan `/bootstrap <service>` untuk yang belum punya `docs/knowledge/<svc>/summary.md`.

Balasan: tabel singkat status + satu langkah berikutnya.
