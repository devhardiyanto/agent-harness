# Tech Docs: Harness 1.15–1.19 "Sederhana"

Revisi 2 (2026-11-17): persona = spesialis per bidang, satu berkas per item, antislop disalin.

Pendamping [PRD.md](PRD.md). Semua yang belum diuji di Claude Code asli diberi tanda **[uji]**.

## 1. Titik kait Claude Code yang dipakai

| mekanisme | sumber | dipakai untuk | status |
|---|---|---|---|
| `statusLine` (`type: command`, `padding`, `refreshInterval`) | docs statusline | Pilar A1 | terdokumentasi: stdin JSON (`session_id`, `workspace.project_dir`, `context_window.used_percentage`, `model`), banyak baris, warna ANSI, tautan OSC 8, debounce 300 ms |
| Output style (`.claude/output-styles/*.md`, `outputStyle`, `keep-coding-instructions`) | docs output-styles | Pilar A4 | terdokumentasi; berupa instruksi, **tidak ditegakkan**. Yang wajib tetap di hook |
| Tool `AskUserQuestion` | tool bawaan | Pilar A2, A3, D1 | ada; **[uji]** apakah `PostToolUse` menerima `tool_response` berisi pilihan user |
| Hook `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart` | sudah dipakai | semua pilar | teruji di CI (Linux, Windows) |
| Skill `user-invocable: false` | docs skills | Pilar E2 | **[uji]** |

## 2. Berkas baru dan yang berubah

```
kernel/.claude/
  hooks/statusline.mjs      baru   A1: cetak 2 baris dari .harness/state/status.json; simpan session_name
  hooks/status.mjs          baru   menulis status.json (dipanggil post/prompt/stop/session)
  hooks/item.mjs            baru   B: baca/tulis berkas tunggal docs/work/<slug>.md
  hooks/store.mjs           ubah   B: satu antarmuka untuk bentuk folder (lama) dan berkas tunggal (baru)
  hooks/bidang.mjs          baru   C: tentukan bidang dari ucapan/service; pilih spesialis
  hooks/ask.mjs             baru   A2/A3/D1: bangun pertanyaan, catat jawaban
  hooks/growth.mjs          baru   D: pemanggilan rujukan, hitung pakai, laporan
  hooks/prompt.mjs          ubah   intent "menu", penanda bidang, suntik rujukan
  hooks/post.mjs            ubah   matcher AskUserQuestion → ask.record()
  hooks/lib.mjs             ubah   nextStep tanpa /harness:
  agents/backend.md         baru   C
  agents/frontend.md        baru   C
  agents/devops.md          baru   C
  agents/dba.md             ubah   C: label bidang
  skills/antislop*/         baru   F: salinan teks aturan 3.2.30 + lisensi
  output-styles/harness.md  baru   A4
  settings.json             ubah   statusLine, outputStyle, PostToolUse matcher
kernel/harness.config.json  ubah   blok tui, bidang per service, growth, antislop
kernel/AGENTS.md            ubah   E3
THIRD_PARTY.md              baru   F5
```

## 3. Status line (A1)

Skrip tidak menghitung apa pun; ia hanya membaca satu berkas kecil yang ditulis hook lain. Dengan begitu biayanya tetap dan tidak bergantung pada jumlah work item.

`.harness/state/status.json` (ditulis `status.mjs`, tidak di-commit):

```json
{ "v": 1, "at": "2026-11-16T09:40:00Z",
  "item": { "slug": "pub-01-sembunyikan-event", "status": "in-progress", "lane": "standard" },
  "ac": { "done": 3, "total": 5 }, "decisions": 1, "inbox": 2,
  "bidang": ["backend"], "growth": { "days": 23, "lessons": 14 }, "checks": "pass" }
```

Keluaran (lebar ≥ 80):

```
▌event  pub-01-sembunyikan-event  ● in-progress  AC 3/5  checks ✓
▌backend · 1 keputusan · Plane 2 · umur 23 h · 14 pelajaran · konteks 41%
```

