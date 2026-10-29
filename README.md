# agent-harness — Harness v1 untuk Claude Code

Installer satu perintah yang **mengganti penuh** harness lama dengan harness v1: alur `impact → plan → approve → build → review → ship`, ditegakkan hook, dengan pengetahuan project berlapis. Berlaku untuk project existing dan project baru. Tanpa data project tertanam; service dideteksi dari `source-code/<repo git>`.

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

**Memperbarui:** `install.mjs --update` (tambah `--dry-run` untuk meninjau). Hanya berkas milik harness yang diganti; berkas buatan user di `.claude/` (rule, agent) tidak dibuang. Berkas harness yang sudah usang dibuang berdasarkan `.claude/harness.manifest.json`. `harness.config.json` digabung: nilai user (`root_branch`, `protected_branches`, `checks`, `baseline`, dst.) menang atas bawaan, kunci baru dari kernel ditambahkan. `settings.json`: izin dan kunci lain milik user dibawa; hook kustom tidak dibawa dan dilaporkan. Versi sama → tidak ada perubahan (`--force` untuk memasang ulang); versi terpasang lebih baru dari installer → ditolak (`--force` untuk menurunkan). Config yang rusak menghentikan installer, tidak ditimpa. Cek hasilnya: `node .claude/hooks/harness.mjs doctor` (membandingkan `.claude/harness.version` dengan config).
Sisa modul yang sudah dibuang (`scripts/executor/`, `.agents/`, blok config `executor` dan `plane`) tidak disentuh: dilaporkan di rencana, tidak dipakai lagi, dan boleh kamu hapus sendiri.

Prasyarat: Node ≥ 18, git, Claude Code ≥ 2.1.295; `gh` (PR & cek merge); opsional (nonaktif bawaan) `pip install graphifyy==0.9.90` untuk graph L1 setelah uji terukur.

## Alur pakai

| langkah | perintah | hasil |
|---|---|---|
| bootstrap (sekali; ulangi untuk service baru) | `/harness:init` (satu service dulu, lihat `/usage`, lalu `all`) | inventaris, baseline per service, `docs/_map.md`, `docs/knowledge/<svc>/{summary,patterns}.md` dari commit baseline, usulan `checks.<svc>` |
| verifikasi knowledge (kamu) | `harness.mjs knowledge-sample <svc>` → `/harness:verify <svc>` | `draft → verified` (hanya bila `lint-knowledge` bersih) |
| 1. dampak | `/harness:impact feature <permintaan>` | `docs/work/<slug>/{brief,impact}.md` |
| 2. plan (sesi planning) | `/harness:plan <slug>` | `plan.md` `draft` + AC bernomor |
| 3. setuju (kamu) | `/harness:approve <slug>` | hook menulis `approved` |
| 4. eksekusi (sesi baru) | `/harness:build <slug>` | kode + bukti per AC di `progress.md` → `in-review` |
| 5. review / feedback | `/harness:review <slug> [feedback]` | `review.md`; blocker → balik ke build; clean → `done` |
| 6. kirim | `/harness:ship <slug>` | branch, commit, push, PR (`gh`); panggil lagi setelah merge → `merged` |
| usulan pola (kamu) | `/harness:patterns <slug> P1,P3\|all` | hook menerapkan usulan dari review ke `patterns.md` |
| lain | `/harness:status`, `/harness:board`, `/harness:refresh <svc>` | tabel item + cek instalasi; papan HTML lokal per service (`.claude/state/board.html`); perbarui knowledge yang tertinggal dari baseline |

Awal setiap sesi, hook melaporkan (tanpa token, git lokal saja): service tanpa knowledge, knowledge tertinggal dari baseline (ambang `knowledge.stale_warn_commits`, bawaan 15), dan yang masih `draft`.

Tipe: `feature`, `improvement`, `hotfix` (plan 4 baris, gerbang tetap), `analysis`, `cross-repo`, `schema`, `onboard`.
Status: `draft → approved → in-progress → in-review → done → merged`. Selesai = PR merged.

## Yang ditegakkan hook (bukan sekadar anjuran)

