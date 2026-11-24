# Git dan akun

- G-01. Akun per repo service: `node .claude/hooks/harness.mjs git-auth which <svc>`. Sumbernya `harness.config.json` → `git.services.<svc>`, lalu `git.default_account`. Root memakai akun gh aktif.
- G-02. `git push/fetch/pull` di repo service memakai credential helper lokal repo itu (dipasang `harness.mjs git-auth --apply`). Bila `git-auth` menyebut "belum terpasang", minta user menjalankannya; jangan ubah config git sendiri.
- G-03. Perintah `gh` untuk repo service selalu dengan token akunnya, tanpa switch: `GH_TOKEN="$(gh auth token --user <akun>)" gh pr create -R <owner/repo> ...`. Jangan `gh auth switch`, jangan mencetak token (guard memblokir `gh auth token` di luar `$(...)`).
- G-04. Kerja di branch kerja (`feat/…`, `fix/…`) dari base yang disepakati di topik. Tidak commit/push ke branch dilindungi, tidak force push, tidak merge PR.
- G-05. Commit kecil dengan pesan yang menjelaskan "mengapa". Tidak meng-commit `.env`, kredensial, atau berkas besar hasil build.
- G-06. GitLab atau host lain: belum didukung `git-auth`; ikuti kredensial yang sudah ada di repo itu dan sebutkan ke user.
