# Tech Docs: Harness 1.15 "Sederhana"

Pendamping [PRD.md](PRD.md). Semua yang belum diuji di Claude Code asli diberi tanda **[uji]**.

## 1. Titik kait Claude Code yang dipakai

| mekanisme | sumber | dipakai untuk | status |
|---|---|---|---|
| `statusLine` (`type: command`, `padding`, `refreshInterval`) | docs statusline | Pilar A1 | terdokumentasi: stdin JSON (`session_id`, `workspace.project_dir`, `context_window.used_percentage`, `model`), banyak baris, warna ANSI, tautan OSC 8, debounce 300 ms |
| Output style (`.claude/output-styles/*.md`, `outputStyle`, `keep-coding-instructions`) | docs output-styles | Pilar A4 | terdokumentasi; berupa instruksi, **tidak ditegakkan**. Yang wajib tetap di hook |
| Tool `AskUserQuestion` | tool bawaan | Pilar A2, A3, C1 | ada; **[uji]** apakah `PostToolUse` menerima `tool_response` berisi pilihan user |
| Hook `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart` | sudah dipakai | semua pilar | teruji di CI (Linux, Windows) |
| `enabledPlugins`, `extraKnownMarketplaces` di `.claude/settings.json` | docs settings | Pilar E | terdokumentasi; berlaku setelah folder dipercaya |
| Skill `user-invocable: false` | docs skills | Pilar D2 | **[uji]** |

## 2. Berkas baru dan yang berubah

```
kernel/.claude/
  hooks/statusline.mjs      baru   A1: cetak 2 baris dari .harness/state/status.json
  hooks/status.mjs          baru   menulis status.json (dipanggil post/prompt/stop/session)
  hooks/persona.mjs         baru   B: resolusi persona + aturan mempersempit
  hooks/ask.mjs             baru   A2/A3/C1: bangun pertanyaan, catat jawaban
  hooks/growth.mjs          baru   C2–C4: pemanggilan ingatan, hitung pakai, laporan
  hooks/prompt.mjs          ubah   intent "menu", "mode: x"; suntik ingatan
  hooks/post.mjs            ubah   matcher AskUserQuestion → ask.record()
  hooks/gate.mjs            ubah   konsultasi persona sebelum izin edit
  hooks/lib.mjs             ubah   nextStep tanpa /harness:
  output-styles/harness.md  baru   A4
  settings.json             ubah   statusLine, outputStyle, PostToolUse matcher
kernel/harness.config.json  ubah   blok tui, persona, growth, antislop
kernel/AGENTS.md            ubah   D3
THIRD_PARTY.md              baru   E3
```

## 3. Status line (A1)

Skrip tidak menghitung apa pun; ia hanya membaca satu berkas kecil yang ditulis hook lain. Dengan begitu biayanya tetap dan tidak bergantung pada jumlah work item.

`.harness/state/status.json` (ditulis `status.mjs`, tidak di-commit):

```json
{ "v": 1, "at": "2026-11-16T09:40:00Z",
  "item": { "slug": "pub-01-sembunyikan-event", "status": "in-progress", "lane": "standard" },
  "ac": { "done": 3, "total": 5 }, "decisions": 1, "inbox": 2,
  "persona": "pembangun", "growth": { "days": 23, "lessons": 14 }, "checks": "pass" }
```

Keluaran (lebar ≥ 80):

```
▌event  pub-01-sembunyikan-event  ● in-progress  AC 3/5  checks ✓
▌pembangun · 1 keputusan · Plane 2 · umur 23 h · 14 pelajaran · konteks 41%
```

Aturan: maksimal 2 baris; di bawah 80 kolom baris kedua dipendekkan; tanpa item = satu baris `▌event  tidak ada item aktif · ketik permintaanmu`. `refreshInterval: 5` agar inbox Plane ikut tampil saat sesi diam. Tema = peta peran→warna ANSI (`tui.theme`: `tenang`, `kontras`, `mono`); `mono` tanpa warna untuk terminal yang tidak mendukung. Bila `NO_COLOR` diset, warna dimatikan.

