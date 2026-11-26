# agent-harness

Harness untuk Claude Code di root project multi-repo (`source-code/<repo git>`). Versi **2.1.0**.

## Daftar isi

1. [Ringkasan](#1-ringkasan)
2. [Prasyarat](#2-prasyarat)
3. [Pemasangan](#3-pemasangan)
4. [Pengaturan awal](#4-pengaturan-awal)
5. [Alur kerja harian](#5-alur-kerja-harian)
6. [Tim agent](#6-tim-agent)
7. [Memori dan belajar](#7-memori-dan-belajar)
8. [Knowledge service](#8-knowledge-service)
9. [Status line](#9-status-line)
10. [Akun git per service](#10-akun-git-per-service)
11. [Guard keamanan](#11-guard-keamanan)
12. [Remap dan migrasi dari 1.x](#12-remap-dan-migrasi-dari-1x)
13. [Memperbarui harness](#13-memperbarui-harness)
14. [Referensi](#14-referensi)
15. [Pemecahan masalah](#15-pemecahan-masalah)
16. [Pengembangan harness](#16-pengembangan-harness)

---

## 1. Ringkasan

| konsep | arti |
|---|---|
| orkestrator | sesi chat utama: memahami tujuan, diskusi, merencanakan, mendelegasikan. Tidak mengedit kode di `source-code/` |
| tim agent | spesialis yang mengedit kode (`nikola-be`, `hana-fe`, `freya-dba`, `kofi-ops`), membaca (`scout`), menjalankan test (`runner`), menilai diff (`lucia-rv`) |
| topik | satu pekerjaan = satu folder `docs/topics/YYYY-MM-DD/<slug>/` |
| memori | fakta awet project dan profil user, dimuat otomatis tiap sesi |
| knowledge | ringkasan tiap service di `docs/knowledge/<svc>/`, dicek kesegarannya |
| guard | satu hook `PreToolUse` yang hanya menjaga keamanan, tanpa gerbang alur |

---

## 2. Prasyarat

| alat | catatan |
|---|---|
| Node ≥ 18 | hook dan CLI tanpa dependency |
| git | root project dan tiap service |
| Claude Code ≥ 2.1.295 | |
| `gh` | clone repo privat ini, PR, token akun per service |

Sekali per mesin: `gh auth login`, lalu `gh auth setup-git`.

---

## 3. Pemasangan

### 3.1 Project baru atau project lama

```bash
d=$(mktemp -d) && gh repo clone devhardiyanto/agent-harness "$d" -- --depth 1
```
```bash
cd /path/ke/root-project
```
```bash
node "$d/install.mjs" --dry-run
```
```bash
node "$d/install.mjs"
```

`--dry-run` menampilkan rencana (dibuang / dipertahankan / dipasang). Mode interaktif pada project existing meminta kamu mengetik `ganti`; `--yes` untuk non-interaktif.

### 3.2 Opsi installer

| opsi | guna |
|---|---|
| `--branch NAMA` | branch pemasangan (default `harness-v1`) |
| `--root-branch main` | branch root |
| `--project-name`, `--repo owner/repo` | identitas project |
| `--allow-dirty` | izinkan pohon kerja kotor |
| `--no-commit` | tanpa commit |
| `--ignore backup,tmp` | entri root yang diabaikan (masuk `.gitignore`); `backup/`, `backups/` otomatis, matikan dengan `--no-auto-ignore` |
| `--update` | perbarui harness terpasang (bagian 13) |
| `--force` | pasang ulang versi sama / turunkan versi |

### 3.3 Yang dilakukan installer

1. Cek prasyarat (tidak memasang apa pun).
2. Deteksi service dari `source-code/`.
3. Tag cadangan `harness-pre-v1-<waktu>` (tanpa git: `.harness-backup-<waktu>/`).
4. Pasang kernel, commit **hanya path milik harness**.
5. Daftarkan project di `~/.harness/projects.json`, buat `~/.harness/USER.md` bila belum ada.

Selalu dipertahankan: `source-code/`, `.mcp.json`, `.claude/settings.local.json`, seluruh `docs/`.
Mundur: `git switch -c lama harness-pre-v1-<waktu>`.

### 3.4 Plugin harness (global)

Skill `/harness:init` dan `/harness:update` dipasang sekali per mesin, scope user:

```bash
node ~/agent-harness/scripts/update-all.mjs --setup-plugin
```

---

## 4. Pengaturan awal

### 4.1 Cek pemasangan

Di sesi claude: `/harness:init` (menjalankan `doctor`, menanyakan akun git bila kosong). Atau langsung:

```bash
node .claude/hooks/harness.mjs doctor
```

### 4.2 `harness.config.json`

| kunci | bawaan | arti |
|---|---|---|
| `project` | `""` | nama project |
| `root_branch` | `main` | branch root (`docs/` di-commit di sini) |
| `layout`, `services_dir` | `multi-repo`, `source-code` | tempat repo service |
| `services` | `[]` | daftar service (terisi saat pasang) |
| `protected_branches` | `main`, `master`, `develop`, `production`, `staging`, `release/*` | tidak boleh commit/push langsung di repo service |
| `git` | `host`, `default_account`, `services` | akun per service (bagian 10) |
| `remap.legacy_months` | `2` | batas umur data sebelum ke `_legacy` |
| `tui` | `statusline: true`, `theme: kapsul`, `max_width: 120` | status line |
| `knowledge_check.stale_commits` | `30` | knowledge dianggap usang setelah N commit baseline |
| `learn` | `memory_chars: 3000`, `user_chars: 1500`, `skill_unused_days: 60` | batas memori dan skill |
| `update.autoPush` | `false` | push otomatis setelah update |
| `deny_commands` | daftar regex | perintah yang selalu diblokir (mis. `gh pr merge`, `npm publish`) |

### 4.3 Plugin pendamping (opsional, global)

| plugin | pasang | dipakai harness |
|---|---|---|
| ponytail | `claude plugin marketplace add DietrichGebert/ponytail` lalu `claude plugin install ponytail@ponytail --scope user` | badge `ponytail:<mode>` di status line; `/ponytail-review` sebelum `lucia-rv` (T-07) |
| hallmark | `claude plugin marketplace add nutlope/hallmark` lalu `claude plugin install hallmark@hallmark --scope user` | `hana-fe` untuk halaman baru/redesign (T-08): `sloplint` tanpa `--render`, cek visual lewat Claude in Chrome |

Harness tidak memasang atau memperbarui plugin ini.

---

## 5. Alur kerja harian

### 5.1 Buka sesi dengan tujuan

Jalankan `claude` di root, tulis tujuan di pesan pertama. Contoh: *"analisa promo checkout di event-backend, kenapa diskon dobel"*.
Agent membuat `docs/topics/<hari ini>/<slug>/` berisi `topic.md` dan `plan.md`. Nama topik tampil di status line.

### 5.2 Diskusi

Agent menganalisa sebatas yang ditanya. Temuan (fakta dengan `path:baris`, atau dugaan) dan keputusan dicatat di `topic.md`. Pertanyaan keputusan berbentuk tabel, rekomendasi di urutan pertama.

### 5.3 Rencana

Tugas ditulis ke `plan.md`: tugas · service · agent · status. Sebelum menyentuh service, agent mengecek knowledge-nya (bagian 8).

### 5.4 Eksekusi

Eksekusi dimulai hanya setelah kamu bilang jelas: **"kerjakan"**, **"gas"**, atau **"lanjut eksekusi"**.
Orkestrator membagi tugas ke agent spesialis (paralel bila berkasnya tidak bertabrakan, migrasi selalu lebih dulu). Bukti (perintah, hasil test, link PR) masuk `## Aksi dan bukti` di `plan.md`. Sebelum review: `/ponytail-review` (bila terpasang), lalu `lucia-rv`.

### 5.5 Tutup topik

Bilang **"topik selesai"**. Agent menulis:

| berkas | isi |
|---|---|
| `summary.md` | hasil topik, frontmatter `koreksi: N` |
| `docs/sessions/<hari ini>/<slug>.md` | rangkuman sesi |
| `docs/memory/INDEX.md` | satu baris topik selesai |
| `docs/knowledge/<svc>/summary.md` | catatan `## Menunggu merge` untuk perubahan yang belum merged |
| memori / skill | lewat skill `belajar` |

Balasan terakhir "siap /compact", lalu kamu ketik `/compact`.

### 5.6 Rangkum tanpa menutup

`/summarize [catatan]` kapan saja (mis. konteks hampir penuh), lalu `/compact`. Topik tetap terbuka.

### 5.7 Lanjutkan pekerjaan lama

Cukup kalimat biasa: *"lanjut topik promo checkout"*. Agent menjalankan `topic find promo checkout`, memilih yang cocok, lalu `topic use <tanggal/slug>` (topik tertutup dibuka lagi). Topik di `_legacy` dirujuk dengan topik baru `--ref`.

### 5.8 Struktur `docs/`

```
docs/
├── topics/YYYY-MM-DD/<slug>/   topic.md · plan.md · summary.md · lampiran/
├── sessions/YYYY-MM-DD/<slug>.md
├── memory/MEMORY.md · INDEX.md
├── knowledge/<svc>/summary.md · patterns.md
├── _map.md                     peta service dan relasinya
└── _legacy/                    data lama hasil remap + INDEX.md
```

`docs/` di root kamu commit sendiri di `main`.

---

## 6. Tim agent

| agent | peran | model | sebut dengan |
|---|---|---|---|
| `nikola-be` | backend: API, service, logika bisnis | sonnet | "be", "backend", "Nikola" |
| `hana-fe` | frontend: halaman, komponen, aksesibilitas | sonnet | "fe", "frontend", "Hana" |
| `freya-dba` | skema, migrasi, query berat (satu-satunya yang menyentuh migrasi) | sonnet | "dba", "database", "Freya" |
| `kofi-ops` | CI/CD, deploy, konfigurasi, container | sonnet | "ops", "devops", "Kofi" |
| `lucia-rv` | review diff read-only | opus | "review", "Lucia" |
| `scout` | cari/baca kode cepat | haiku | otomatis |
| `runner` | jalankan test/lint/build | haiku | otomatis |

Contoh: *"suruh be perbaiki validasi kupon"* → `nikola-be`.

---

## 7. Memori dan belajar

### 7.1 Dua memori

| berkas | lingkup | batas | dimuat |
|---|---|---|---|
| `docs/memory/MEMORY.md` | project (konvensi, jebakan, keputusan) | `learn.memory_chars` 3000 | tiap sesi lewat `CLAUDE.md` |
| `~/.harness/USER.md` | pribadi, semua project (gaya, preferensi) | `learn.user_chars` 1500 | tiap sesi lewat `CLAUDE.md` |

Cek yang termuat: `/memory` di sesi claude.

### 7.2 Skill `belajar`

Agent menjalankan `belajar` sendiri saat:
- kamu mengoreksi cara kerja, gaya, atau fakta (di giliran itu juga);
- topik ditutup;
- sebelum `/compact` atau `/summarize`.

Yang disimpan hanya yang ada buktinya di percakapan. Bisa juga dipanggil manual: `/belajar`.

### 7.3 Skill hasil belajar

Cara kerja berulang jadi `.claude/skills/<nama>/SKILL.md` dengan frontmatter `asal: belajar` dan `dibuat`. Claude Code memuatnya otomatis menurut deskripsi. Skill milik harness tidak boleh diubah agent (dijaga guard lewat `.claude/harness.manifest.json`).

### 7.4 Laporan growth

```bash
node .claude/hooks/harness.mjs growth
```

Isi: ukuran memori, skill hasil belajar beserta pemakaian terakhir, status knowledge, koreksi per topik. Skill tidak dipakai > 60 hari disarankan diarsip:

```bash
node .claude/hooks/harness.mjs growth --arsip <skill>
```

Arsip dipindah ke `docs/_legacy/_lama/skills/<skill>` (tidak dihapus).

---

## 8. Knowledge service

### 8.1 Cek status

```bash
node .claude/hooks/harness.mjs knowledge [svc]
```

| status | arti | tindakan agent |
|---|---|---|
| belum ada | `docs/knowledge/<svc>/summary.md` tidak ada | bootstrap ringkas dulu |
| segar | baseline maju < `stale_commits` sejak `source_commit` | pakai |
| usang | baseline maju ≥ `stale_commits` | sebut di jawaban, segarkan bagian yang dipakai |

Baseline = branch deploy service (`production`, lalu `main`/`master`, atau `origin/HEAD`).

### 8.2 Bootstrap

| mode | kapan | hasil |
|---|---|---|
| ringkas | otomatis saat topik pertama menyentuh service tanpa knowledge | `summary.md` ≤ 40 baris |
| lengkap | kamu minta: `/bootstrap <svc>` | `summary.md` ≤ 80 baris, `patterns.md`, baris di `docs/_map.md` |
| konfirmasi merge | catatan "menunggu merge" sudah merged | fakta dipindah, baris dihapus |

### 8.3 Catatan "menunggu merge"

Saat topik ditutup, perubahan yang belum merged dicatat di `summary.md` service:

```
## Menunggu merge
- 2026-11-26 · promo-checkout · fix/promo-dobel@a1b2c3d · validasi kupon dipindah ke service
```

`harness.mjs knowledge` memeriksa tiap baris dengan `git merge-base --is-ancestor`; yang sudah merged dipindah ke fakta oleh skill `bootstrap`.

---

## 9. Status line

```
▐event▌ ▐promo-checkout▌ event-backend* event-web? · Opus 5.5 · medium ponytail:full
▐konteks 72%▌ 144k/200k 5j 61% · 7h 30% +310 −88
```

| bagian | sumber |
|---|---|
| nama root | `harness.config.json` → `project` / nama folder |
| topik sesi | dibaca dari transcript sesi ini (bukan topik terakhir di disk) |
| service | service yang disentuh topik; `?` knowledge belum ada, `*` usang |
| model · effort | Claude Code |
| `ponytail:<mode>` | `~/.claude/.ponytail-active`, bila plugin terpasang |
| konteks, 5j, 7h | respons API terakhir (`/context` bisa sedikit lebih tinggi) |
| `+N −M` | baris berubah; hanya bila sesi punya topik |

Tema (`tui.theme`): `kapsul` (bawaan), `tenang`, `kontras`, `mono` (otomatis bila `NO_COLOR`). Tiap jalan dicatat di `.claude/state/statusline.log`.

---

## 10. Akun git per service

### 10.1 Konfigurasi

```json
"git": { "host": "github.com", "default_account": "nawa9nest-dev", "services": { "<svc-pengecualian>": "devhardiyanto" } }
```

Root memakai akun `gh` aktif. Konfigurasi ini hanya untuk repo di `source-code/`.

### 10.2 Pasang

```bash
node .claude/hooks/harness.mjs git-auth
```
```bash
node .claude/hooks/harness.mjs git-auth --apply
```

| remote | hasil |
|---|---|
| SSH beralias (`git@github-kantor:org/repo.git`) | `SSH <alias>: helper tidak perlu`; kunci SSH sudah memilih akun |
| HTTPS | credential helper lokal yang meminta `gh auth token --user <akun>`; token tidak ditulis ke berkas |
| GitLab / host lain | belum didukung |

### 10.3 Perintah `gh` di repo service

```bash
GH_TOKEN="$(gh auth token --user <akun>)" gh pr create -R <owner/repo> ...
```

`git-auth which <svc>` mencetak akun, `git-auth repo <svc>` mencetak `owner/repo`. Jangan `gh auth switch` dan jangan logout akun.

### 10.4 Commit dan PR atas nama kamu

Commit, PR, dan komentar di repo service tanpa penanda AI (aturan G-07). Body PR: ringkasan perubahan, cara uji, risiko. Merge PR selalu kamu yang melakukan.

---

## 11. Guard keamanan

Satu hook `PreToolUse` (`.claude/hooks/guard.mjs`) memblokir:

| kelompok | contoh |
|---|---|
| secret | baca/tulis `.env`, kunci privat, `credentials`; cetak env/token (kecuali di dalam `$(...)` atau ke `/dev/null`) |
| git destruktif | `reset --hard`, `clean -f`, `branch -D`, force push, `--no-verify` |
| branch dilindungi | push ke branch dilindungi; commit di branch dilindungi pada repo service (root boleh commit `docs/` di `main`) |
| shell berbahaya | `rm -rf` luas, `curl … \| sh` |
| `deny_commands` | `gh pr merge`, `npm publish`, `terraform apply`, `DROP TABLE`, dst. |
| memori dan skill | melebihi batas karakter, pola injeksi/secret di `MEMORY.md`, `USER.md`, `.claude/skills/**`; mengubah skill milik harness |

Tidak ada hook Stop, UserPromptSubmit, atau SessionStart.

---

## 12. Remap dan migrasi dari 1.x

### 12.1 Remap `docs/` lama

Di sesi claude: `/remap`. Agent menampilkan rencana dulu:

| data | tujuan |
|---|---|
| < `legacy_months` (2 bulan, menurut tanggal di nama) | `docs/topics/` atau `docs/sessions/` |
| lebih lama | `docs/_legacy/` + `INDEX.md` |
| `.harness/`, `.codex/`, `.agents/` | hanya dicetak skrip hapusnya; kamu yang menjalankan |

Setelah setuju, agent menjalankan `remap --apply`. Commit hasilnya sendiri di `main`.

### 12.2 Upgrade dari 1.x

1. Update seperti biasa (bagian 13). Hook alur, skill `/harness:*` lama, dan kunci config 1.x dibuang otomatis; `docs/` tidak disentuh.
2. Isi `git` di `harness.config.json` lalu `git-auth --apply`.
3. `/remap`, tinjau, commit.

---

## 13. Memperbarui harness

### 13.1 Satu atau semua project (disarankan)

```bash
node ~/agent-harness/scripts/harness-update.mjs /d/dev/event --dry-run
```
```bash
node ~/agent-harness/scripts/harness-update.mjs /d/dev/event
```
```bash
node ~/agent-harness/scripts/harness-update.mjs --all
```
```bash
node ~/agent-harness/scripts/harness-update.mjs /d/dev/event --rollback
```

Alurnya: pindah ke `main` bila bersih → `pull --ff-only` → update di tempat → satu commit lokal `chore(harness): update to vX.Y.Z` → `doctor`. Tidak di-push kecuali `update.autoPush` atau `--push`. Dari dalam sesi claude: `/harness:update`.

### 13.2 Aturan update

- Hanya berkas milik harness yang diganti; rule/agent buatan kamu di `.claude/` dibiarkan.
- Berkas harness usang dibuang menurut `.claude/harness.manifest.json`.
- `harness.config.json` digabung: nilai kamu menang, kunci baru ditambahkan, kunci 1.x dibuang.
- `settings.json`: izin dan kunci milik kamu dibawa; hook kustom dilaporkan, tidak dibawa.
- Versi sama → tidak berubah; versi terpasang lebih baru → ditolak (`--force` untuk keduanya).
- Pohon kotor → berhenti; commit dulu atau `--allow-dirty`.

### 13.3 Daftar project

```bash
node ~/agent-harness/scripts/update-all.mjs --list
```

`--scan /d/dev` mendaftarkan project yang sudah ber-harness; `--add` / `--remove` mengatur manual. Plugin global baru termuat di sesi berikutnya (atau `/reload-plugins`).

---

## 14. Referensi

### 14.1 CLI `node .claude/hooks/harness.mjs`

| perintah | guna |
|---|---|
| `doctor` | cek pemasangan, versi, knowledge, sisa 1.x |
| `topic new "<judul>" [--ref <topik>]` | buat topik |
| `topic list [--open]` | daftar topik |
| `topic find <kata>` | cari di topik, sesi, dan `_legacy` |
| `topic use <tanggal/slug>` | jadikan aktif (buka lagi bila tertutup) |
| `topic close <tanggal/slug>` | tutup (butuh `summary.md`) |
| `topic active` | topik aktif |
| `remap [--apply] [--json]` | rencana / terapkan remap |
| `git-auth [--apply]` | status / pasang akun git per service |
| `git-auth which <svc>`, `git-auth repo <svc>` | akun dan `owner/repo` service |
| `knowledge [svc]` | status knowledge dan catatan menunggu merge |
| `growth [--arsip <skill>]` | laporan memori, skill, knowledge; arsip skill |
| `update [--all] [--rollback] [--dry-run] [--push]` | jalankan updater |

### 14.2 Skill

| skill | dipanggil | guna |
|---|---|---|
| `topic` | otomatis | buka, lanjutkan, tutup topik |
| `/summarize [catatan]` | kamu / otomatis saat tutup | rangkuman sesi ke `docs/sessions/` |
| `/belajar` | otomatis / kamu | simpan memori dan skill |
| `/bootstrap <svc>` | kamu / otomatis (ringkas) | knowledge service |
| `/remap` | kamu | rapikan `docs/` lama |
| `/antislop*` | hanya kamu | aturan kualitas UI dan tulisan |
| `/harness:init` | kamu | cek pemasangan dan akun git |
| `/harness:update` | kamu | perbarui harness |

### 14.3 Aturan (`.claude/rules/`)

| berkas | ID | isi |
|---|---|---|
| `output.md` | O-01..O-07 | jawaban langsung, ringkas, objektif, sebatas yang ditanya |
| `orkestrator.md` | T-01..T-09 | delegasi ke agent, bukti, review |
| `git.md` | G-01..G-07 | akun per service, branch kerja, tanpa penanda AI |
| `security.md` | S-01..S-06 | data, secret, dependency, tindakan berisiko |
| `minimalis.md` | M-01..M-07 | ambil solusi terkecil |
| `knowledge.md` | K-01..K-04 | format knowledge service |
| `belajar.md` | B-01..B-05 | memori, belajar, cek knowledge |

### 14.4 Berkas harness di root

| path | isi |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | aturan kerja; `CLAUDE.md` meng-import memori |
| `harness.config.json` | konfigurasi |
| `.claude/hooks/` | `guard.mjs`, `statusline.mjs`, `harness.mjs` + modul |
| `.claude/agents/`, `.claude/skills/`, `.claude/rules/` | tim, skill, aturan |
| `.claude/state/` | cache status line, knowledge, pemakaian skill, log (tidak di-commit) |
| `.claude/harness.version`, `.claude/harness.manifest.json` | versi dan daftar berkas milik harness |

---

## 15. Pemecahan masalah

| gejala | langkah |
|---|---|
| status line hilang | kirim isi `cat .claude/state/statusline.log`; dugaan: Claude Code menyembunyikan baris saat notifikasi/recap |
| `gh` di sesi claude 401 padahal di terminal normal | tutup dan buka ulang Claude Code; jangan logout akun |
| `git-auth` "belum terpasang" | `git-auth --apply` |
| `git-auth` "remote bukan github.com" | host lain belum didukung; pakai kredensial yang ada |
| `doctor` GAGAL | ikuti perbaikan di kolom keterangan, lalu jalankan lagi |
| USER.md tidak termuat | cek `/memory`; pastikan `~/.harness/USER.md` ada |
| update ditolak "pohon kotor" | commit dulu atau `--allow-dirty` |
| perintah diblokir guard | baca alasan `[harness] DIBLOKIR: …`; tindakan berisiko dilakukan sendiri |

### Belum teruji

- Credential helper `git-auth` HTTPS di Windows (diuji otomatis di Linux).
- Import `@~/.harness/USER.md` di Windows.

---

## 16. Pengembangan harness

| perintah | guna |
|---|---|
| `npm test` | installer, update, topik, remap, guard, akun git, knowledge, growth |
| `node scripts/check-repo.mjs` | konsistensi repo |
| `node scripts/bump.mjs patch\|minor\|major\|X.Y.Z` | naikkan versi di `VERSION`, `package.json`, `plugin.json`, config kernel, `lib.mjs` |

CI menjalankan test dan check-repo di Linux dan Windows. Rilis: bump → PR → merge → tag `v<versi>` pada commit merge. Riwayat: `CHANGELOG.md`.

Lisensi: MIT. Atribusi: `THIRD_PARTY.md`.
