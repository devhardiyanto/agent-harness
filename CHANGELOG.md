# Changelog

## 1.8.2
Perbaikan gerbang Stop, ditemukan saat uji di Claude Code 2.1.318:
- Gerbang hanya menahan sesi yang mengerjakan item itu. Sebelumnya penanda "baru disentuh" memakai mtime berkas, padahal `git clone/pull/switch/merge` menulis ulang mtime semua berkas, sehingga sesi yang hanya menjalankan `/harness:status` ikut ditolak berhenti karena item lama milik orang lain. Kini `post.mjs` mencatat item yang disentuh tiap sesi (tulis ke `docs/work/<slug>/...`, atau perintah shell yang menyebut slug) di `.harness/state/touched-<sesi>.json`, dan `stop.mjs` hanya memeriksa item itu.
- `stop_gate.recent_hours` tidak lagi dipakai (kunci dibiarkan di config demi kompatibilitas).
- `PILOT.md` 9.4: wizard `/agents` sudah dihapus di Claude Code 2.1.318; routing diperiksa lewat berkas agent dan `measure`.

## 1.8.1
Perbaikan installer `--update`, ditemukan saat uji di project nyata:
- `docs/knowledge/_init.md` (log `/harness:init` milik user) tidak lagi ditimpa templat. Yang diperbarui di folder data hanya berkas bawaan harness: `docs/work/_TEMPLATE/*`, `docs/work/README.md`, `docs/knowledge/README.md`.
- `services`, `layout`, dan rule `svc-*.md` tidak lagi dihapus bila foldernya tidak ada di `source-code/` pada mesin itu (klon sebagian, repo belum di-clone). Service tersebut dipertahankan dan dilaporkan sebagai peringatan; `doctor` tetap menandainya. Service baru di disk ditambahkan di belakang urutan lama.

## 1.8.0
Baru: `.harness/events.jsonl` (event bermakna, rotasi, redaksi), `harness.mjs watch` (TUI papan kerja, Node murni), `summary.md` otomatis saat `done`/`merged`, `harness.mjs gc` (rencana; `--yes` hanya manusia), `harness.mjs log` kini membaca event log. `progress.md` template punya bagian `## Decision log`. Tidak ada perubahan perilaku yang merusak dari 1.7.0.

Catatan: rencana awal menyebut TUI sebagai binary Go; diganti Node murni karena repo ini tanpa dependency dan tanpa langkah build/rilis binary per OS.

## 1.7.0
Perintah `/harness:*` tidak berpenanda versi. Nama skill lama tetap berlaku (`init impact plan approve build review ship status knowledge next quick summarize`); ditambah `align` dan `update`. Tag/branch cadangan lama (`harness-pre-v1-*`, `harness-v1`) tidak diubah demi kompatibilitas.

| nama lama / perilaku lama | sekarang |
|---|---|
| label produk "Harness v1" (plugin, judul, banner) | "Harness" |
| `impact → plan → approve` | `impact → align → plan → approve` (item standard butuh `aligned`; quick, `analysis`, `onboard` dikecualikan; matikan: `align.required: false`) |
| `brief.md` berisi tabel permintaan/tujuan | objective saja: Objective, Success criteria, Out of scope, Open questions |
| `explorer`/`reviewer`/`implementer` semua mewarisi model sesi | sesi utama Sonnet; `scout`, `runner` Haiku; `reviewer` Opus (`omitClaudeMd`) |
| test hanya dijalankan gate saat `done` | `run-checks` menulis `.harness/evidence/<slug>/tests.json`; hook `Stop` menolak berhenti tanpa bukti |
| tidak ada serah-terima antar sesi | `.harness/handoff.md` (PreCompact/SessionEnd) disuntik di SessionStart |
| update lewat branch `harness-update` + review | tetap tersedia; ditambah `harness update` (di `main`, `pull --ff-only`, commit `chore(harness): update to vX.Y.Z`, push hanya bila `update.autoPush`) |

Berubah yang perlu kamu tahu: `.claude/settings.json` kernel sekarang menetapkan `"model": "sonnet"` (menimpa pilihan model di settings project; ubah setelah update bila perlu). `.harness/` masuk `.gitignore`. Work item `draft` yang sedang berjalan butuh `align.md` sebelum di-approve (salin template dari `docs/work/_TEMPLATE/align.md`, atau set `align.required: false` sementara).

Cara update pertama ke 1.7.0 (root masih 1.6.x, belum punya perintah `update`): `git pull` di folder agent-harness, lalu `node <agent-harness>/scripts/harness-update.mjs <root>` (atau `--all` setelah root terdaftar). Skrip ini juga memperbarui plugin skill global (`--no-plugin` untuk melewati). Setelahnya `/harness:update` dan kalimat "tolong root nya di update ke main" tersedia di root itu.

Baru: WorkStore (`store.mjs`, backend lokal), `harness.mjs run-checks | log | measure | update`, config `store`, `align`, `stop_gate`, `handoff`, `update`.
