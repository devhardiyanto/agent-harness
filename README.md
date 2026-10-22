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
```
Opsi: `--branch NAMA` (default `harness-v1`), `--root-branch main`, `--project-name`, `--repo owner/repo`, `--allow-dirty`, `--no-commit`, `--with-executor` (modul opsional, lihat bawah).

Yang dilakukan installer: cek prasyarat (tidak memasang apa pun) → deteksi mode & service → tag cadangan `harness-pre-v1-<waktu>` → branch `harness-v1` → buang harness lama → pasang kernel → commit. Mundur kapan saja: `git switch -c lama harness-pre-v1-<waktu>`. Project tanpa git: salinan `.harness-backup-<waktu>/`.
Dipertahankan: `source-code/`, `.mcp.json`, `.claude/settings.local.json`, `docs/` selain yang dibuang, `scripts/` selain skrip harness lama. Memasang ulang = ganti penuh perangkat (hook, rule, agent, skill), tetapi **data user dipertahankan** bila harness v1 sudah ada: `docs/work/` (kecuali `_TEMPLATE`), `docs/knowledge/`, `docs/_map.md`, dan blok `executor`/`checks` di `harness.config.json`.

Prasyarat: Node ≥ 18, git, Claude Code ≥ 2.1.295; `gh` (PR & cek merge); opsional `pip install graphifyy==0.9.90` (graph L1), MCP Plane.

## Alur pakai

| langkah | perintah | hasil |
|---|---|---|
| isi pengetahuan (sekali) | `/harness:onboard <service>` lalu `/harness:onboard all` | `docs/_map.md`, `docs/knowledge/<svc>/{summary,patterns}.md` (+graph) |
| 1. dampak | `/harness:impact feature <permintaan>` | `docs/work/<slug>/{brief,impact}.md` |
| 2. plan (sesi planning) | `/harness:plan <slug>` | `plan.md` `draft` + AC bernomor |
| 3. setuju (kamu) | `/harness:approve <slug>` | hook menulis `approved` |
| 4. eksekusi (sesi baru) | `/harness:build <slug>` | kode + bukti per AC di `progress.md` → `in-review` |
| 5. review / feedback | `/harness:review <slug> [feedback]` | `review.md`; blocker → balik ke build; clean → `done` |
| 6. kirim | `/harness:ship <slug>` | branch, commit, push, PR (`gh`); panggil lagi setelah merge → `merged` |
| lain | `/harness:status`, `/harness:refresh <svc>` | tabel item + cek instalasi; perbarui knowledge |

Tipe: `feature`, `improvement`, `hotfix` (plan 4 baris, gerbang tetap), `analysis`, `cross-repo`, `schema`, `onboard`.
Status: `draft → approved → in-progress → in-review → done → merged`. Selesai = PR merged.

## Modul opsional: executor (Claude Code + Antigravity CLI)

`node install.mjs --with-executor` memasang `scripts/executor/` dan `.agents/`, **nonaktif** secara bawaan. Claude tetap merencanakan, memverifikasi, dan meng-commit; `agy` mengeksekusi satu task dari brief tertulis (`/harness:dispatch <slug>`), dibatasi Scope, allowlist perintah, hook gate, dan audit diff. Prasyarat tambahan: python3, bash (Windows: Git Bash), `agy` ≥ 1.1.12. Detail, exit code, dan batas yang diketahui: `modules/executor/scripts/executor/README.md`.

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
| audit JSONL tanpa secret (`.claude/audit/`), laporan diff manifest dependency, peringatan konteks ±400k | `PostToolUse`, `InstructionsLoaded` |
| hook rusak/timeout = aksi diblokir | `onFailure: "block"` |

Hook adalah guardrail berbasis pola, **bukan sandbox**: agent yang sengaja mencari celah lewat shell bisa saja menemukannya. Ia menutup jalan yang lazim dan membuat pelanggaran terlihat di audit.

Konfigurasi: `harness.config.json` (service, branch dilindungi, `gate.test_command`, ambang konteks, Plane, Graphify).

## Pengujian

`npm test` (hook + installer di project contoh, termasuk existing, baru, tanpa git, layout single, pasang ulang, modul executor). `npm run test:executor` (50 uji modul executor dengan agy tiruan; butuh bash + python3). `claude plugin validate .` lolos.
Diuji live dengan Claude Code 2.1.300 di sandbox: gerbang 1, approve via hook, transisi ilegal, rule per service (`paths`) termuat, `onFailure: block`, dan alur `impact → plan → approve → build → review → done` pada project mini.

## Belum teruji (jujur)

- `ship` (commit/push/PR) dan cek `merged` lewat `gh` pada repo GitHub nyata; Plane MCP; `onboard`/`refresh` pada repo besar dan 14 repo (biaya belum diukur — jalankan satu service dulu); Graphify hanya diuji pada sampel kecil.
- Windows untuk inti harness: hook murni Node; perbaikan gagal-terbuka pada path berspasi diuji otomatis di Linux, belum di Windows.
- Modul executor: diuji manual di Windows 11 + Git Bash dengan agy 1.4.3 (penulisan dalam Scope, gate, audit). Belum teruji: skill `/harness:dispatch` end-to-end dengan Claude Code, `sandbox: false` dengan agy asli, dan alur pada repo nyata. Codex CLI belum didukung (adapter dari `AGENTS.md` ditunda sampai inti stabil).
- Pendaftaran plugin otomatis lewat `extraKnownMarketplaces` di `.claude/settings.json`: pemasangan lokal terverifikasi; jalur github privat tergantung kredensial git di mesinmu (`gh auth setup-git`). Cadangan manual: `claude plugin marketplace add devhardiyanto/agent-harness && claude plugin install harness@harness-marketplace`.
- Mode `-p`/headless: entri `permissions.allow` diabaikan sampai workspace dipercaya (dialog trust).

Lisensi: MIT. Atribusi: lihat `THIRD_PARTY.md`.
