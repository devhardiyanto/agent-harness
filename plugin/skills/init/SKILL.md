---
name: init
description: Bootstrap workspace multi-repo. Inventaris service, tentukan baseline (production/main), bangun knowledge L0–L3 dari baseline (bukan dari branch yang sedang di-checkout), usulkan checks per service, lalu serahkan ke manusia untuk verifikasi. Sekali per workspace; ulangi untuk service baru.
argument-hint: "[<service>|all]"
disable-model-invocation: true
---
# /harness:init

Masukan: `$ARGUMENTS` (kosong = lanjutkan tahap berikutnya yang belum selesai; `all` hanya setelah satu service diukur). Tujuan: sesi berikutnya langsung tahu project dan hanya memuat service yang disentuh, tanpa analisa ulang. Folder di root yang bukan `source-code/` (mis. `backup/`) tidak disentuh.

## Tahap 1 — inventaris dan baseline (nol token)
1. `node .claude/hooks/harness.mjs inventory` dan `node .claude/hooks/harness.mjs baseline all`. Tampilkan tabelnya apa adanya.
2. Hentikan dan tanyakan user lewat `AskUserQuestion` (satu panggilan, opsi konkret) bila: ada service baru yang belum di `harness.config.json` → `services` (user menambahkan manual; file itu dilindungi), baseline tidak ketemu (user mengisi `baseline: { "<svc>": "<branch>" }`), atau catatan "branch lokal berbeda dari origin" (tawarkan `baseline --fetch`; itu hanya `git fetch`).
3. Baseline otomatis = `origin/HEAD` → `production` → `main` → `master`. Checkout user (branch fitur, perubahan belum commit) **tidak disentuh**; analisa memakai worktree sementara.

## Tahap 2 — ukur dulu
4. Pilih satu service (kecil atau yang paling sering disentuh; bila ragu, yang pertama). Kerjakan Tahap 3 untuk service itu saja, lalu **berhenti**: minta user melihat `/usage` (biaya satu service) dan menjawab apakah lanjut `all` (`AskUserQuestion`: lanjut `all` / satu service lagi / berhenti).

## Tahap 3 — knowledge per service (L2, L3)
Ikuti `/harness:knowledge onboard <svc>` (langkah 1–6: worktree baseline → explorer → tulis `summary.md` + `patterns.md` dengan `source_commit` = SHA baseline → lint → lepas worktree). Satu service selesai hanya bila `lint-knowledge` bersih.

## Tahap 4 — peta, aturan, checks
5. `docs/_map.md` (L0): isi tabel service (stack, peran, aktif?, pemilik skema?, **branch baseline**), relasi antar-service, data bersama. Relasi dari bukti (env var base URL, klien HTTP, queue/topic, tabel bersama), bukan dari graph saja; dugaan diberi `?`; sitasi `service:path:baris` diperiksa manusia saat verifikasi.
6. Perbarui `.claude/rules/svc-<svc>.md`: stack, branch baseline, perintah yang **terbukti** di `summary.md` (bukan tebakan installer).
7. `node .claude/hooks/harness.mjs propose-checks all` → tampilkan blok `checks` hasilnya dan minta user menyalinnya ke `harness.config.json` secara manual (file itu dilindungi dari agent).

## Tahap 5 — verifikasi manusia (draft → verified)
8. Per service: `node .claude/hooks/harness.mjs knowledge-sample <svc>` menampilkan 6 klaim acak + potongan kodenya. User memeriksa; bila cocok ia mengetik `/harness:knowledge verify <svc>`. Hanya itu yang menaikkan status; lint yang bersih saja tidak cukup (lint membuktikan sitasi ada, bukan bahwa penjelasannya benar).

## Graph (L1) — opsional, nonaktif
Hanya bila `graphify.enabled: true` (user menyalakannya **setelah** uji terukur: lihat `GRAPHIFY-TRIAL.md` di folder skill ini). Graph hanya MENAMBAH daftar dampak; ketiadaan hasil di graph tidak membuktikan apa pun (wiring implisit Laravel/Nuxt/Go dan panggilan HTTP antar-service tidak tertangkap). Cara membangun: `/harness:knowledge onboard` langkah 7.

## Balasan chat (maks 5 baris)
Service ter-init: n/total · baseline: ... · UNKNOWN: n (di `_map.md`) · checks diusulkan: path/blok · berikutnya: `knowledge-sample` lalu `/harness:knowledge verify <svc>`
