# agent-harness — Harness untuk Claude Code

Installer satu perintah yang **mengganti penuh** harness lama dengan harness ini: alur `impact → align → plan → approve → build → review → ship`, ditegakkan hook, dengan pengetahuan project berlapis. Berlaku untuk project existing dan project baru. Tanpa data project tertanam; service dideteksi dari `source-code/<repo git>`.

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

## Alur pakai

| langkah | perintah | hasil |
|---|---|---|
| bootstrap (sekali; ulangi untuk service baru) | `/harness:init` (satu service dulu, lihat `/usage`, lalu `all`) | inventaris, baseline per service, `docs/_map.md`, `docs/knowledge/<svc>/{summary,patterns}.md` dari commit baseline, usulan `checks.<svc>` |
| verifikasi knowledge (kamu) | `harness.mjs knowledge-sample <svc>` → `/harness:knowledge verify <svc>` | `draft → verified` (hanya bila `lint-knowledge` bersih) |
| **perubahan kecil (kamu)** | `/harness:quick <permintaan>` → kerjakan di sesi yang sama → `/harness:ship <slug>` | item `approved` oleh ketikanmu; 1 service, maks 5 file, bukan skema; tanpa `in-review`. Melebihi batas: `harness.mjs promote <slug>` |
| 1. dampak | `/harness:impact feature <permintaan>` | `docs/work/<slug>/{brief,impact}.md` (brief = objective saja) |
| 1b. align (agent skeptis, maks 3 ronde; kamu menutup) | `/harness:align <slug>` → `/harness:align <slug> ok` | `align.md`: klaim vs bukti kode, parking lot; hook menulis `aligned` |
| 2. plan (sesi planning) | `/harness:plan <slug>` | `plan.md` `draft` + AC bernomor |
| 3. setuju (kamu) | `/harness:approve <slug>` | hook menulis `approved` (item standard butuh `aligned`) |
| 4. eksekusi (sesi baru) | `/harness:build <slug>` | kode + bukti per AC di `progress.md` → `in-review` |
| 5. review / feedback | `/harness:review <slug> [feedback]` | `review.md`; blocker → balik ke build; clean → `done` |
| 6. kirim | `/harness:ship <slug>` | panggilan 1: branch, commit, push, PR (`gh`). Setelah check PR hijau, ketik lagi: **ketikanmu = keputusan merge** → `merged` (lihat "Pengiriman berantai") |
| usulan pola (kamu) | `/harness:knowledge patterns <slug> P1,P3\|all` | hook menerapkan usulan dari review ke `patterns.md` |
| bingung langkah berikutnya | `/harness:next` | tabel: item, status, siapa yang bertindak, perintah persisnya |
| update harness (kamu) | `/harness:update [all\|rollback]` atau "tolong root nya di update ke main" | root ke `main`, `pull --ff-only`, update berkas harness, `doctor`, commit `chore(harness): update to vX.Y.Z`; push hanya bila `update.autoPush` |
| lain | `/harness:status`, `/harness:status board`, `/harness:knowledge refresh <svc>` | tabel item + cek instalasi; papan HTML lokal per service (`.claude/state/board.html`); perbarui knowledge yang tertinggal dari baseline |

Awal setiap sesi, hook melaporkan (tanpa token, git lokal saja): service tanpa knowledge, knowledge tertinggal dari baseline (ambang `knowledge.stale_warn_commits`, bawaan 15), dan yang masih `draft`.

**Gerbang pengiriman (`gate.md`):** `harness.mjs gate <slug>` (otomatis saat `set-status done`) menjalankan `checks.<svc>` di `harness.config.json` (`lint`, `test`, `build`, atau kunci lain; contoh `"checks": {"api": {"lint": "npm run lint", "test": "npm test"}}`), memeriksa bukti AC, review (lajur standard), dan secret di diff terhadap baseline. Hasil per item: PASS / FAIL / TIDAK DIPERIKSA (service tanpa checks tetap boleh dikirim, tetapi tercatat). Satu FAIL menolak `done`; `gate.md` yang usang (kode/bukti berubah) juga menolak. Usulan checks: `harness.mjs propose-checks <svc>` (kamu yang menyalin ke config). `gate.require_checks: true` menjadikan checks kosong sebagai FAIL.

