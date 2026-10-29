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

Prasyarat: Node ≥ 18, git, Claude Code ≥ 2.1.295; `gh` (PR & cek merge).

## Alur pakai

| langkah | perintah | hasil |
|---|---|---|
| bootstrap (sekali; ulangi untuk service baru) | `/harness:init` (satu service dulu, lihat `/usage`, lalu `all`) | inventaris, baseline per service, `docs/_map.md`, `docs/knowledge/<svc>/{summary,patterns}.md` dari commit baseline, usulan `checks.<svc>` |
| verifikasi knowledge (kamu) | `harness.mjs knowledge-sample <svc>` → `/harness:knowledge verify <svc>` | `draft → verified` (hanya bila `lint-knowledge` bersih) |
| **perubahan kecil (kamu)** | `/harness:quick <permintaan>` → kerjakan di sesi yang sama → `/harness:ship <slug>` | item `approved` oleh ketikanmu; 1 service, maks 5 file, bukan skema; tanpa `in-review`. Melebihi batas: `harness.mjs promote <slug>` |
| 1. dampak | `/harness:impact feature <permintaan>` | `docs/work/<slug>/{brief,impact}.md` |
| 2. plan (sesi planning) | `/harness:plan <slug>` | `plan.md` `draft` + AC bernomor |
| 3. setuju (kamu) | `/harness:approve <slug>` | hook menulis `approved` |
| 4. eksekusi (sesi baru) | `/harness:build <slug>` | kode + bukti per AC di `progress.md` → `in-review` |
| 5. review / feedback | `/harness:review <slug> [feedback]` | `review.md`; blocker → balik ke build; clean → `done` |
| 6. kirim | `/harness:ship <slug>` | panggilan 1: branch, commit, push, PR (`gh`). Setelah check PR hijau, ketik lagi: **ketikanmu = keputusan merge** → `merged` (lihat "Pengiriman berantai") |
| usulan pola (kamu) | `/harness:knowledge patterns <slug> P1,P3\|all` | hook menerapkan usulan dari review ke `patterns.md` |
| bingung langkah berikutnya | `/harness:next` | tabel: item, status, siapa yang bertindak, perintah persisnya |
| lain | `/harness:status`, `/harness:status board`, `/harness:knowledge refresh <svc>` | tabel item + cek instalasi; papan HTML lokal per service (`.claude/state/board.html`); perbarui knowledge yang tertinggal dari baseline |

Awal setiap sesi, hook melaporkan (tanpa token, git lokal saja): service tanpa knowledge, knowledge tertinggal dari baseline (ambang `knowledge.stale_warn_commits`, bawaan 15), dan yang masih `draft`.

**Gerbang pengiriman (`gate.md`):** `harness.mjs gate <slug>` (otomatis saat `set-status done`) menjalankan `checks.<svc>` di `harness.config.json` (`lint`, `test`, `build`, atau kunci lain; contoh `"checks": {"api": {"lint": "npm run lint", "test": "npm test"}}`), memeriksa bukti AC, review (lajur standard), dan secret di diff terhadap baseline. Hasil per item: PASS / FAIL / TIDAK DIPERIKSA (service tanpa checks tetap boleh dikirim, tetapi tercatat). Satu FAIL menolak `done`; `gate.md` yang usang (kode/bukti berubah) juga menolak. Usulan checks: `harness.mjs propose-checks <svc>` (kamu yang menyalin ke config). `gate.require_checks: true` menjadikan checks kosong sebagai FAIL.

