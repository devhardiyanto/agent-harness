# Git dan akun

- G-01. Akun per repo service: `node .claude/hooks/harness.mjs git-auth which <svc>`. Sumbernya `harness.config.json` → `git.services.<svc>`, lalu `git.default_account`. Root memakai akun gh aktif.
- G-02. `git push/fetch/pull` di repo service: remote SSH dengan alias per akun (`git@github-work:org/repo.git`) sudah memakai kunci akun yang benar; remote HTTPS memakai credential helper lokal (`harness.mjs git-auth --apply`). `git-auth` menyebut "belum terpasang" → minta user menjalankannya; jangan ubah config git sendiri.
- G-03. Perintah `gh` untuk repo service selalu dengan token akunnya dan repo eksplisit, tanpa switch: `GH_TOKEN="$(gh auth token --user <akun>)" gh pr create -R <owner/repo> ...`. `<owner/repo>` dari `harness.mjs git-auth repo <svc>` (gh tidak mengenali alias SSH). Jangan `gh auth switch`, jangan mencetak token (guard memblokir `gh auth token` di luar `$(...)`).
- G-04. Kerja di branch kerja (`feat/…`, `fix/…`) dari base yang disepakati di topik. Tidak commit/push ke branch dilindungi, tidak force push, tidak merge PR.
- G-05. Commit kecil dengan pesan yang menjelaskan "mengapa". Tidak meng-commit `.env`, kredensial, atau berkas besar hasil build.
- G-06. GitLab atau host lain: belum didukung `git-auth`; ikuti kredensial yang sudah ada di repo itu dan sebutkan ke user.
- G-07. Commit, PR, dan komentar di repo service ditulis atas nama user: tanpa penanda AI (`Co-Authored-By: Claude`, "Generated with Claude Code", link sesi, emoji 🤖, nama model). Body PR = ringkasan perubahan, cara uji, risiko.