| aturan | mekanisme |
|---|---|
| edit kode di service butuh work item approved yang mencakup service itu | `PreToolUse` Edit/Write + Bash (tulis ke `source-code/`) |
| `approved` hanya manusia | hook `UserPromptSubmit` menulis status; Edit/Bash/CLI agent ditolak |
| `done` = tiap AC punya bukti di `progress.md` + `review.md` `verdict: clean` tanpa blocker (+ `test_command` bila ada) | pemeriksaan transisi saat `plan.md` diubah |
| `merged` = semua PR `MERGED` menurut `gh` | idem |
| plan beku setelah approved | revisi: `harness.mjs reopen <slug>` + approve ulang |
| tanpa push/commit ke branch utama, force push, `gh pr merge`, `reset --hard`, perintah destruktif | `PreToolUse` Bash |
| tanpa baca/tulis `.env`/kunci, tanpa secret literal | `PreToolUse` + `permissions.deny` |
| `.claude/hooks`, `settings.json`, `harness.config.json` dilindungi | `PreToolUse` (buka: `HARNESS_ADMIN=1` saat menjalankan `claude`) |
| migrasi/skema hanya di item bertipe `schema` | `PreToolUse` |
| knowledge `verified` hanya manusia; mengedit file `verified` = turun ke `draft` | `PreToolUse` (gate) + hook `UserPromptSubmit` (`/harness:verify`, hanya bila lint bersih) |
| pola baru/berubah hanya diusulkan agent (`Status: proposed`); `applied` hanya setelah manusia mengetik `/harness:patterns` | `PreToolUse` + `UserPromptSubmit` |
| audit JSONL tanpa secret (`.claude/audit/`), laporan diff manifest dependency, peringatan konteks ±400k | `PostToolUse`, `InstructionsLoaded` |
| hook rusak/timeout = aksi diblokir | `onFailure: "block"` |

Hook adalah guardrail berbasis pola, **bukan sandbox**: agent yang sengaja mencari celah lewat shell bisa saja menemukannya. Ia menutup jalan yang lazim dan membuat pelanggaran terlihat di audit.

Konfigurasi: `harness.config.json` (service, branch dilindungi, `gate.test_command`, ambang konteks, `graphify` (nonaktif bawaan), `knowledge` (batas baris, ambang kedaluwarsa), `baseline` (override branch baseline per service)).

## Knowledge: baseline, lint, kedaluwarsa

- **Baseline** per service: `baseline.<svc>` di config → `origin/HEAD` → `production` → `main` → `master`; remote-tracking didahulukan atas branch lokal. Analisa memakai `git worktree` sementara (`.claude/state/worktrees/<svc>`) di commit baseline: checkout/branch fitur Anda tidak disentuh. Tanpa jaringan kecuali `baseline --fetch`.
- **`lint-knowledge`** (deterministik, nol token): tiap sitasi `path:baris` harus ada **pada `source_commit`**, barisnya ada, dan simbol backtick sebaris ditemukan di ±3 baris; batas panjang; secret literal; `UNKNOWN` dan dugaan `?` tidak dianggap klaim. Membuktikan sitasi ada, **bukan** bahwa penjelasannya benar — karena itu `verified` tetap keputusan manusia (`knowledge-sample` memudahkan: 6 klaim acak + kodenya).
- **Pola** dibedakan dari fakta: fakta diperbarui otomatis sebagai `draft`; pola hanya diusulkan (review, hanya saat `clean`) dan disetujui manusia.
- **Graphify** nonaktif; syarat aktif ada di `plugin/skills/init/GRAPHIFY-TRIAL.md` (recall ≥ grep **dan** token turun berarti, kriteria ditetapkan sebelum uji).
- Perintah CLI: `harness.mjs snapshot | board | inventory | baseline | worktree | lint-knowledge | knowledge-sample | knowledge-status | propose-checks | patterns-check` (+ `verify-knowledge`, `patterns-approve`: hanya manusia).

## Pengujian

`npm test` (hook + installer di project contoh, termasuk existing, baru, tanpa git, layout single, pasang ulang, `--ignore`/`backup/`, sisa modul lama dipertahankan; knowledge: baseline, worktree, lint, kedaluwarsa, verifikasi, usulan pola). `node scripts/check-repo.mjs` (konsistensi repo). CI menjalankan keduanya di Linux dan Windows. `claude plugin validate .` lolos.
Diuji live dengan Claude Code 2.1.300 di sandbox: gerbang 1, approve via hook, transisi ilegal, rule per service (`paths`) termuat, `onFailure: block`, dan alur `impact → plan → approve → build → review → done` pada project mini.

## Belum teruji (jujur)

- `ship` (commit/push/PR) dan cek `merged` lewat `gh` pada repo GitHub nyata; `init`/`onboard`/`refresh` pada repo besar dan 14 repo (biaya token belum diukur — jalankan satu service dulu; bagian yang dijalankan model, yaitu kualitas ringkasan explorer, hanya diperiksa lint dan manusia); `lint-knowledge` diuji pada repo contoh kecil (heuristik simbol ±3 baris bisa memberi false positive pada bahasa/gaya tertentu); Graphify hanya diuji pada sampel kecil dan nonaktif.
- Windows untuk inti harness: hook murni Node; perbaikan gagal-terbuka pada path berspasi diuji otomatis di Linux, belum di Windows.
- Pendaftaran plugin otomatis lewat `extraKnownMarketplaces` di `.claude/settings.json`: pemasangan lokal terverifikasi; jalur github privat tergantung kredensial git di mesinmu (`gh auth setup-git`). Cadangan manual: `claude plugin marketplace add devhardiyanto/agent-harness && claude plugin install harness@harness-marketplace`.
- Mode `-p`/headless: entri `permissions.allow` diabaikan sampai workspace dipercaya (dialog trust).

Lisensi: MIT. Atribusi: lihat `THIRD_PARTY.md`.
