# Handoff: harness 2.0 (per 2026-11-24)

Sumber kebenaran: berkas di repo (`kernel/`, `CHANGELOG.md` 2.0.0, `README.md`). Riwayat 1.x: `CHANGELOG.md`, `ROADMAP.md`.

## 0. Pesan pembuka sesi baru
```
Konteks: lanjut pengembangan agent-harness. Baca docs/HANDOFF.md, README.md, dan CHANGELOG.md bagian 2.0.0.
Jawab ringkas dan objektif (kernel/.claude/rules/output.md). Satu PR per rilis; aku yang merge.
```

## 1. Status
| hal | nilai |
|---|---|
| Versi | **2.0.1** (2.0.0 merged lewat PR #73; 2.0.1 = git-auth untuk remote SSH beralias) |
| Test | `npm test` 48/48, `check-repo` 13/13 |
| Root project | astra, event, yhpa: 2.0.0 terpasang, `doctor` tanpa GAGAL (B4 astra selesai). Remote service = SSH alias (`github-kantor`, `github-pribadi`) |
| Akun git | astra → `nawa9nest-dev`; event, yhpa → `devhardiyanto` (diisi user di `harness.config.json` → `git`) |

## 2. Keputusan rombak (form 2026-11-24)
| # | keputusan |
|---|---|
| K1 | versi 2.0.0 |
| K2 | MVP: hook alur dihapus, topik, summarize, agent, gaya respon; remap dan bootstrap ikut |
| K3 | data lama dipindah skill remap; `_legacy` memakai `YYYY-MM-DD` |
| K4 | hook tinggal statusline + guard keamanan |
| K5 | CLI: doctor, update, (+ topic, remap, git-auth) |
| K6 | persen konteks dihapus dari status line |
| K7 | topik = `topic.md` + `plan.md` + `summary.md` + `lampiran/` |
| K8 | topik dibuat agent dari pesan pertama |
| K9 | eksekusi setelah user bilang jelas; aturan di `AGENTS.md` |
| K10 | "topik selesai" → summary + sessions + memori → "siap /compact" (user mengetik `/compact`) |
| K11 | fleksibel: topik boleh merujuk topik lama; `/summarize` kapan saja |
| K12 | memori = `MEMORY.md` + `INDEX.md` |
| K13 | `USER.md` tetap (di luar repo, tidak dipakai kode); playbooks/pending dibuang; akun git per service |
| K14 | `/summarize` → `docs/sessions/YYYY-MM-DD/<slug>.md` |
| K15 | > 2 bulan menurut tanggal di nama → `_legacy`, dipindah (bukan zip) |
| K16 | remap hanya `docs/` + state harness |
| K17 | `docs/reports`, `docs/topik` ikut remap; nama folder `topics` |
| K18 | antislop tetap, hanya manual |
| K19 | skill bootstrap manual per service |
| K20 | 2.0.4: nama orang dunia + singkatan peran: `nikola-be`, `hana-fe`, `freya-dba`, `kofi-ops`, `lucia-rv`; `scout`, `runner` tetap |
| K21 | sesi utama tidak mengedit kode; aturan di `rules/orkestrator.md` |
| K22 | `.codex/`, `.agents/` disarankan dihapus lewat skrip cetak remap |
| K23 | respon ringkas, lingkup sebatas yang ditanya |

## 3. Uji pertama (pagi 2026-11-25)
| # | di mana | langkah | lulus bila |
|---|---|---|---|
| 1 | terminal | merge PR → `harness-update-all` | 3 root ke 2.0.0, `doctor` tanpa GAGAL |
| 2 | root | isi `git` di `harness.config.json` → `node .claude/hooks/harness.mjs git-auth --apply` | semua service `terpasang`; `git push` di service tanpa `gh auth switch` |
| 3 | sesi claude | `/remap` | tabel rencana masuk akal; setelah setuju, `docs/_legacy/INDEX.md` ada; commit sendiri |
| 4 | sesi claude | pesan pertama berisi tujuan | topik dibuat di `docs/topics/<hari ini>/<slug>/`, status line `topik: …` |
| 5 | sesi | "topik selesai" | `summary.md`, `docs/sessions/<hari ini>/<slug>.md`, baris di `docs/memory/INDEX.md`, balasan "siap /compact" |

## 4. Terbuka
| # | hal |
|---|---|
| T1 | ✅ 2.0.4: agent bernama orang (`nikola-be`, `hana-fe`, `freya-dba`, `kofi-ops`, `lucia-rv`) |
| T6 | ✅ status line kapsul + badge ponytail terlihat benar di Windows Terminal (3 root) |
| T7 | `GH_TOKEN="$(gh auth token --user nawa9nest-dev)"` di sesi astra menghasilkan 401 (laporan agent 2026-11-25); butuh cek di mesin user |
| T4 | `git-auth` di Windows belum diuji nyata; GitLab belum didukung |
| T5 | bootstrap knowledge: format dan cakupan masih bisa didiskusikan |

## 5. Peta teknis
| berkas | isi |
|---|---|
| `kernel/.claude/hooks/guard.mjs` | satu-satunya hook (PreToolUse) |
| `kernel/.claude/hooks/statusline.mjs` | status line |
| `kernel/.claude/hooks/harness.mjs` | CLI: doctor, update, topic, remap, git-auth |
| `kernel/.claude/hooks/{topics,remap,gitauth,lib}.mjs` | logika |
| `kernel/.claude/skills/{topic,summarize,remap,bootstrap}` | skill proyek |
| `kernel/.claude/rules/{output,orkestrator,git,security,minimalis,knowledge}.md` | aturan |
| `kernel/.claude/agents/` | nikola-be, hana-fe, freya-dba, kofi-ops, lucia-rv, scout, runner |
| `plugin/skills/{init,update}` | skill global |
| `test/v200.test.mjs` | test 2.0 |

## 6. Aturan kerja pengembangan
| # | aturan |
|---|---|
| A1 | Bahasa Indonesia, ringkas, objektif |
| A2 | Satu PR per rilis; user yang merge; tanpa force push |
| A3 | Commit/PR tanpa model identifier selain baris attribution |
| A5 | Jangan membaca `.env` atau nilai token |
| A9 | Temuan uji → patch 2.0.x dengan test |