Tambahan kecil setelah approve: `harness.mjs amend <slug> --ac "..."` (maks `amend.max`, bawaan 3; hanya menambah AC). Perubahan besar: `reopen` + approve ulang. Skill ada 14 (tidak bertambah di 1.10.0; bahasa pendek diproses hook): `init impact align plan approve build review ship status knowledge next quick summarize update`. `summarize` menulis ringkasan serah-terima sesi ke `docs/sessions/` dan dijalankan otomatis setelah ship berstatus `merged`.

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
| tanpa push/commit ke branch utama (`main`, `master`, `develop`, `production`, `staging`, `release/*`), force push, `gh pr merge`, `reset --hard`, perintah destruktif | `PreToolUse` Bash. `doctor` memeriksa bahwa branch baseline tiap service termasuk yang dilindungi |
| tanpa baca `.env`/kunci | `permissions.deny` (Read tidak lagi melewati hook, jadi tanpa latensi); Bash lewat `guard-bash` |
| tanpa tulis `.env`/kunci, tanpa secret literal | `PreToolUse` (Edit/Write) |
| `.claude/hooks`, `settings.json`, `harness.config.json` dilindungi | `PreToolUse` (buka: `HARNESS_ADMIN=1` saat menjalankan `claude`) |
| migrasi/skema hanya di item bertipe `schema` | `PreToolUse` |
| knowledge `verified` hanya manusia; mengedit file `verified` = turun ke `draft` | `PreToolUse` (gate) + hook `UserPromptSubmit` (`/harness:knowledge verify`, hanya bila lint bersih) |
| pola baru/berubah hanya diusulkan agent (`Status: proposed`); `applied` hanya setelah manusia mengetik `/harness:knowledge patterns` | `PreToolUse` + `UserPromptSubmit` |
| audit JSONL tanpa secret (`.claude/audit/`) untuk perubahan (Edit/Write/Bash), laporan diff manifest dependency, peringatan konteks ±400k | `PostToolUse` (hanya tool penulis dan Bash), `UserPromptSubmit` (peringatan konteks), `InstructionsLoaded` |
| hook rusak/timeout = aksi diblokir | `onFailure: "block"` |

Read, Grep, dan Glob **tidak** melewati hook sama sekali. Ukur beban hook di mesinmu (terukur di Windows, Node 24: Edit/Write ≈ 94 ms, Bash ≈ 95 ms, dasar `node` kosong 35 ms; SessionStart memeriksa kedaluwarsa knowledge lewat 3 proses `git` per service, bukan 10): `node .claude/hooks/harness.mjs bench` (p50/p95 per hook dan per tindakan). Menurut dokumentasi tools Claude Code, aturan `Read(...)` di `permissions.deny` berlaku juga untuk Grep, Glob, dan LSP (dan memblokir Edit/Write ke path yang sama), jadi tidak perlu hook untuk menutupnya. Konfirmasi di mesinmu: minta agent `Grep` string di `.env` (harus ditolak). Di Windows, shell bisa Bash atau PowerShell; hook `guard-bash` dan `post` dipasang untuk keduanya.

Hook adalah guardrail berbasis pola, **bukan sandbox**: agent yang sengaja mencari celah lewat shell bisa saja menemukannya. Ia menutup jalan yang lazim dan membuat pelanggaran terlihat di audit.

Konfigurasi: `harness.config.json` (service, branch dilindungi, `gate.test_command`, ambang konteks, `knowledge` (batas baris, ambang kedaluwarsa), `baseline` (override branch baseline per service)).

## Routing model, bukti test, handoff (1.7.0)