Tambahan kecil setelah approve: `harness.mjs amend <slug> --ac "..."` (maks `amend.max`, bawaan 3; hanya menambah AC). Perubahan besar: `reopen` + approve ulang. Skill ada 11: `init impact plan approve build review ship status knowledge next quick`.

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
| tanpa baca `.env`/kunci | `permissions.deny` (Read tidak lagi melewati hook, jadi tanpa latensi); Bash lewat `guard-bash` |
| tanpa tulis `.env`/kunci, tanpa secret literal | `PreToolUse` (Edit/Write) |
| `.claude/hooks`, `settings.json`, `harness.config.json` dilindungi | `PreToolUse` (buka: `HARNESS_ADMIN=1` saat menjalankan `claude`) |
| migrasi/skema hanya di item bertipe `schema` | `PreToolUse` |
| knowledge `verified` hanya manusia; mengedit file `verified` = turun ke `draft` | `PreToolUse` (gate) + hook `UserPromptSubmit` (`/harness:knowledge verify`, hanya bila lint bersih) |
| pola baru/berubah hanya diusulkan agent (`Status: proposed`); `applied` hanya setelah manusia mengetik `/harness:knowledge patterns` | `PreToolUse` + `UserPromptSubmit` |
| audit JSONL tanpa secret (`.claude/audit/`) untuk perubahan (Edit/Write/Bash), laporan diff manifest dependency, peringatan konteks ±400k | `PostToolUse` (hanya tool penulis dan Bash), `UserPromptSubmit` (peringatan konteks), `InstructionsLoaded` |
| hook rusak/timeout = aksi diblokir | `onFailure: "block"` |

Read, Grep, dan Glob **tidak** melewati hook sama sekali. Ukur beban hook di mesinmu: `node .claude/hooks/harness.mjs bench` (p50/p95 per hook dan per tindakan). Menurut dokumentasi tools Claude Code, aturan `Read(...)` di `permissions.deny` berlaku juga untuk Grep, Glob, dan LSP (dan memblokir Edit/Write ke path yang sama), jadi tidak perlu hook untuk menutupnya. Konfirmasi di mesinmu: minta agent `Grep` string di `.env` (harus ditolak). Di Windows, shell bisa Bash atau PowerShell; hook `guard-bash` dan `post` dipasang untuk keduanya.

Hook adalah guardrail berbasis pola, **bukan sandbox**: agent yang sengaja mencari celah lewat shell bisa saja menemukannya. Ia menutup jalan yang lazim dan membuat pelanggaran terlihat di audit.

Konfigurasi: `harness.config.json` (service, branch dilindungi, `gate.test_command`, ambang konteks, `knowledge` (batas baris, ambang kedaluwarsa), `baseline` (override branch baseline per service)).

## Pengiriman berantai (PR bertumpuk, merge oleh keputusanmu)
- **Base per service adalah data project**, bukan bagian repo ini: `harness.config.json` → `ship.base` (`{"api": "feat/dasar"}` = PR bertumpuk di atas branch itu). Bawaan: branch baseline service. `harness.mjs ship-plan <slug>` menampilkan branch kerja, base, akun `gh` aktif, dan masalah (di branch utama, akun tanpa akses tulis) sebelum apa pun di-push.
- **Akun gh**: bila akun aktif tidak punya akses ke repo service, pesannya menyebut akun aktif dan perintah `gh auth switch --user <akun>`. `harness.mjs doctor` memeriksanya juga (service tanpa remote `origin` dilewati).
- **Keputusan merge = ketikan manusia.** `/harness:ship <slug>` kedua (saat `pr:` terisi) diproses hook: gate harus `pass` dan masih berlaku, tiap PR OPEN, bukan draft, check **hijau** (merah atau masih berjalan = ditolak; PR tanpa check dicatat `TIDAK ADA CHECK`), akun gh punya akses. Lolos → tiket sekali pakai di `.claude/state/merge-tickets/` (berlaku `ship.ticket_ttl_min`, 30 menit; mengikat SHA tiap PR).
- **Agent tetap tidak bisa `gh pr merge`** (diblokir). Ia hanya menjalankan `harness.mjs ship <slug>`, yang tidak berbuat apa pun tanpa tiket, menghapus tiket sebelum bertindak, dan memakai `--match-head-commit` (push baru setelah tiket = ditolak). Berkas tiket dilindungi dari Edit/Write dan penulisan lewat shell.
- **Rantai**: PR yang basenya bukan head PR lain di-merge lebih dulu; setelah induk masuk, PR anak diarahkan (`gh pr edit --base`) ke base induk, lalu di-merge. Metode `ship.merge_method` (bawaan `merge`, aman untuk rantai). Branch tidak dihapus (penghapusan = keputusanmu).
- Gate tetap berlaku setelah hasil di-commit: sidik jari memakai hash isi pohon kerja, bukan SHA commit.
- Batas jujur: tiket adalah guardrail, bukan sandbox; agent yang sengaja menulis tiket lewat jalur yang tidak terpantau tidak dapat dicegah sepenuhnya (jejaknya ada di audit). `gh` tiruan di tes membuktikan logikanya, bukan perilaku GitHub; uji nyata ada di paket pilot S8.

