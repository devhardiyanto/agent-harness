# Changelog

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