| bagian | perilaku |
|---|---|
| model | sesi utama Sonnet (`settings.json` → `model`). `scout` (Haiku, read-only: cari fakta di kode), `runner` (Haiku: menjalankan `run-checks`), `reviewer` (Opus, read-only: menyetujui/menolak). `scout`, `runner`, `reviewer` memakai `omitClaudeMd` agar konteks kecil. `explorer` tetap Sonnet untuk analisa relasi |
| bukti test | `harness.mjs run-checks <slug>` menjalankan `checks.<svc>` dan **kode harness** menulis `.harness/evidence/<slug>/tests.json` (verdict, sidik jari kode). Berkas ini dilindungi dari Edit/Write dan tulis lewat shell |
| gerbang Stop | hook `Stop` menolak berhenti (exit 2) bila item yang baru dikerjakan sudah semua-AC-berbukti tetapi bukti test belum ada / gagal / usang, atau (standard, `in-review`) review belum dijalankan. Anti-loop: `stop_hook_active` dari Claude Code + batas `stop_gate.max_blocks` (2) per sesi; `stop_gate.enabled: false` mematikan |
| handoff | `PreCompact` dan `SessionEnd` menulis `.harness/handoff.md` (tabel item + "Status terkini"); `SessionStart` menyuntiknya (dipotong `handoff.max_chars`, total ≤ 10.000 karakter). Lihat: `harness.mjs log [n]` |
| `harness update` | `scripts/harness-update.mjs` (dipanggil `harness.mjs update`): lihat tabel alur. Hanya jalan dengan tiket dari ketikanmu (`/harness:update` atau kalimat pemicu); `--all` untuk semua project terdaftar; `--rollback` = `git revert` update terakhir (tanpa push). Commit tanpa kredit apa pun |
| WorkStore | `store.mjs`: semua baca/tulis work item lewat satu antarmuka; backend `local` (docs/work). `store.backend` lain belum ada |
| ukur | `harness.mjs measure <transcript.jsonl> [--label x]`: token per model, panggilan subagent, giliran Opus, durasi → `.harness/metrics/`. Jalankan sebelum dan sesudah, bandingkan |

Belum terverifikasi di Claude Code asli (tidak bisa diuji di sandbox): hook `Stop` memblokir lewat exit 2 pada versi-mu, `omitClaudeMd` pada versi-mu, perilaku Windows (hook memakai exec form; diuji otomatis di Linux dan Windows lewat CI, bukan di sesi interaktif). Gerbang #1 (`ExitPlanMode`) dan #2 (hash error `PostToolUseFailure`) sengaja belum dipasang karena belum teruji.

## Event log, papan TUI, ringkasan, gc (1.8.0)

| bagian | perilaku |
|---|---|
| event log | `.harness/events.jsonl` (di-gitignore, rotasi di 1 MB → `.1`, di-redact): perubahan status, approve/align/quick, penolakan hook, bukti test, update, ringkasan. Tool call berisik tidak masuk. `harness.mjs log [n]` menampilkannya; jejak lengkap tetap di `.claude/audit/` |
| `harness.mjs watch` | TUI Node murni (tanpa dependency; bukan binary Go): Backlog=`draft`, Todo=`approved`, In Progress, Review=`in-review`, Done=`done`/`merged`; kartu menunjukkan lajur, AC berbukti, verdict test; event terakhir di bawah. Segar otomatis; `q` keluar, `r` muat ulang; `--once` satu bingkai tanpa ANSI |
| ringkasan lokal | saat `done` dan `merged`: `docs/work/<slug>/summary.md` dirangkum dari file (objective di `brief.md`, hasil per AC, `## Decision log` di `progress.md`, debat dan parking lot di `align.md`, review, gate, bukti test, PR). Deterministik, tanpa model |
| `harness.mjs gc [--days N]` | rencana pembersihan: bukti test item merged/tidak ada, event log rotasi, penanda/tiket kedaluwarsa, audit lebih dari N hari (30). `--yes` menghapus dan hanya untuk manusia (diblokir untuk agent). Work item, docs, knowledge, config, metrics, dan handoff tidak disentuh |

## Plane: sinkron status satu arah (1.9.0, opsional)
Mati bawaan. Bila dinyalakan, tiap work item punya satu kartu di project Plane dan statusnya mengikuti status lokal. **Satu arah**: harness menulis ke Plane, Plane tidak mengubah apa pun di lokal. Sumber kebenaran tetap `docs/work/<slug>/plan.md`; kartu hanya menyimpan tautan balik (`plane_id` di frontmatter) dan menampilkan status.

Pemetaan bawaan: `draft`=Backlog, `approved`=Todo, `in-progress`=In Progress, `in-review`=Review, `done`/`merged`=Done. Nama state diubah di `plane.states` (mis. astra: `"in-review": "In Review"`).