## Knowledge: baseline, lint, kedaluwarsa

- **Baseline** per service: `baseline.<svc>` di config → `origin/HEAD` → `production` → `main` → `master`; remote-tracking didahulukan atas branch lokal. Analisa memakai `git worktree` sementara (`.claude/state/worktrees/<svc>`) di commit baseline: checkout/branch fitur Anda tidak disentuh. Tanpa jaringan kecuali `baseline --fetch`.
- **`lint-knowledge`** (deterministik, nol token): tiap sitasi `path:baris` harus ada **pada `source_commit`**, barisnya ada, dan simbol backtick sebaris ditemukan di ±3 baris; batas panjang; secret literal; `UNKNOWN` dan dugaan `?` tidak dianggap klaim. Membuktikan sitasi ada, **bukan** bahwa penjelasannya benar — karena itu `verified` tetap keputusan manusia (`knowledge-sample` memudahkan: 6 klaim acak + kodenya).
- **Pola** dibedakan dari fakta: fakta diperbarui otomatis sebagai `draft`; pola hanya diusulkan (review, hanya saat `clean`) dan disetujui manusia.
- **Tanpa graph.** Graphify dibuang di 1.4.0: relasi antar-service sebagian besar implisit (env var base URL, klien HTTP, queue), jadi graph AST tidak menggantikan bukti dari kode; `explorer` + `LSP`/`Grep` yang dipakai.
- **Draft berlabel**: knowledge `draft` dikutip dengan label `[draft]` dan dicek ke kode; `/harness:init` mencatat biaya per service di `docs/knowledge/_init.md` (angka `/usage` dari kamu) supaya keputusan lanjut `all` berbasis data.
- Perintah CLI: `harness.mjs snapshot | board | inventory | baseline | worktree | lint-knowledge | knowledge-sample | knowledge-status | propose-checks | patterns-check` (+ `verify-knowledge`, `patterns-approve`: hanya manusia).

## Pengujian

`npm test` (hook + installer di project contoh, termasuk existing, baru, tanpa git, layout single, pasang ulang, `--ignore`/`backup/`, sisa modul lama dipertahankan; knowledge: baseline, worktree, lint, kedaluwarsa, verifikasi, usulan pola). `node scripts/check-repo.mjs` (konsistensi repo). CI menjalankan keduanya di Linux dan Windows. `claude plugin validate .` lolos.
Diuji live dengan Claude Code 2.1.300 di sandbox: gerbang 1, approve via hook, transisi ilegal, rule per service (`paths`) termuat, `onFailure: block`, dan alur `impact → plan → approve → build → review → done` pada project mini.

## Belum teruji (jujur)

- `ship` (commit/push/PR) dan cek `merged` lewat `gh` pada repo GitHub nyata; `init`/`onboard`/`refresh` pada repo besar dan 14 repo (biaya token belum diukur — jalankan satu service dulu; bagian yang dijalankan model, yaitu kualitas ringkasan explorer, hanya diperiksa lint dan manusia); `lint-knowledge` diuji pada repo contoh kecil (heuristik simbol ±3 baris bisa memberi false positive pada bahasa/gaya tertentu).
- Windows untuk inti harness: hook murni Node; perbaikan gagal-terbuka pada path berspasi diuji otomatis di Linux, belum di Windows.
- Pendaftaran plugin otomatis lewat `extraKnownMarketplaces` di `.claude/settings.json`: pemasangan lokal terverifikasi; jalur github privat tergantung kredensial git di mesinmu (`gh auth setup-git`). Cadangan manual: `claude plugin marketplace add devhardiyanto/agent-harness && claude plugin install harness@harness-marketplace`.
- Mode `-p`/headless: entri `permissions.allow` diabaikan sampai workspace dipercaya (dialog trust).

Lisensi: MIT. Atribusi: lihat `THIRD_PARTY.md`.
