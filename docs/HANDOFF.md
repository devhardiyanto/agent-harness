# Handoff: pengembangan harness menuju 2.0 (per 2026-11-22, harness 1.24.0)

Dokumen ini adalah konteks lengkap untuk melanjutkan pekerjaan di sesi chat lain. Sumber kebenaran tetap berkas di repo: `ROADMAP.md`, `CHANGELOG.md`, `kernel/`, `test/`. Berkas ini merangkum dan menunjuk ke sana.

## 0. Cara memakai di sesi baru

Buka sesi **Claude Code on the web** baru dengan repo `devhardiyanto/agent-harness` (branch `main`, setelah PR handoff di-merge), lalu tempel pesan pembuka ini:

```
Konteks: aku melanjutkan pengembangan harness dari sesi Claude Code on the web sebelumnya.
Baca dulu docs/HANDOFF.md (seluruhnya), ROADMAP.md §10 dan §12, dan bagian 1.22.6–1.24.0 di CHANGELOG.md.
Kalau docs/HANDOFF.md belum ada di main, ambil dari branch claude/loving-dirac-zepqcu.

Aturan (detail di HANDOFF §2):
- Jawab dalam bahasa Indonesia, pakai tabel keputusan dan label GAS / GAS DENGAN CATATAN / CEK DULU / JANGAN DULU.
- Satu PR per rilis; aku yang merge, kamu tidak pernah merge dan tidak force push.
- GitHub hanya lewat `gh api` REST.
- Saat aku kirim screenshot uji dari project event, kamu hanya MENILAI terhadap kolom "lulus bila";
  jangan menjawab pemilih atau pertanyaan agent harness atas namaku.
- Setiap temuan uji dikumpulkan sebagai patch 1.24.x (HANDOFF §5), dikerjakan setelah uji event selesai.

Posisi sekarang: HANDOFF §7 langkah 7b (aku akan mengetik "setuju" di event lalu kirim screenshot).
Balas dulu dengan ringkasan 5 baris: versi, posisi uji, fitur masuk 1.24.1, bug terbuka, langkah berikutnya.
```

## 1. Status saat ini