Menyalakan (per root):
1. Buat API key Plane (akun yang kartunya mau ditulis); simpan **hanya** sebagai variabel lingkungan, mis. `PLANE_API_KEY`. Variabel harus sudah ada sebelum Claude Code dijalankan. Token tidak pernah ditulis ke config, event log, atau audit.
2. Di `harness.config.json`: `"plane": {"enabled": true, "workspace": "<slug workspace>", "project_id": "<id project>"}` (opsional: `base_url` untuk self-hosted, hanya `https://`; `token_env`; `states`).
3. `node .claude/hooks/harness.mjs plane check` (uji konfigurasi, token, koneksi, dan bahwa semua nama state ada), lalu `plane sync --dry-run` (lihat apa yang akan dikirim), lalu `plane sync`.

Cara kerja: tiap perubahan status (hook approve, `set-status`, `quick`, `promote`, awal sesi) memicu `plane sync` di proses latar, tanpa menunda apa pun. Kegagalan jaringan/API tidak menggagalkan transisi status; yang tertinggal dikirim pada sync berikutnya (rekonsiliasi: status lokal ≠ status terakhir terkirim, dicatat di `.harness/plane.json`). Tiap pemindahan kolom ditandai komentar `[harness] draft → approved` dan kartu dibuat dengan `external_source: harness`. Item `merged` tanpa kartu tidak dibuat (pakai `plane sync --include-merged` bila mau). `doctor` GAGAL bila `enabled` tetapi konfigurasi atau token tidak lengkap.

### 1.13.0: Plane sebagai pintu diskusi (jembatan ke 2.0)
Kartu kini berisi **Tujuan, Konteks, Keputusan, dan Checklist AC** (to-do list Plane; AC berbukti dicentang), dan diskusi berjalan di **komentar**. Tambahkan ke blok `plane`: `"mention_user_id": "<UUID member Plane-mu>"` supaya keputusan yang menahan pekerjaan me-@ kamu.

| kamu / agent | perintah |
|---|---|
| tarik komentar + centang ke cermin `.harness/plane/<slug>.md` | otomatis (awal sesi, tiap prompt maks 1×/menit) atau ketik `tarik` |
| agent membalas di kartu | `harness.mjs plane comment <slug> "<teks>"` |
| agent minta keputusan (tabel dari kode + @mention) | `harness.mjs plane ask <slug> --decide` (juga otomatis saat Stop menahan giliran) |
| kirim isi kartu sekarang | `harness.mjs plane push [slug]` (juga setelah tiap `plane sync`) |
| migrasi semua item ke Plane | `plane migrate` (rencana) → `plane migrate --apply` → `plane migrate --verify` |

Deskripsi yang kamu ubah langsung di Plane tidak ditimpa: kiriman berikutnya DITAHAN dan agent diminta menyelaraskan lokal dulu (`plane push <slug> --force`). Mencentang checklist di Plane boleh. Komentar manusia yang baru muncul sekali sebagai konteks agent di prompt berikutnya. Webhook ke laptop tidak mungkin, jadi tidak real-time. Di 1.13 folder `docs/work` **tidak dihapus**. Penghapusan per root (setelah `--verify` COCOK) dan knowledge → Plane Pages dikerjakan di 2.0 (`ROADMAP.md` §8).

### Kesiapan 2.0
- `harness.mjs pilot`: frasa vs slash, salah tangkap, penahanan Stop, "push PR + merge" yang sampai merged (jendela `pilot.hours`, bawaan 6 jam; `--hours N` / `--days N`). Ketik `bukan itu` saat hook salah menangkap kalimatmu.
- `harness.mjs migrate`: align format lama (diperbaiki otomatis di awal sesi), flag yang dikunci di 2.0, Plane siap, item yang belum dimigrasi. `doctor` menampilkannya sebagai baris info "siap 2.0".

## Bahasa pendek, tabel belum selesai, memori (1.10.0)
Tidak perlu hafal `/harness:*` (bentuk lama tetap jalan). Ketik kalimat pendek; hook yang memprosesnya, jadi tetap keputusan manusia:

| ketik | sama dengan |
|---|---|
| `setuju <slug>` / `approve <slug>` | `/harness:approve <slug>` |
| `align ok <slug>` · `align ok <slug> terima C2` | `/harness:align <slug> ok` (+ menerima risiko klaim bertentangan) |
| `push PR + merge [slug]` / `kirim <slug>` | satu keputusan: buka PR → merge begitu check hijau → ringkasan (`summary.md` + `docs/memory/INDEX.md`). Tanpa slug = satu-satunya item `done` |
| `quick: <permintaan>` | `/harness:quick <permintaan>` |
| `sisa` / `yang belum selesai?` | tabel Belum selesai (`harness.mjs open`) |
| `ingat user: <preferensi>` · `lupakan U2` | profil user **per orang** di `~/.harness/USER.md` (tidak di repo, tidak berlaku ke rekan setim) |
| `ingat: <fakta>` · `lupakan M2` | memori project `docs/memory/MEMORY.md` (agent juga menulis sendiri, gaya Hermes; `ingat P1` bila `memory.write_approval`) |
| `... ref:<slug> ...` | ringkasan item lama dimuat sebagai konteks |

Slug boleh potongan unik (`setuju export-csv`). Kalimat > `intent.max_chars` atau slug yang tidak cocok tepat satu item diteruskan sebagai chat biasa. Rekap Belum selesai muncul otomatis di akhir giliran yang menyentuh item (hanya bila berubah). Flag: `intent`, `recap`, `memory`, `align.accept_contradictions`, `ship.merge_on_request`.

Merge tetap aman: ketikan ship menjadi **izin merge tertunda** (`.claude/state/merge-tickets/intent-<slug>.json`, dilindungi, `ship.intent_ttl_min` 240 menit). `harness.mjs ship` memakai izin itu hanya bila gate PASS, tiap PR OPEN dan bukan draft, check hijau, dan akun gh punya akses; check masih berjalan atau merah = tidak merge, izin tetap. `ship.merge_on_request: false` = perilaku lama (ketik ulang setelah hijau). Rencana dan riset: [`ROADMAP.md`](ROADMAP.md).

## Profil user, playbook, ID aturan (1.11.0)
| bagian | perilaku |
|---|---|
| profil user | `~/.harness/USER.md` (batas `memory.user_max_chars`, 1375), dimuat di awal sesi sebelum memori project. Ditulis lewat `ingat user: ...` atau oleh agent (`memory add --user`). Per orang karena root multi-repo dipakai bersama tim. |
| playbook | `docs/memory/playbooks/<nama>.md`: prosedur yang dipelajari agent (padanan skill Hermes). Awal sesi hanya memuat nama + deskripsi; isi dibaca saat relevan. `harness.mjs playbook list|lint`; yang gagal lint (frontmatter, > `playbooks.max_chars`, secret) tidak dimuat. Format: `.claude/rules/playbook.md`. |
| ID aturan | tiap butir `.claude/rules/*.md` punya ID (`O-01` keluaran, `S-` keamanan, `W-` work item, `K-` knowledge, `M-` minimalis, `P-` playbook). Reviewer mengisi kolom `aturan` di `review.md`; `check-repo` menolak ID ganda. |

### Sebelum dan sesudah
| situasi | 1.9.x | 1.11.0 |
|---|---|---|
| align dengan klaim bertentangan | `align ditolak: 2 klaim masih berstatus "bertentangan" dengan kode.` lalu buntu | tabel klaim C2/C3 + pilihan: koreksi, atau `align ok <slug> terima C2,C3` |
| lupa posisi | buka `plan.md`, `progress.md`, `align.md` satu per satu | ketik `sisa` → satu tabel |
| kirim | `/harness:ship <slug>`, tunggu hijau, ketik lagi | `push PR + merge` sekali |
| konteks di sesi baru | mulai dari nol | profil user + memori project + daftar playbook + indeks pekerjaan lama |
| rujukan pekerjaan lama | cari manual di `docs/work` | `recall <kata>`, lalu `ref:<slug>` |

