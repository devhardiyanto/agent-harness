# agent-harness — Harness untuk Claude Code

Sesi chat utama = **orkestrator**; tim agent (`backend`, `frontend`, `dba`, `devops`, `scout`, `runner`, `reviewer`) yang mengerjakan kode. Pekerjaan dicatat per **topik** di `docs/topics/YYYY-MM-DD/<slug>/`. Tanpa gerbang alur: hook hanya menjaga keamanan. Service dideteksi dari `source-code/<repo git>`.

## Pasang (repo privat, lewat `gh`)

Sekali: `gh auth login` lalu `gh auth setup-git` (agar Claude Code bisa mengambil plugin dari repo privat ini).

```bash
d=$(mktemp -d) && gh repo clone devhardiyanto/agent-harness "$d" -- --depth 1
cd /path/ke/project                       # root project (yang punya source-code/)
node "$d/install.mjs" --dry-run           # tinjau rencana: apa yang dibuang / dipertahankan / dipasang
node "$d/install.mjs"                     # interaktif; project existing: ketik "ganti"
# non-interaktif: node "$d/install.mjs" --yes
node "$d/install.mjs" --update           # perbarui harness yang sudah terpasang (lihat di bawah)
```
Opsi: `--branch NAMA` (default `harness-v1`), `--root-branch main`, `--project-name`, `--repo owner/repo`, `--allow-dirty`, `--no-commit`, `--ignore backup,tmp` (entri root yang diabaikan: masuk `.gitignore`, tidak disentuh, tidak di-commit; folder `backup/` dan `backups/` otomatis, matikan dengan `--no-auto-ignore`).

Yang dilakukan installer: cek prasyarat (tidak memasang apa pun) → deteksi mode & service → tag cadangan `harness-pre-v1-<waktu>` → branch `harness-v1` → buang harness lama → pasang kernel → commit **hanya path milik harness** (bukan `git add -A`: file/folder lain yang belum di-track tidak ikut ter-commit). Mundur kapan saja: `git switch -c lama harness-pre-v1-<waktu>`. Project tanpa git: salinan `.harness-backup-<waktu>/`.
Dipertahankan selalu: `source-code/`, `.mcp.json`, `.claude/settings.local.json`, semua isi `docs/` (termasuk `docs/discussion/`, `docs/work/`, `docs/knowledge/`, `docs/_map.md`, `docs/_archive/`), dan `scripts/` selain skrip harness lama. Pada root yang belum ber-harness v1, dokumen yang sudah ada tidak dibuang dan tidak ditimpa; yang diganti hanya perangkat harness lama (hook, rule, agent, skill, `AGENTS.md`, `CLAUDE.md`, config), dengan tag cadangan.

**Memperbarui:** `install.mjs --update` (tambah `--dry-run` untuk meninjau; dry-run juga memperingatkan bila ada perubahan tracked yang belum di-commit, karena pemasangan nyata berhenti di situ: commit dulu, atau `--allow-dirty` bila itu data yang dipertahankan). Hanya berkas milik harness yang diganti; berkas buatan user di `.claude/` (rule, agent) tidak dibuang. Berkas harness yang sudah usang dibuang berdasarkan `.claude/harness.manifest.json`. `harness.config.json` digabung: nilai user (`root_branch`, `protected_branches`, `checks`, `baseline`, dst.) menang atas bawaan, kunci baru dari kernel ditambahkan. `settings.json`: izin dan kunci lain milik user dibawa; hook kustom tidak dibawa dan dilaporkan. Versi sama → tidak ada perubahan (`--force` untuk memasang ulang); versi terpasang lebih baru dari installer → ditolak (`--force` untuk menurunkan). Config yang rusak menghentikan installer, tidak ditimpa. Cek hasilnya: `node .claude/hooks/harness.mjs doctor` (membandingkan `.claude/harness.version` dengan config).
Sisa modul yang sudah dibuang (`scripts/executor/`, `.agents/`, blok config `executor`) tidak disentuh: dilaporkan di rencana, tidak dipakai lagi, dan boleh kamu hapus sendiri.

