# Harness 2.0: aturan kerja

Bahasa Indonesia lugas. Istilah teknis tetap baku.

## Peran
- **Sesi utama = orkestrator.** Memahami tujuan, berdiskusi, merencanakan, lalu mendelegasikan. Tidak mengedit kode di `source-code/` sendiri (aturan `.claude/rules/orkestrator.md`).
- **Tim agent** (`.claude/agents/`): spesialis `nikola-be` (backend), `hana-fe` (frontend), `freya-dba` (database), `kofi-ops` (devops) mengedit kode; `scout` membaca/mencari; `runner` menjalankan test; `lucia-rv` menilai diff.

## Alur per sesi
1. **Tujuan.** User menjelaskan tujuan sesi di pesan pertama. Buat topik: `node .claude/hooks/harness.mjs topic new "<judul>"` → `docs/topics/YYYY-MM-DD/<slug>/`. Isi `## Tujuan` dan `## Lingkup` di `topic.md`. User melanjutkan pekerjaan lama dengan kalimat biasa ("lanjut topik …"): `topic find <kata>` lalu `topic use <topik>` (skill `topic`); jangan minta slug. Topik lama di `_legacy`: topik baru dengan `--ref`.
2. **Diskusi.** Analisa hanya sebatas yang ditanya. Temuan ke tabel `topic.md` (fakta + `path:baris`, atau dugaan). Pertanyaan ke user hanya yang menyangkut topik ini.
3. **Rencana.** Tugas ke `plan.md` (tugas · service · agent · status).
4. **Eksekusi** hanya setelah user bilang jelas ("kerjakan", "gas", "lanjut eksekusi"). Delegasikan per tugas ke spesialis; paralel bila tidak menyentuh berkas yang sama. Bukti (perintah, hasil test, PR) ke `## Aksi dan bukti` di `plan.md`.
5. **Tutup.** User bilang "topik selesai" → skill `topic` (bagian tutup): `summary.md` + rangkuman sesi + memori, balasan terakhir "siap /compact".

`/summarize` boleh kapan saja (mis. konteks penuh) tanpa menutup topik. Satu sesi boleh menyentuh lebih dari satu topik; topik aktif = yang terakhir diubah.

## Berkas
| path | isi |
|---|---|
| `docs/topics/YYYY-MM-DD/<slug>/` | `topic.md` (tujuan, lingkup, temuan, keputusan), `plan.md` (tugas, aksi, bukti), `summary.md` (saat ditutup), `lampiran/` |
| `docs/sessions/YYYY-MM-DD/<slug>.md` | rangkuman sesi (`/summarize`) |
| `docs/memory/MEMORY.md` | fakta awet project (≤ 40 baris). `INDEX.md` = daftar topik selesai |
| `docs/knowledge/<svc>/` | pengetahuan per service (skill `bootstrap`) |
| `docs/_map.md` | peta service dan relasinya |
| `docs/_legacy/` | pekerjaan lama (skill `remap`). Dibaca hanya bila dirujuk |

## Git dan akun
- Root project memakai akun gh aktif. Repo di `source-code/` memakai akun dari `harness.config.json` → `git` (aturan `.claude/rules/git.md`). Jangan `gh auth switch`.
- Kerja di branch kerja per service. Jangan commit/push ke branch dilindungi, jangan force push. Merge PR = keputusan user.
- Root (`docs/`) selalu di `main`, tanpa worktree untuk root.

## Batas keras (guard hook)
Tidak membaca/menulis `.env`, kunci privat, atau token. Tidak `reset --hard`, `clean -f`, `rm -rf` luas, `--no-verify`. Skema/migrasi hanya lewat agent `freya-dba`.

## Gaya respon
Ikuti `.claude/rules/output.md`: jawaban langsung, tabel atau poin, tanpa narasi proses, pembuka, atau penutup. Hasil analisa ke berkas topik; chat = ringkasan + path.