## Tabel keputusan, plan setelah aligned (1.12.0)
| bagian | perilaku |
|---|---|
| tabel keputusan | Dibuat **kode** dari `align.md`: klaim `bertentangan`, klaim `dugaan`, dan baris `D` tanpa jawaban di `## Keputusan terbuka`. Kolom terakhir = cara menjawab (`C2: <koreksi>`, `C3 benar`, `D1 a`). Baris terakhir = satu langkah berikutnya yang sah. Lihat: `harness.mjs decide [slug]`, ketik `keputusan` atau `sisa`. |
| giliran ditutup tabel | Hook Stop menahan giliran agent yang menyentuh item draft belum-aligned sampai tabel itu ditampilkan, sekali per perubahan isi (`align.decision_table`). |
| plan setelah aligned | `gate` menolak Edit/Write yang menambah/mengubah AC di `plan.md` selama align belum `aligned`, dengan tabel keputusan di pesannya (`align.block_plan_before_aligned`). Tipe `analysis`/`onboard`, lajur quick, dan `align.required: false` dikecualikan. |
| langkah berikutnya | `next` membaca isi `align.md`: ada klaim bertentangan → jawab tabel atau `terima Cn`; ada dugaan/D terbuka → jawab tabel lalu `align ok`; selain itu → `align ok`. Perintah memakai slug pendek (tanpa tanggal) bila unik. |
| versi skill | `doctor` membandingkan versi plugin `harness` (`claude plugin list`) dengan kernel; beda = GAGAL dengan perintah perbaikan; format tak terbaca = TIDAK DIPERIKSA. |

`terima C2` kini langsung tersimpan di `align.md` walaupun align belum bisa ditutup karena klaim lain.

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

## Pengiriman berantai (PR bertumpuk, merge oleh keputusanmu)
- **Base per service adalah data project**, bukan bagian repo ini: `harness.config.json` → `ship.base` (`{"api": "feat/dasar"}` = PR bertumpuk di atas branch itu). Bawaan: branch baseline service. `harness.mjs ship-plan <slug>` menampilkan branch kerja, base, akun `gh` aktif, dan masalah (di branch utama, akun tanpa akses tulis) sebelum apa pun di-push.
- **Remote beralias SSH** (`git@github-pribadi:owner/repo.git`) tidak dikenali `gh` sebagai host GitHub; harness mengurai `owner/repo` dari remote `origin` dan selalu memberikannya eksplisit (`ship-plan` menampilkan kolom `repo`; PR dibuat dengan `gh pr create -R owner/repo`).
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

## Rilis (pemelihara)
`node scripts/bump.mjs patch|minor|major|X.Y.Z` menaikkan versi di kelima tempat (`VERSION`, `package.json`, `plugin.json`, config kernel, `lib.mjs`) dan menjalankan `check-repo`; lalu commit, PR, dan setelah merge beri tag `v<versi>` pada commit merge. Naikkan versi untuk tiap perubahan kernel/plugin/installer yang harus sampai ke project: plugin hanya berganti bila `version` berubah, dan `--update` menolak memasang ulang versi yang sama.

## Pengujian

`npm test` (hook + installer di project contoh, termasuk existing, baru, tanpa git, layout single, pasang ulang, `--ignore`/`backup/`, sisa modul lama dipertahankan; knowledge: baseline, worktree, lint, kedaluwarsa, verifikasi, usulan pola). `node scripts/check-repo.mjs` (konsistensi repo). CI menjalankan keduanya di Linux dan Windows. `claude plugin validate .` lolos.
Diuji live dengan Claude Code 2.1.300 di sandbox: gerbang 1, approve via hook, transisi ilegal, rule per service (`paths`) termuat, `onFailure: block`, dan alur `impact → plan → approve → build → review → done` pada project mini.

## Belum teruji (jujur)

Uji di mesinmu (Windows, GitHub asli, Claude Code asli): lihat [`PILOT.md`](PILOT.md).


- `ship` (commit/push/PR) dan cek `merged` lewat `gh` pada repo GitHub nyata; `init`/`onboard`/`refresh` pada repo besar dan 14 repo (biaya token belum diukur — jalankan satu service dulu; bagian yang dijalankan model, yaitu kualitas ringkasan explorer, hanya diperiksa lint dan manusia); `lint-knowledge` diuji pada repo contoh kecil (heuristik simbol ±3 baris bisa memberi false positive pada bahasa/gaya tertentu).
- Windows untuk inti harness: hook murni Node; perbaikan gagal-terbuka pada path berspasi diuji otomatis di Linux, belum di Windows.
- Plugin global (scope user): marketplace GitHub privat tergantung kredensial git di mesinmu (`gh auth setup-git`); rekan satu repo tidak otomatis mendapat skill karena tidak ada pendaftaran di settings project.
- Mode `-p`/headless: entri `permissions.allow` diabaikan sampai workspace dipercaya (dialog trust).

Lisensi: MIT. Atribusi: lihat `THIRD_PARTY.md`.