Aturan: maksimal 2 baris; di bawah 80 kolom baris kedua dipendekkan; tanpa item = satu baris `▌event  tidak ada item aktif · ketik permintaanmu`. `refreshInterval: 5` agar inbox Plane ikut tampil saat sesi diam. Tema = peta peran→warna ANSI (`tui.theme`: `tenang`, `kontras`, `mono`); `mono` tanpa warna untuk terminal yang tidak mendukung. Bila `NO_COLOR` diset, warna dimatikan.

Status line juga menyimpan `session_name` dari stdin ke `.harness/state/session-name`, yang dipakai `/summarize` (1.14.1) untuk nama berkas. **[uji]** docs menyebut `session_name` hanya terisi untuk nama dari `--name`/`/rename` atau judul buatan AI, bukan nama tampilan bawaan; perlu dicek apakah nama `kata-kata-kata` yang tampil di `claude agents` ikut terkirim.

Konflik: user yang sudah punya `statusLine` di `~/.claude/settings.json` tertimpa oleh setelan proyek. `install --update` tidak menimpa `statusLine` yang sudah diisi user di proyek; `tui.statusline: false` mematikan.

## 4. Pemilih keputusan (A2) dan menu (A3)

Di berkas tunggal, baris D ada di bagian 3 (`## 3. Dampak & konfirmasi`); di item lama tetap di `align.md`. Di bawah, "berkas item" berarti salah satunya.

Alur data:

1. Hook Stop (keputusan terbuka) atau intent `menu` menghasilkan **naskah pertanyaan** dari kode: `ask.build(root, kind, slug)` → `{ id, header, question, options[] }`, disimpan di `.harness/state/ask/<id>.json` bersama hash-nya.
2. Agent diminta memanggil `AskUserQuestion` dengan naskah itu **apa adanya**.
3. `PostToolUse` (matcher `AskUserQuestion`) memanggil `ask.record()`: mencocokkan pertanyaan dengan naskah tersimpan (hash), lalu menulis jawaban ke berkas item (kolom jawaban baris D) atau menjalankan aksi menu.
4. Pertanyaan yang hash-nya tidak cocok dengan naskah mana pun **diabaikan** oleh `record` (tidak ada efek), jadi agent tidak bisa mengarang pertanyaan yang berakibat ke status.

Yang tidak pernah lewat pemilih: approve, merge, `gc --yes`, `verify-knowledge`. Itu tetap dari `UserPromptSubmit` (ketikan user), sesuai D21.

**[uji] M0:** (a) apakah `PostToolUse` terpanggil untuk `AskUserQuestion`; (b) bentuk `tool_response`; (c) perilaku saat user memilih "Other" dan mengetik bebas. Bila (a) gagal: cadangan = agent menjalankan `harness.mjs answer <id> <opsi>`, dan karena itu bisa dipalsukan agent, cadangan hanya dipakai untuk menu dan pelajaran, sedangkan keputusan D kembali ke ketikan user.

Batas `AskUserQuestion`: 1–4 pertanyaan per panggilan, 2–4 opsi per pertanyaan. Keputusan dengan lebih dari 4 opsi dipecah; lebih dari 4 keputusan dibagi per panggilan.

## 5. Satu berkas per item (B)

`docs/work/<slug>.md`:

```markdown
---
status: draft            # draft → approved → in-progress → in-review → done → merged
bidang: [backend]
services: [event-backend]
lane: standard
plane_id: null
---
## 1. Objective
Sembunyikan event organisasi whitelabel dari listing publik.

## 2. Penjelasan
Scope `listedPublicly()` dipakai di listing, pencarian, dan statistik. Tiga berkas di event-backend.

## 3. Dampak & konfirmasi
| service | bidang | yang berubah |
|---|---|---|
| event-backend | backend | scope, controller, view statistik |

| # | pertanyaan | opsi | jawaban |
|---|---|---|---|
| D1 | Berlaku untuk event lama? | a. ya, semua · b. hanya baru | a |

## 4. Eksekusi
- [x] AC1: listing tidak menampilkan event organisasi — bukti: tests/Feature/ListingTest.php::test_hidden
- [ ] AC2: ...

### Checks
### Tinjauan
verdict: clean
### PR
```

Aturan:

- `item.mjs` mem-parse bagian berdasarkan judul `## 1.`–`## 4.`; `store.mjs` mengembalikan objek yang sama (`objective`, `decisions`, `acs`, `review`, `fm`) untuk bentuk folder lama dan berkas tunggal, sehingga `gate`, `stop`, `recap`, `plane` tidak perlu tahu bentuknya.
- Gerbang dipetakan satu-satu: "plan setelah aligned" → baris AC di bagian 4 ditolak selama ada baris D tanpa jawaban di bagian 3; "plan beku setelah approved" → bagian 1–3 dan teks AC terkunci, hanya centang/bukti dan subbagian Checks/Tinjauan/PR yang boleh berubah; `amend` tetap menambah AC kecil.
- Bukti test tetap ditulis kode ke `.harness/evidence/<slug>/tests.json`.
- Item lama tidak dimigrasi; `harness.mjs item convert <slug>` tersedia untuk yang masih `draft` bila user mau.
- `summary.md` setelah merged tetap berkas terpisah di `docs/memory/` (bahan recall).

## 5b. Spesialis per bidang (C)

Penentuan bidang (urutan menang): ucapan user sesi ini ("backend: …", "ini frontend", "minta DBA …") → `services.<svc>.bidang` dari service yang disebut atau tercakup → tidak diketahui (kosong).

```json
"services": { "event-backend": { "bidang": "backend" }, "event-frontend": { "bidang": "frontend" } }
```

- `init` mengusulkan bidang per service dari stack di baseline (mis. Laravel/Go → backend, Nuxt/React → frontend); user mengonfirmasi.
- `UserPromptSubmit` menandai bidang lebih awal dan menulisnya ke `status.json`, jadi status line menampilkan bidang selama diskusi.
- Setelah `approved`, konteks yang disuntikkan berbunyi: "Eksekusi: panggil agent `<spesialis>` untuk service `<svc>`." Item multi-bidang: satu panggilan per pasangan service–bidang, berurutan; `dba` lebih dulu bila ada skema.
- Definisi spesialis: frontmatter `model: sonnet`, `omitClaudeMd: true`, tanpa `isolation`. Isi: batas bidang, knowledge yang harus dibaca, playbook bidang, skill antislop yang relevan.
- Penegakan: gerbang edit yang sekarang tidak berubah. **[uji] M0:** apakah masukan hook `PreToolUse` memuat identitas subagent. Bila ya, edit kode service berbidang dari sesi utama ditolak dengan pesan "panggil spesialis"; bila tidak, C2 tetap anjuran dan dihitung di `growth` (berapa item dieksekusi spesialis).
- Agent pembantu (`reviewer`, `runner`, `scout`, `explorer`) tidak berubah dan bukan persona.

## 6. Pengetahuan yang tumbuh (D)

| bagian | cara kerja | biaya model |
|---|---|---|
| C1 usulan pelajaran | saat `merged`: `learnFrom` (sudah ada) + koreksi user (`bukan itu`, pesan yang memuat "sudah pernah") + galat berulang dari `events.jsonl` → `pending.md` → pemilih terima/tolak | nol |
| C2 pemanggilan | `UserPromptSubmit`: skor kata prompt terhadap indeks (`docs/memory/INDEX.md`, nama+deskripsi playbook); ambang `growth.recall_min_score`; maksimal 2 baris "Rujukan: ref:<slug> — <satu kalimat>" | nol |
| C3 hitung pakai | `.harness/state/usage.json`: `{ "M3": { "n": 4, "last": "2026-11-12" } }`; bertambah saat entri disuntik lalu item selesai tanpa koreksi | nol |
| C4 laporan | `harness.mjs growth`: umur root (commit pertama `docs/memory`), jumlah memori/playbook/pelajaran, rasio rujukan terpakai, entri kandidat dibuang | nol |
| C5 koreksi berulang | dua koreksi dengan kata kunci sama dalam 30 hari → usulan playbook | nol |

Label bidang (D5): entri memori dan playbook menerima `bidang:` (diisi dari item asalnya). Spesialis menerima daftar playbook bidangnya saja; sesi utama menerima semuanya sebagai nama + deskripsi.