Status line juga menyimpan `session_name` dari stdin ke `.harness/state/session-name`, yang dipakai `/summarize` (1.14.1) untuk nama berkas. **[uji]** docs menyebut `session_name` hanya terisi untuk nama dari `--name`/`/rename` atau judul buatan AI, bukan nama tampilan bawaan; perlu dicek apakah nama `kata-kata-kata` yang tampil di `claude agents` ikut terkirim.

Konflik: user yang sudah punya `statusLine` di `~/.claude/settings.json` tertimpa oleh setelan proyek. `install --update` tidak menimpa `statusLine` yang sudah diisi user di proyek; `tui.statusline: false` mematikan.

## 4. Pemilih keputusan (A2) dan menu (A3)

Alur data:

1. Hook Stop (keputusan terbuka) atau intent `menu` menghasilkan **naskah pertanyaan** dari kode: `ask.build(root, kind, slug)` → `{ id, header, question, options[] }`, disimpan di `.harness/state/ask/<id>.json` bersama hash-nya.
2. Agent diminta memanggil `AskUserQuestion` dengan naskah itu **apa adanya**.
3. `PostToolUse` (matcher `AskUserQuestion`) memanggil `ask.record()`: mencocokkan pertanyaan dengan naskah tersimpan (hash), lalu menulis jawaban ke `align.md` (kolom jawaban baris D) atau menjalankan aksi menu.
4. Pertanyaan yang hash-nya tidak cocok dengan naskah mana pun **diabaikan** oleh `record` (tidak ada efek), jadi agent tidak bisa mengarang pertanyaan yang berakibat ke status.

Yang tidak pernah lewat pemilih: approve, merge, `gc --yes`, `verify-knowledge`. Itu tetap dari `UserPromptSubmit` (ketikan user), sesuai D21.

**[uji] M0:** (a) apakah `PostToolUse` terpanggil untuk `AskUserQuestion`; (b) bentuk `tool_response`; (c) perilaku saat user memilih "Other" dan mengetik bebas. Bila (a) gagal: cadangan = agent menjalankan `harness.mjs answer <id> <opsi>`, dan karena itu bisa dipalsukan agent, cadangan hanya dipakai untuk menu dan pelajaran, sedangkan keputusan D kembali ke ketikan user.

Batas `AskUserQuestion`: 1–4 pertanyaan per panggilan, 2–4 opsi per pertanyaan. Keputusan dengan lebih dari 4 opsi dipecah; lebih dari 4 keputusan dibagi per panggilan.

## 5. Persona (B)

Resolusi (urutan menang): ketikan `mode: x` sesi ini → status item sesi ini → `persona.default` di config.

| status item | persona |
|---|---|
| tanpa item / `draft` | `perancang` |
| `approved`, `in-progress` | `pembangun` |
| `in-review` | `peninjau` |
| `done` | `pengirim` |

`persona.mjs` mengekspor `allows(persona, action)`; `gate.mjs` memanggilnya **setelah** pemeriksaan yang ada, sehingga hasil akhirnya = gerbang lama **DAN** persona. Tidak ada jalur di mana persona mengubah `deny` menjadi `allow` (dijaga test matriks).

Persona juga memilih agent bawaan (`pembangun` → `implementer`, `peninjau` → `reviewer`) dan baris status line. Gaya keluaran tetap satu (`harness`); persona hanya menambah satu paragraf konteks di `UserPromptSubmit`.

## 6. Pengetahuan yang tumbuh (C)

