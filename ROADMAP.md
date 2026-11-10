# Roadmap: 1.10.0 → 1.11.0 → 2.0.0

Tujuan: **mudah dipakai, tidak mondar-mandir, dan makin pintar seiring umur project**, tanpa melepas gerbang yang membuat harness aman (approve, merge, dan memori tetap keputusan manusia).

## 1. Masalah yang dipecahkan

| # | keluhan | akar | jawaban 1.10.0 |
|---|---|---|---|
| K1 | `/harness:xxx` terlalu kaku | tiap langkah butuh hafalan nama skill + slug lengkap | intent tanpa slash: `setuju <slug>`, `align ok <slug>`, `kirim <slug>`, `sisa`, slug boleh potongan |
| K2 | align buntu: "2 klaim masih bertentangan" | hook hanya menolak, tanpa isi klaim dan tanpa jalan keluar selain mengedit file | tabel klaim di pesan + `align ok <slug> terima C2` (risiko diterima, tercatat) |
| K3 | diskusi work item terlalu panjang, "ngawang" | keluaran naratif | rule: diskusi = tabel keputusan (maks 4 baris); skill align membalas tabel |
| K4 | lupa apa yang belum selesai | status tersebar di banyak file | tabel **Belum selesai** (`sisa`, `harness.mjs open`, otomatis di Stop) |
| K5 | hasil kerja lama sulit dirujuk | summary ada per item, tapi tidak terindeks | `docs/memory/INDEX.md`, `recall <kata>`, `ref:<slug>` |
| K6 | tidak makin pintar seiring waktu | pengetahuan hanya di knowledge per service | memori project berbatas + usulan pelajaran dari Decision log |

## 2. Riset

### antislop (`miqdadbadjuber/anti-slop`)
Dibaca dari `skills/antislop/SKILL.md` dan README. Jumlah star tidak bisa saya pastikan (API GitHub repo itu tidak terjangkau dari sesi ini); README menampilkan lencana Trendshift harian/bulanan.

| mekanisme | detail | kenapa menarik |
|---|---|---|
| masalah yang terlihat | before/after gambar UI, copy, kode | nilai terbukti dalam 3 detik, tanpa membaca |
| aturan bernomor bertingkat | R-01..R-40: Hard Gate / Purpose-Gate / Quality Locks | bisa dirujuk ("langgar R-17"), bisa diaudit |
| Delivery Gate | laporan PASS/FAIL wajib sebelum kirim | hasil bisa diperiksa, bukan klaim |
| skill per concern | 6 skill (ui, copy, human, layout, code) | agent hanya memuat yang perlu → konteks kecil |
| dua mode | during / after; preferensi disimpan sekali | user tidak ditanya berulang |
| distribusi tanpa gesekan | `npx antislop-ai`, skills.sh, plugin 7 agent | satu perintah, lintas agent |
| "filter, bukan style guide" | tidak memaksakan arah; arah dari `DESIGN.md` | posisinya jelas, tidak bertabrakan dengan selera user |

### Hermes Agent (`NousResearch/hermes-agent`, "the agent that grows with you")
Dibaca dari README dan `website/docs/.../memory.md`, `skills.md` di GitHub (situs docs-nya diblokir jaringan sesi ini).

| mekanisme | detail |
|---|---|
| memori berbatas | `MEMORY.md` 2.200 karakter + `USER.md` 1.375; entri dipisah `§`; disuntik sebagai snapshot beku di awal sesi (menjaga prefix cache) |
| penuh = galat | tidak memadatkan diam-diam; agent merapikan sendiri |
| `write_approval` | opsional: tulisan memori/skill diantrekan, manusia menyetujui (`/memory pending`) |
| review latar (learning loop) | setelah giliran, fork meninjau dan menyimpan koreksi berulang sebagai memori atau skill prosedural |
| skill dari pengalaman | `skill_manage` membuat/menambal skill setelah alur multi-langkah, galat yang berhasil diatasi, atau koreksi user |
| progressive disclosure | daftar skill (nama+deskripsi) dulu, isi penuh saat perlu |
| session search | SQLite FTS5 atas semua sesi, tanpa LLM |
| user model | Honcho (dialektik) lintas sesi |

### ATM (Amati → Tiru → Modifikasi)