Tidak ada pemadatan diam-diam; membuang entri selalu usulan yang diputuskan user (prinsip Hermes "penuh = galat" dipertahankan).

## 7. Tanpa `/harness:` (E)

- `nextStep`, `formatOpen`, `formatDecision`, `handoff` → kalimat pendek. Test baru menjalankan tiap perintah pada project contoh dan menolak keluaran yang memuat `/harness:` selain `init`/`update`.
- Deprecation notice 1.13 untuk `/harness:approve|status|next|quick` diperluas ke semua skill alur; skill tetap berfungsi.
- `AGENTS.md`: bagian "Alur" ditulis sebagai keadaan dan pemicu (lihat artifact, halaman Alur), bukan daftar slash.

## 8. antislop (F)

Sumber: `miqdadbadjuber/anti-slop` 3.2.30, commit `35b54dc`. Struktur hulu yang ditiru: satu inti aturan bernomor (`R-01`–`R-40`, tiga tingkat, Delivery Gate) + skill per urusan yang merujuk nomor + folder `references/` untuk bahan panjang + `VERSION` + katalog yang dibuat otomatis dari skill.

| disalin ke `kernel/.claude/skills/` | ukuran | dimuat oleh |
|---|---|---|
| `antislop/` (inti) | 54 KB | `frontend`, dan item bertipe copy/dokumen |
| `antislop-ui/`, `antislop-human/`, `antislop-layoutmobile/` | 30 + 16 + 16 KB | `frontend` |
| `antislop-copywriting/` | 28 KB | item copy/dokumen |
| `antislop-code/` | 9 KB | `backend`, `frontend`, `devops` |

Perubahan pada salinan (dicatat di `THIRD_PARTY.md`):

- Dibuang: bagian "Already installed … how to update" (menyuruh `npx antislop-ai`), `contrast-mcp.py`, `contrast-check.py`, dan `Bash(python *)` dari `allowed-tools`.
- Dibuang: kata "Load always" dari deskripsi inti, agar tidak dimuat otomatis di tiap sesi.
- Bagian "Two Usage Modes" diganti rujukan ke `antislop.mode` di config (`during` | `after`), sehingga skill tidak membaca berkas di luar project.
- Berkas lisensi (`LICENSE`, `LICENSE-web-quality-skills`) ikut disalin apa adanya.

`check-repo` menolak bila salinan memuat `npx `, `curl `, `http` di luar daftar host rujukan (github.com, web.dev, w3.org, developer.chrome.com), atau `Bash(` di `allowed-tools`. Pembaruan hulu = salin ulang manual + pemeriksaan yang sama.

## 9. Config baru (bawaan)

```json
"tui":     { "statusline": true, "theme": "tenang", "ask": true, "menu": true },
"bidang":  { "enabled": true, "fallback_agent": "implementer" },
"growth":  { "recall": true, "recall_max": 2, "recall_min_score": 3, "prune_days": 60 },
"antislop":{ "enabled": true, "mode": "during", "types": ["ui", "copy", "docs"] }
```

Semua bisa dimatikan; mematikan mengembalikan perilaku 1.14.

## 10. Pengujian

| lapisan | isi |
|---|---|
| unit | `statusline` (lebar 60/80/120, tanpa item, `NO_COLOR`), parser berkas tunggal (tiap gerbang pada dua bentuk), penentuan bidang, `ask.build/record` (hash cocok, tidak cocok, opsi bebas), skor recall |
| hook | project contoh: Stop → naskah → PostToolUse palsu → `align.md` terisi; item berkas tunggal melewati draft → merged |
| regresi | tidak ada `/harness:` di keluaran; 223 test lama tetap lulus |
| kinerja | `bench` menambah `statusline`: p95 < 50 ms di Linux dan Windows |
| manual **[uji]** | daftar M0 di root `event`, dicatat di `docs/v1.15/SPIKE.md` |

## 11. Kompatibilitas dan rollback

Aditif. `install --update` menambah blok config tanpa menyentuh nilai user. Rollback = `harness-update --rollback` atau mematikan flag. Tidak ada migrasi data.