| bagian | cara kerja | biaya model |
|---|---|---|
| C1 usulan pelajaran | saat `merged`: `learnFrom` (sudah ada) + koreksi user (`bukan itu`, pesan yang memuat "sudah pernah") + galat berulang dari `events.jsonl` → `pending.md` → pemilih terima/tolak | nol |
| C2 pemanggilan | `UserPromptSubmit`: skor kata prompt terhadap indeks (`docs/memory/INDEX.md`, nama+deskripsi playbook); ambang `growth.recall_min_score`; maksimal 2 baris "Rujukan: ref:<slug> — <satu kalimat>" | nol |
| C3 hitung pakai | `.harness/state/usage.json`: `{ "M3": { "n": 4, "last": "2026-11-12" } }`; bertambah saat entri disuntik lalu item selesai tanpa koreksi | nol |
| C4 laporan | `harness.mjs growth`: umur root (commit pertama `docs/memory`), jumlah memori/playbook/pelajaran, rasio rujukan terpakai, entri kandidat dibuang | nol |
| C5 koreksi berulang | dua koreksi dengan kata kunci sama dalam 30 hari → usulan playbook | nol |

Tidak ada pemadatan diam-diam; membuang entri selalu usulan yang diputuskan user (prinsip Hermes "penuh = galat" dipertahankan).

## 7. Tanpa `/harness:` (D)

- `nextStep`, `formatOpen`, `formatDecision`, `handoff` → kalimat pendek. Test baru menjalankan tiap perintah pada project contoh dan menolak keluaran yang memuat `/harness:` selain `init`/`update`.
- Deprecation notice 1.13 untuk `/harness:approve|status|next|quick` diperluas ke semua skill alur; skill tetap berfungsi.
- `AGENTS.md`: bagian "Alur" ditulis sebagai keadaan dan pemicu (lihat artifact, halaman Alur), bukan daftar slash.

## 8. antislop (E)

```json
"extraKnownMarketplaces": { "anti-slop": { "source": { "source": "github", "repo": "miqdadbadjuber/anti-slop" } } },
"enabledPlugins": { "antislop@anti-slop": true }
```

- Dipasang oleh `install`/`update` hanya bila `antislop.enabled: true`; `antislop.ref` mengunci commit. **[uji]** apakah marketplace mendukung pengunci commit; bila tidak, kunci dicatat dan `doctor` memperingatkan saat hulu berubah.
- `harness.config.json` → `antislop.types: ["ui","copy","docs"]`: hanya item bertipe itu yang mendapat baris gate "antislop" dan instruksi memuat skill antislop.
- Tidak ada teks antislop yang disalin ke repo. `THIRD_PARTY.md` mencatat nama, lisensi (MIT), URL, dan commit.
- Bentuk ID aturan antislop belum saya pastikan dari halaman repo (README menyebut "40 aturan dalam tiga tingkat"); format kutipan ditetapkan setelah membaca `antislop.md` di M5.

## 9. Config baru (bawaan)

```json
"tui":     { "statusline": true, "theme": "tenang", "ask": true, "menu": true },
"persona": { "enabled": true, "default": "perancang" },
"growth":  { "recall": true, "recall_max": 2, "recall_min_score": 3, "prune_days": 60 },
"antislop":{ "enabled": false, "ref": null, "types": ["ui", "copy", "docs"] }
```

Semua bisa dimatikan; mematikan mengembalikan perilaku 1.14.

## 10. Pengujian

| lapisan | isi |
|---|---|
| unit | `statusline` (lebar 60/80/120, tanpa item, `NO_COLOR`), `persona.allows` matriks, `ask.build/record` (hash cocok, tidak cocok, opsi bebas), skor recall |
| hook | project contoh: Stop → naskah → PostToolUse palsu → `align.md` terisi; persona tidak pernah membuka izin |
| regresi | tidak ada `/harness:` di keluaran; 223 test lama tetap lulus |
| kinerja | `bench` menambah `statusline`: p95 < 50 ms di Linux dan Windows |
| manual **[uji]** | daftar M0 di root `event`, dicatat di `docs/v1.15/SPIKE.md` |

## 11. Kompatibilitas dan rollback

Aditif. `install --update` menambah blok config tanpa menyentuh nilai user. Rollback = `harness-update --rollback` atau mematikan flag. Tidak ada migrasi data.