| amati | tiru | modifikasi untuk harness | rilis |
|---|---|---|---|
| Hermes: memori berbatas + snapshot | `docs/memory/MEMORY.md`, batas karakter, disuntik SessionStart | disimpan di repo (bisa di-review di PR), bukan di home; penuh = ditolak | 1.10.0 |
| Hermes: agent menulis memori sendiri | `memory add/forget` oleh agent | bawaan seperti Hermes; `write_approval: true` = antrean `pending.md` | 1.10.0 |
| Hermes: session search | `recall <kata>` | grep berperingkat atas summary/brief/align/sesi; nol token | 1.10.0 |
| Hermes: learning loop | usulan pelajaran saat `done` | deterministik dari `## Decision log` (tanpa model, tanpa fork) | 1.10.0 |
| antislop: aturan ringkas, keluaran terperiksa | tabel keputusan, tabel Belum selesai | dihasilkan kode, bukan ditulis bebas oleh model | 1.10.0 |
| antislop: mode tersimpan | flag di `harness.config.json` | per project | 1.10.0 |
| Hermes: skill dari pengalaman | playbook `docs/memory/playbooks/<nama>.md` | ditulis agent langsung (D4); awal sesi hanya nama + deskripsi; lint menolak yang rusak/terlalu besar | 1.11.0 ✔ |
| antislop: aturan bernomor | ID rule (`O-`, `S-`, `W-`, `K-`, `M-`, `P-`) di `.claude/rules/*` | kolom `aturan` di review; `check-repo` menolak ID ganda | 1.11.0 ✔ |
| Hermes: user model | profil user | per orang di `~/.harness/USER.md`, bukan di repo (root dipakai tim) | 1.11.0 ✔ |
| antislop: before/after | tabel sebelum/sesudah di README | teks, bukan gambar | 1.11.0 ✔ |

## 3. Perubahan artefak

```mermaid
flowchart LR
  subgraph user["Ketikan user"]
    S1["setuju / align ok / kirim / quick:"]
    S2["sisa"]
    S3["ingat: / ingat P1 / lupakan M2"]
    S4["ref:slug"]
  end
  subgraph hooks["Hook (kernel/.claude/hooks)"]
    I["intent.mjs<br/>BARU"]
    P["prompt.mjs<br/>DIUBAH"]
    R["recap.mjs<br/>BARU"]
    M["memory.mjs<br/>BARU"]
    ST["stop.mjs<br/>DIUBAH: rekap"]
    SS["session.mjs<br/>DIUBAH: snapshot memori"]
    H["harness.mjs<br/>DIUBAH: open, memory, recall"]
    G["guard-bash.mjs<br/>DIUBAH: memory approve = manusia"]
  end
  subgraph files["Berkas project"]
    A["docs/work/slug/align.md<br/>terima Cn → diterima (manusia)"]
    MM["docs/memory/MEMORY.md<br/>dilindungi"]
    PE["docs/memory/pending.md"]
    IX["docs/memory/INDEX.md"]
    SU["docs/work/slug/summary.md"]
  end
  S1 --> I --> P
  S2 --> I
  S3 --> I
  S4 --> P
  P --> A
  P --> R
  P --> M
  M --> MM
  M --> PE
  H -- "done/merged" --> SU
  H -- "done/merged" --> IX
  H -- "Decision log" --> PE
  ST --> R
  SS --> MM
  P -- "ref:slug" --> SU
```

Alur kerja tidak berubah urutannya; yang berubah adalah **cara masuk** (kalimat pendek) dan **cara keluar** (tabel, bukan narasi):

```mermaid
flowchart LR
  impact --> align -- "align ok slug [terima C2]" --> plan -- "setuju slug" --> build --> review --> done -- "kirim slug" --> merged
  done -. "INDEX + usulan pelajaran" .-> memori[(docs/memory)]
  memori -. "snapshot awal sesi" .-> impact
```

## 4. Feature flag (`harness.config.json`)

| flag | bawaan | efek | matikan bila |
|---|---|---|---|
| `intent.enabled` | `true` | kalimat pendek → perintah | tim lebih suka slash murni |
| `intent.max_chars` | `120` | prompt lebih panjang selalu dianggap chat | ada false positive |
| `align.accept_contradictions` | `true` | `align ok <slug> terima C2` | ingin klaim bertentangan wajib dikoreksi |
| `recap.enabled` | `true` | `open` / `sisa` | — |
| `recap.on_stop` | `true` | tabel Belum selesai di akhir giliran (hanya bila berubah) | terasa berisik |
| `recap.max_rows` | `12` | batas baris tabel | — |
| `memory.enabled` | `true` | memori project, snapshot di awal sesi | tidak ingin konteks tambahan |
| `memory.max_chars` | `2200` | batas MEMORY.md | — |
| `memory.write_approval` | `false` | gaya Hermes: agent menulis sendiri | (`true`) ingin menyetujui tiap tulisan agent |
| `ship.merge_on_request` | `true` | ketikan ship = PR + merge saat hijau + ringkasan | (`false`) merge butuh ketikan kedua setelah hijau |
| `ship.intent_ttl_min` | `240` | umur izin merge tertunda | — |
| `memory.learn_from_summary` | `true` | usulan pelajaran dari Decision log saat `done` | — |
| `memory.learn_max` | `3` | maks usulan per item | — |
| `memory.ref_max_chars` | `3000` | batas ringkasan yang disuntik `ref:` | — |

