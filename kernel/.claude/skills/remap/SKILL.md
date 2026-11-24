---
name: remap
description: Merapikan struktur docs/ lama ke bentuk 2.0 (topics, sessions, _legacy) dan menyarankan folder usang untuk dihapus. Hanya saat user memintanya ("remap", "rapikan folder", "/remap").
disable-model-invocation: true
---
# Remap

Aturan: bertanggal < `remap.legacy_months` (bawaan 2) bulan → bentuk baru; lebih tua → `docs/_legacy/YYYY-MM-DD/<slug>/` + `docs/_legacy/INDEX.md`. Tanggal dari nama berkas; tanpa tanggal: commit git terakhir.

| asal | baru (< 2 bulan) | lama (≥ 2 bulan) |
|---|---|---|
| `docs/work/<tgl-slug>/` | `docs/topics/<tgl>/<slug>/` | `docs/_legacy/<tgl>/<slug>/` |
| `docs/topics/<tgl-slug>.md` (datar), `docs/topik/*` | `docs/topics/<tgl>/<slug>/topic.md` | `_legacy/<tgl>/<slug>/topic.md` |
| `docs/sessions/*` (semua format nama) | `docs/sessions/<tgl>/<slug>.md` | `_legacy/<tgl>/<slug>/session.md` |
| `docs/reports/<kat>/*` | `docs/topics/<tgl>/<slug>/lampiran/` | `_legacy/<tgl>/<slug>/lampiran/` |
| `docs/_arsip`, `docs/_archive`, `docs/init`, `docs/work/_TEMPLATE`, `memory/pending.md`, `memory/playbooks` | `docs/_legacy/_lama/` | sama |

Folder lain di `docs/` (mis. `md/`, `phases/`, `api/`) tidak disentuh. State harness 1.x dan folder tool lain (`.harness/`, `.claude/state/`, `.claude/audit/`, `.codex/`, `.agents/`, `.wt/`, `.tmp/`) hanya dicetak sebagai skrip hapus; tidak dijalankan.

## Langkah
1. Perubahan tracked di root belum di-commit? (`git status --short`) → minta user commit dulu, berhenti.
2. `node .claude/hooks/harness.mjs remap`. Tampilkan tabel ringkas apa adanya; rincian per berkas cukup disebut jumlahnya kecuali user minta.
3. Tanya satu kali: terapkan? (rekomendasi: ya).
4. Setuju → `node .claude/hooks/harness.mjs remap --apply`. Lalu `git status --short | head -20`.
5. Balas: jumlah dipindah · path `docs/_legacy/INDEX.md` · skrip hapus (blok bash dari keluaran, untuk dijalankan user sendiri) · "tinjau lalu commit".

Jangan menghapus apa pun dan jangan commit.