| hal | nilai |
|---|---|
| Versi terakhir rilis | **1.24.0** (PR #70 merged, `main` di `835ee34`, tag v1.24.0, CI hijau) |
| Branch kerja | `claude/loving-dirac-zepqcu` (disinkronkan ke `main` setelah tiap merge) |
| Gerbang pilot §10 | **HIJAU** (sandbox + GitHub asli di event, PR `devhardiyanto/workload-event#95`) |
| Arah 2.0 | Orkestrator lokal tanpa Plane (D37–D39, `ROADMAP.md` §12) |
| Project terpasang 1.24.0 | event (doctor OK), yhpa (doctor OK), astra (**doctor GAGAL**, belum dicek), sandbox (dilewati: ada perubahan tracked di `main`) |
| Model bawaan project | Opus 5.5, effort medium (`kernel/.claude/settings.json`: `model`, `effortLevel`), terbukti di event |
| Artifact roadmap | https://claude.ai/artifact/1cTW4D9fSfezHgqESfs3Vy (belum diperbarui sejak D37–D39) |

## 2. Aturan kerja yang disepakati

| # | aturan |
|---|---|
| A1 | Jawaban dalam bahasa Indonesia lugas; tabel keputusan; label **GAS / GAS DENGAN CATATAN / CEK DULU / JANGAN DULU** |
| A2 | Satu PR per rilis (boleh digabung bila user minta). **User yang merge**; agent tidak pernah merge, tidak force push |
| A3 | Commit/PR tanpa model identifier selain baris attribution |
| A4 | Saat uji di project user: agent penilai **tidak menjawab** pemilih atau pertanyaan agent harness; hanya menilai screenshot terhadap ekspektasi |
| A5 | Jangan membaca `.env` atau nilai token. Nilai `ENCRYPTION_KEY` lokal event pernah terlihat di screenshot: jangan dipakai ulang di staging/production |
| A6 | Root `harness.config.json`, `.claude/hooks/`, `.claude/settings.json` di project user hanya diubah user (lewat `harness-update-all`) |
| A7 | GitHub hanya lewat REST `gh api` (porcelain/GraphQL ditolak di sesi cloud) |
| A8 | Root project dibersihkan dengan **commit**, bukan stash (stash menghilangkan `plan.md` item aktif) |
| A9 | Setiap temuan uji → patch rilis 1.24.x, dengan test |

## 3. Alur rilis

1. `node scripts/bump.mjs X.Y.Z --no-check`
2. Tulis bagian `## X.Y.Z` di `CHANGELOG.md`
3. `npm test` (memakai `--import ./test/setup.mjs`; `HARNESS_BENCH` mematikan `emit`)
4. `node scripts/check-repo.mjs` (13 cek)
5. Commit, push ke branch kerja, buka PR. User merge, lalu di mesin user: `cd ~/agent-harness && git pull` → `harness-update-all`

Hasil terakhir: `npm test` 295/295, check-repo 13/13.

## 4. Roadmap sisa menuju 2.0.0 (`ROADMAP.md` §12)

| # | task | status | isi |
|---|---|---|---|
| R1 | cabut Plane | ✅ 1.23.0 | — |
| O1 | rencana eksekusi tertulis | ✅ 1.24.0 | `### Rencana eksekusi`, `harness.mjs tasks <slug> --md`, gate menolak edit kode sebelum ada |
| O2 | pelacakan per tugas | belum | status tugas diperbarui dari laporan sub-agent (audit `agent_id`); status line `tugas n/m`. Dikerjakan bila user meminta |
| O3 | sesi utama hanya mengorkestrasi | belum | `bidang.enforce` bawaan menyala setelah O1–O2 stabil |
| O4 | ukuran | belum | ≥ 90% edit kode oleh spesialis yang benar; ketikan user per item ≤ 3 |
| R2 | perampingan | belum | slash selain `init`/`update` dibuang; `AGENTS.md` ≤ 60 baris |
| R3 | bentuk lama dibuang | belum | `bentuk: folder` + `align.md` lama → migrasi ke `plan.md` tunggal |
| R4 | panduan upgrade + rollback | belum | per root |
| R5 | gerbang rilis | belum | §10 hijau di **yhpa, event, astra** |

Urutan: O2 → O3 → O4 → R2 → R3 → R4 → R5 → **2.0.0**.

## 5. Fitur masuk (rilis berikutnya)

### 1.24.1 (patch dari uji event 2026-11-22; dikumpulkan dulu, dikerjakan setelah uji event selesai, pilihan user "A")

| # | perubahan | berkas | test |
|---|---|---|---|
| F1 (B1) | `align ok` **ditolak** bila `openDecisions > 0` (baris D tanpa jawaban) atau ada klaim `dugaan`; tampilkan tabel keputusan, jangan tulis `aligned` | `kernel/.claude/hooks/prompt.mjs` handler `ma` (sekitar baris 186–216); `readAlign` di `lib.mjs:375-388` sudah menghitung `openDecisions`/`doubtful` | D kosong → ditolak; semua D terjawab → aligned; klaim `belum diketahui` (H2) tidak menahan |
| F2 (B2) | Edit yang ditolak hook tidak diulang dengan isi sama: ikuti petunjuk penolakan atau laporkan ke user | persona/`stop.mjs` atau `gate.mjs` (pesan penolakan memuat "jangan ulangi edit yang sama") | pesan penolakan memuat petunjuk |
| F3 | Nomor baris D berurutan (terlihat D1, D2, D4, D3) | `lib.mjs` `decisionRows`/`formatDecision` atau skill align | urutan output menurut nomor |
| F4 (CEK DULU) | Opsi basis branch di D1 tidak menawarkan `staging` padahal PR #95 masuk `staging`; cek apakah skill align/plan membaca `protected_branches`/baseline dengan benar | skill align/plan, `harness.config.json` service | — |
| + | temuan lain dari sisa uji event (bagian 7) | | |

### Opsional (belum diminta)

| # | isi |
|---|---|
| X1 | Slug topik memuat kata kerja ("analisa-fitur-…"); kosmetik |
| X2 | Perbarui artifact roadmap ke D37–D39 + 1.24.x |

## 6. Bug dan temuan terbuka

| # | temuan | bukti | status |
|---|---|---|---|
| B1 | `align ok` menutup align walau keputusan D belum dijawab | event, item `analisa-fitur-promo-dan-invitation-code`: `align ok` pertama sebelum jawaban → `aligned_at 16:46`; kode `prompt.mjs` hanya cek `bertentangan` + ronde | → F1 |
| B2 | Agent mengulang edit yang ditolak `gate.mjs` 4× | screenshot event | → F2 |
| B3 | Akibat B1: kolom jawaban tabel D di bagian 3 bergeser (`\|\|`), tidak bisa dirapikan karena beku | jawaban utuh di `### Decision log` | ikut terselesaikan oleh F1 |
| B4 | astra: `doctor: GAGAL` setelah update ke 1.24.0 | keluaran `harness-update-all` | **CEK DULU**: minta screenshot `node .claude/hooks/harness.mjs doctor` di astra (perlu untuk R5) |
| B5 | sandbox tidak terupdate: "ada perubahan tracked di main" | keluaran `harness-update-all` | sisa uji; commit atau `sandbox.mjs` reset |

Riwayat bug yang sudah ditutup (H1–H9, N1–N9, E1–E5, T1–T20): lihat `CHANGELOG.md` 1.22.6–1.22.11.

## 7. Uji event yang sedang berjalan (project `D:\dev\event`, harness 1.24.0)

Item uji: **`2026-11-22-analisa-fitur-promo-dan-invitation-code`** (cross-repo: event-backend + event-frontend, AC 0/9, status `draft`, align sudah `aligned` karena B1). Topik asal: `docs/topics/2026-11-22-analisa-fitur-promo-dan-invitation-code.md`. Jawaban user: D1 a (branch dari `fix/pulihkan-stok-order-berakhir`, PR bertumpuk), D2 a (`FOR UPDATE`), D3 a (T6/T7 di luar lingkup), D4 a (refund mengembalikan kuota).

| # | di mana | langkah | screenshot | lulus bila | hasil |
|---|---|---|---|---|---|
| 1 | terminal | `harness-update-all` | keluaran | event 1.24.0 tanpa penolakan | ✅ |
| 2 | terminal, root event | `node .claude/hooks/harness.mjs doctor` | tabel | tanpa GAGAL; satu INFO `plane` | ✅ |
| 3 | sesi claude baru | buka sesi | banner + status line | `Opus 5.5 with medium effort`, tanpa `Plane N` | ✅ |
| 4 | sesi | `tolong analisa feature promo/invitation code…` (tanpa `topik:`) | jawaban + status line | topik dibuat, status line `topik: …` (H1) | ✅ |
| 5 | sesi | `jadikan item <topik>` | tabel keputusan + pemilih | banner Keputusan; Berikutnya di luar tabel (H3); opsi `belum tahu` bila ada klaim (H2) | ✅ dengan catatan (H2 N/A: tidak ada pemilih klaim; F3, F4) |
| 6 | sesi | jawab D / pilih `belum tahu` | hasil tercatat | klaim `belum diketahui … risiko terbuka` | N/A |
| 7a | sesi | `align ok <slug>` | jawaban hook | ditolak bila D terbuka; aligned setelah dijawab | ❌ B1 |
| 7b | sesi | `setuju <slug>` (keputusan user setelah membaca plan.md) | banner Persetujuan + status | `approved` | **berikutnya** |
| 8 | sesi | `kerjakan <slug>` | 8a tabel Rencana eksekusi; 8b pemanggilan spesialis | `### Rencana eksekusi` tertulis, spesialis dipanggil tanpa `lanjutkan` (O1, H5) | |
| 9 | sesi | bila agent bertanya di tengah build | pesan sebelum pemilih | blok ⚠ BUTUH KEPUTUSANMU sebelum pemilih (H8) | ✅ sebagian (muncul di rekap persetujuan) |
| 10 | sesi | bila gate `done` gagal karena baseline: `terima baseline <slug>` | 10a penolakan; 10b pesan hook; 10c `gate.md` | DITERIMA, item `done` (H7) | |
| 11 | sesi | `push PR + merge <slug>` | hasil akhir | PR merged; tanpa "Stop hook reported a problem" yang hanya usulan memori (H9) | |
| 12 | terminal | `node .claude/hooks/harness.mjs pilot --hours 6` | tabel | S1–S4 OK | |

Catatan item uji: kode dianalisa dari branch `feat/favicon-whitelabel` (bukan production/staging); cakupan seluruh C1–C9 (lebih besar dari skenario uji, build lama). Di `Belum selesai` ada usulan memori lama P1 (2026-11-19, favicon).

## 8. Pekerjaan terbuka di project event (bukan harness)

| # | hal | status |
|---|---|---|
| E1 | R3 dari topik `titik-rawan-create-order-event`: bayar setelah order expired | keputusan bisnis user |
| E2 | Uji di staging untuk PR #95 + stok yang sudah terlanjur bocor | terbuka |
| E3 | Pelajaran P5/P6 (`ingat P5,P6`) | belum disimpan |
| E4 | Branch `fix/pulihkan-stok-order-berakhir` belum merged; item promo bertumpuk di atasnya (D1 a) | terbuka |

## 9. Peta teknis singkat

| konsep | lokasi |
|---|---|
| Hook Stop (exit 2 menahan giliran; `stop_hook_active`, `last_assistant_message`) | `kernel/.claude/hooks/stop.mjs` (`problemsFor`, `recapFor`: H5a/H5b/H9) |
| UserPromptSubmit (bahasa pendek user: setuju, align ok, terima baseline, update, ship, topik) | `kernel/.claude/hooks/prompt.mjs` |
| PreToolUse Edit/Write (skema, beku setelah approved, rencana eksekusi O1, `gate_accept*` hanya hook) | `kernel/.claude/hooks/gate.mjs` |
| PreToolUse Bash (plan.md lewat shell ditolak, commit di main, O1) | `kernel/.claude/hooks/guard-bash.mjs` |
| PostToolUse AskUserQuestion (jawaban pemilih dicatat; opsi klaim benar/salah/belum tahu) | `kernel/.claude/hooks/ask.mjs` |
| Fungsi bersama (`readAlign`, `decisionRows`, `formatDecision`, `planTasks`, `gateAccept`, `checkDone`, `latestTouchedSlugs`) | `kernel/.claude/hooks/lib.mjs` |
| Gate `done` (`runGate`, `gate.md`, DITERIMA) | `kernel/.claude/hooks/delivery.mjs` |
| CLI (`doctor`, `pilot`, `open --mine`, `tasks`, `decide`, `next`, `topic`, `memory`) | `kernel/.claude/hooks/harness.mjs` |
| Template item tunggal | `kernel/docs/work/_TEMPLATE/tunggal.md` |
| Aturan agent | `kernel/AGENTS.md`, `kernel/.claude/rules/{persona,output,security,minimalis}.md` |
| Skill | `plugin/skills/*/SKILL.md` (build langkah 4a = rencana eksekusi) |
| Sandbox uji (gh tiruan) | `scripts/sandbox.mjs` |
| Test per rilis | `test/v<versi>.test.mjs` (mis. `v1240`, `v12210`, `v1229`) |

Status item: `draft → approved → in-progress → in-review → done → merged`. Bagian 1–3 dan teks AC beku setelah approved; bagian 3 beku setelah aligned (turun ke `align: open` untuk mengubah).

## 10. Riwayat rilis terakhir (detail di `CHANGELOG.md`)

| versi | isi |
|---|---|
| 1.22.6 | konteks LANJUTAN menilai objective; persona G-17; sandbox reset aman |
| 1.22.7 | `latestTouchedSlugs`, `open --mine` |
| 1.22.8 | label Keputusan/Persetujuan di `formatOpen`; S4 ✅ |
| 1.22.9 | H1 saran topik, H2 opsi `belum tahu`, H3 baris kosong sebelum Berikutnya, H4 `open --mine` sesi terakhir |
| 1.22.10 | H5 build tidak berhenti, H6 vitest `--run`, H7 `terima baseline`, H8 banner sebelum pemilih |
| 1.22.11 | H9 rekap hanya usulan memori tidak menahan; model Opus 5.5 medium; §10 HIJAU |
| 1.23.0 | R1 Plane dicabut |
| 1.24.0 | O1 rencana eksekusi + `harness.mjs tasks` |