## 5. Versi

| versi | isi | alasan nomor |
|---|---|---|
| **1.10.0** (rilis ini) | intent, align terima, Belum selesai, memori, recall/ref | aditif, semua di belakang flag, tidak ada yang rusak → **minor** |
| 1.11.0 (rilis) | profil user per orang, playbook (skill dari pengalaman), ID rule, before/after | aditif |
| 1.12.0 (rilis) | tabel keputusan dibuat kode + ditahan Stop, plan setelah aligned, langkah berikutnya dari kode, versi plugin di doctor | aditif; menutup T2/T3 |
| 1.13.0 (rilis) | jembatan: Plane berisi kartu + checklist + diskusi (cermin lokal), `plane migrate` dry-run/apply/verify, log pilot + `bukan itu`, slash usang, `migrate` + doctor "siap 2.0", slug ringkas | aditif; folder lokal belum dihapus |
| 2.0.0 | **satu pintu**: work item, diskusi, knowledge di Plane; lokal hanya cermin; folder `docs/work/*` dihapus per root setelah `migrate --verify` COCOK; slash tinggal `init`/`update`; format align lama dibuang. Hanya bila `pilot` S1–S4 OK | ada yang **dibuang** → major |

## 6. Target malam ini (1.10.0)

- [x] intent tanpa slash (`intent.mjs`, `prompt.mjs`)
- [x] align: pesan tabel + `terima Cn`
- [x] tabel Belum selesai: CLI `open`, ketikan `sisa`, rekap di Stop
- [x] memori project: `ingat`, antrean, batas, snapshot, proteksi
- [x] INDEX + usulan pelajaran saat done/merged, `recall`, `ref:<slug>`
- [x] rule output + skill align/next + AGENTS.md
- [x] tes `test/v1100.test.mjs` (9) + suite lama (180) hijau; `check-repo` 12/12
- [ ] uji di Claude Code asli: `systemMessage` dari hook Stop tampil ke user di versimu (belum terverifikasi di sandbox)
- [ ] pilot di satu root (yhpa), lalu `harness-update.mjs --all`

## 7. Keputusan

| # | pertanyaan | keputusan | implementasi |
|---|---|---|---|
| D1+D2 | "push summary ke staging" / "sampai staging" | **"push PR + merge" = satu keputusan**: PR → merge saat hijau → ringkasan | izin merge tertunda dari hook (`ship.merge_on_request`); ringkasan di root `main` (`summary.md`, `INDEX.md`) |
| D3 | `kirim <slug>` sebelum ada PR | langsung buat PR | skill `ship` boleh dipanggil model, hanya atas konteks hook |
| D4 | pelajaran tanpa persetujuan | **gaya Hermes** | `memory.write_approval: false` bawaan |
| D5 | model profil user (`USER.md`) | 1.11.0: per orang di `~/.harness/USER.md` | `ingat user: ...` + agent `memory add --user` (gaya Hermes, mengikuti D4) |

Alur ship sesudah D1–D3:

```mermaid
sequenceDiagram
  actor U as user
  participant H as hook prompt.mjs
  participant A as agent
  participant C as harness.mjs ship
  U->>H: push PR + merge
  H->>H: tulis intent-<slug>.json (izin merge)
  H->>A: jalankan skill ship (Fase A)
  A->>A: ship-plan, commit, push, gh pr create
  A->>A: Monitor gh pr checks --watch
  A->>C: ship <slug>
  C->>C: gate PASS? OPEN? check hijau? akses? → tiket → merge --match-head-commit
  C-->>A: merged + summary.md + INDEX.md
  A-->>U: URL PR, hasil merge, path ringkasan
```

## 8. Menuju 2.0.0: satu pintu (keputusan D6–D19)

Objective: **work item, diskusi, dan knowledge tinggal di Plane; lokal hanya cermin untuk hook; user cukup membuka Plane dan menjawab @mention.**