Prasyarat: Node ≥ 18, git, Claude Code ≥ 2.1.295; `gh` (PR & cek merge).

## Alur pakai (2.0)

1. Buka `claude` di root, jelaskan tujuan sesi di pesan pertama. Agent membuat topik (`docs/topics/YYYY-MM-DD/<slug>/topic.md` + `plan.md`).
2. Diskusi dan analisa, sebatas yang kamu tanyakan. Temuan dan keputusan ditulis ke `topic.md`.
3. Bilang "kerjakan" / "gas": orkestrator membagi tugas ke agent spesialis; bukti ke `plan.md`.
4. "topik selesai": `summary.md`, rangkuman sesi `docs/sessions/YYYY-MM-DD/<slug>.md`, memori diperbarui. Lalu kamu ketik `/compact`.

| skill / perintah | guna |
|---|---|
| `topic` (otomatis) | buka, lanjutkan, tutup topik |
| `/summarize [catatan]` | rangkuman sesi kapan saja (mis. sebelum `/compact`) |
| `/remap` | rapikan `docs/` lama: < 2 bulan → `docs/topics`/`docs/sessions`, lebih lama → `docs/_legacy/` (+ `INDEX.md`); skrip hapus untuk `.harness/`, `.codex/`, dll. hanya dicetak |
| `/bootstrap <svc>` | knowledge service ke `docs/knowledge/<svc>/` |
| `/antislop*` | aturan kualitas UI/tulisan; hanya saat dipanggil |
| `node .claude/hooks/harness.mjs doctor` | cek pemasangan |
| `harness.mjs topic new|list|close|active` | dipakai skill `topic` |
| `harness.mjs remap [--apply]` | dipakai skill `remap` |
| `harness.mjs git-auth [--apply]`, `git-auth which|repo <svc>` | akun dan repo git per service |

## Akun git per service

`harness.config.json`:
```json
"git": { "host": "github.com", "default_account": "nawa9nest-dev", "services": { "<svc-pengecualian>": "devhardiyanto" } }
```
Remote SSH dengan alias per akun (`git@github-kantor:org/repo.git`): git sudah memakai kunci akun yang benar, tidak ada yang dipasang. Remote HTTPS: `node .claude/hooks/harness.mjs git-auth --apply` memasang credential helper lokal yang meminta token akun ke `gh` (`gh auth token --user <akun>`). Tanpa `gh auth switch`, token tidak ditulis ke berkas. Perintah `gh` di repo service: `GH_TOKEN="$(gh auth token --user <akun>)" gh pr create -R <owner/repo> ...` (`git-auth repo <svc>` mencetak `owner/repo`) (aturan `.claude/rules/git.md`). Syarat: akun sudah `gh auth login`. GitLab belum didukung.

## Yang dijaga hook (guard)

Satu hook `PreToolUse` (`.claude/hooks/guard.mjs`): baca/tulis `.env` dan kunci privat, cetak env/token, `reset --hard`/`clean -f`/`branch -D`, `rm -rf` luas, `curl | sh`, `--no-verify`, force push, push ke branch dilindungi, commit di branch dilindungi pada repo service (root boleh commit `docs/` di `main`), dan `deny_commands` di config. Tidak ada hook Stop/UserPromptSubmit/SessionStart.

## Upgrade dari 1.x

`harness-update` seperti biasa. Hook alur, skill `/harness:*` lama, dan kunci config 1.x dibuang otomatis; data di `docs/` tidak disentuh. Setelah itu: isi `git` di config → `git-auth --apply` → `/remap` (tinjau, lalu commit sendiri). Rollback: `harness-update.mjs <root> --rollback`.

## Memperbarui semua project
Ada dua jalur, dan keduanya berasal dari repo-mu sendiri: **kernel** (hook, config, rules) ditulis `install.mjs --update` ke tiap project, **plugin** (skill) dipasang **global** (scope user, satu kali per mesin) dari marketplace `harness-marketplace` (repo GitHub installer) dan hanya berganti bila `version` di `plugin/.claude-plugin/plugin.json` naik (naikkan tiap rilis; `scripts/bump.mjs`). Installer tidak lagi mendaftarkan plugin di `.claude/settings.json` project.