| # | keputusan | jawaban |
|---|---|---|
| D6 | rilis jembatan dulu | ya: 1.13 mengukur + memperingatkan, 2.0 membuang |
| D7 | flag yang dikunci | bawaan dikunci, flag tetap ada sebagai escape hatch |
| D8 | slash yang tampil di 2.0 | hanya `init` dan `update` |
| D9 | ambang pilot | 0 salah tangkap + ≥1 "push PR + merge" sampai merged; jendela **6 jam** (diubah user dari 14 hari; `pilot.hours`), lalu user menyimpulkan naik ke 2.0 atau tidak |
| D10 | align format lama | migrasi otomatis |
| D14 | checklist AC | to-do list di deskripsi kartu |
| D15 | "agent di cloud" | sesi Claude (cloud/lokal) yang berkomentar di kartu |
| D16 | project yhpa | project baru **YHPA** di Plane (dibuat 2026-11-10) |
| D17 | knowledge | Plane Pages sebagai sumber, cermin lokal untuk hook |
| D18 | kapan folder dihapus | di 2.0, per root, setelah baca-balik cocok |
| D19 | kapan @mention | hanya saat keputusan menahan pekerjaan |
| D20 | deskripsi yang diedit di Plane | tidak ditimpa: `push` DITAHAN bila deskripsi di Plane berubah sejak kiriman terakhir (centang checklist tidak dihitung); agent diberi tahu lewat inbox; `push --force` setelah diselaraskan |
| D21 | approve di 2.0 | tetap dari ketikan user ("setuju EVENT-15"); kolom Plane hanya tampilan. Alasan: agent memakai API key user, jadi Plane tidak bisa membedakan siapa yang memindahkan kartu |
| D22 | penamaan item di 2.0 | nomor kartu Plane (`EVENT-15`) jadi rujukan; slug lokal hilang |
| D23 | urutan | D20 diperbaiki → PR 1.13 → merge → pilot 6 jam → 2.0 |

Ukuran (`harness.mjs pilot`, jendela 6 jam): S1 frasa ≥ slash · S2 salah tangkap ≤ 0 · S3 tabel keputusan ditahan Stop ≥ 1 · S4 "push PR + merge" sampai merged ≥ 1. Per root: `harness.mjs migrate` semua OK.

Bentuk kartu: judul · deskripsi (Tujuan, Konteks, Keputusan) · checklist AC · komentar (diskusi, progres, link PR, summary penutup). Lokal menarik komentar di awal sesi, tiap prompt (maks 1×/menit), atau saat user mengetik `tarik`; webhook ke laptop tidak mungkin, jadi tidak real-time.

Task 2.0:

| # | task | isi |
|---|---|---|
| T1 | model data tanpa folder | AC, keputusan D, status dibaca dari kartu lewat cermin terstruktur `.harness/plane/<id>.json` |
| T2 | hook membaca cermin | `gate`, Stop, `sisa`, `decide`, `next` |
| T3 | jawaban keputusan lewat komentar | "D2: a", "C3 benar" di kartu → keputusan terjawab |
| T4 | item baru langsung di Plane | `quick:` / impact membuat kartu dulu; rujukan `EVENT-15` (D22) |
| T5 | knowledge → Plane Pages + cermin | verifikasi endpoint Pages di REST API dulu |
| T6 | `plane migrate --delete` per root | hanya setelah `--verify` COCOK; `INDEX.md` berisi URL kartu |
| T7 | antrean offline | `plane-outbox`, dikirim ulang |
| T8 | perampingan | skill selain `init`/`update` internal; template lama dibuang; rule/AGENTS.md ditulis ulang |
| T9 | panduan upgrade 1.13 → 2.0 | langkah per root + rollback |
| T10 | gerbang rilis | `pilot` S1–S4 OK + `migrate` OK di event/astra/yhpa |

> **Catatan untuk setelah 2.0.0 selesai (permintaan user, 2026-11-10):** work item yang sudah ada di event, astra, dan yhpa **diarsipkan** di Plane. User akan meminta agent di sesi cloud menghubungkan Plane lewat MCP (workspace `hardiyanto`: EVENT `39039364-1222-4a52-97c1-de1314305bed`, ASTRA `d8b0e13e-87ef-4ada-b405-7dd4a7bd8cdf`, YHPA `6c13b388-718a-4f06-b1bc-a0d57bc10f15`) untuk memeriksa dan mengarsipkan kartu (`workitem archive`; hanya kartu Done/Cancelled yang bisa diarsipkan). Folder lokal dihapus per root lewat T6, bukan lewat MCP.