```
alias harness-update-all='node ~/agent-harness/scripts/update-all.mjs'   # ~/.bashrc
harness-update-all --setup-plugin     # sekali per mesin: pasang plugin global (claude plugin install harness --marketplace <repo> --scope user)
harness-update-all --scan /d/dev      # sekali: daftarkan project yang sudah ber-harness
harness-update-all --list             # project + versi terpasang
harness-update-all --dry-run          # rencana installer saja
harness-update-all                    # git pull installer → plugin global (marketplace update + plugin update --scope user) → tiap project: install --update
harness-update-all --cleanup-project  # sekaligus hapus pemasangan plugin tingkat project lama setelah kernelnya diperbarui
```
**Alur 1.7+ (disarankan, tanpa branch tambahan):** `update-all.mjs` hanya dipakai untuk `--setup-plugin`, `--scan`, `--list`, `--add`, `--remove`. Untuk memperbarui project, pakai `harness-update.mjs`: pindah ke `main` bila bersih, `pull --ff-only`, update di tempat, satu commit lokal `chore(harness): update to vX.Y.Z`, doctor, tanpa push (kecuali `update.autoPush` atau `--push`).

```
node ~/agent-harness/scripts/harness-update.mjs /d/dev/yhpa --dry-run   # rencana satu root
node ~/agent-harness/scripts/harness-update.mjs /d/dev/yhpa             # update (lokal, belum di-push)
node ~/agent-harness/scripts/harness-update.mjs --all --dry-run         # semua project terdaftar
node ~/agent-harness/scripts/harness-update.mjs /d/dev/yhpa --rollback  # git revert update terakhir
```

Project terdaftar otomatis di `~/.harness/projects.json` saat `install.mjs` berhasil; `--add`/`--remove` mengatur manual. Alur lama `update-all.mjs` (tanpa `--list`/`--scan`/dst.) memperbarui tiap project di branch `harness-update` (satu commit): review lalu merge sendiri. Root multi-repo tidak boleh punya branch tambahan, jadi alur lama tidak cocok untuknya. Pohon kotor atau versi lebih baru dari installer ditolak dan dilaporkan; exit 1 bila ada yang gagal. Opsi: `--no-pull`, `--no-plugin`, `--force`. Plugin baru termuat di sesi berikutnya (atau `/reload-plugins`). Migrasi dari pemasangan per project: update kernel membuang `enabledPlugins`/`extraKnownMarketplaces` milik harness dari settings project; `--cleanup-project` menghapus entri project di Claude Code. Belum teruji di mesin nyata: perilaku bila plugin yang sama sempat aktif di dua scope (lihat PILOT bagian 8).

## Rilis (pemelihara)
`node scripts/bump.mjs patch|minor|major|X.Y.Z` menaikkan versi di kelima tempat (`VERSION`, `package.json`, `plugin.json`, config kernel, `lib.mjs`) dan menjalankan `check-repo`; lalu commit, PR, dan setelah merge beri tag `v<versi>` pada commit merge. Naikkan versi untuk tiap perubahan kernel/plugin/installer yang harus sampai ke project: plugin hanya berganti bila `version` berubah, dan `--update` menolak memasang ulang versi yang sama.

## Pengujian

`npm test` (installer di project contoh, update dari versi lama, sandbox, topik, remap, guard, akun git). `node scripts/check-repo.mjs` (konsistensi repo). CI menjalankan keduanya di Linux dan Windows.

## Belum teruji

- Credential helper `git-auth` di Windows (Git for Windows menjalankan helper lewat `sh`; diuji otomatis di Linux).
- Remap pada root nyata (astra, event, yhpa): jalankan tanpa `--apply` dulu dan tinjau tabelnya.

Lisensi: MIT. Atribusi: lihat `THIRD_PARTY.md`.
