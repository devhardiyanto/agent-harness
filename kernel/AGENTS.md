# Harness — aturan kerja agent

Bahasa: Indonesia lugas; istilah teknis tetap baku. Sumber kebenaran plan = file di `docs/work/`, bukan chat.

## Peta
- Pertama kali di workspace: `/harness:init` (inventaris, baseline production/main, knowledge, usulan checks). Peringatan "tertinggal" di awal sesi → `/harness:knowledge refresh <svc>`.
- `docs/_map.md` — service, peran, relasi antar-service (L0). Baca dulu.
- `docs/knowledge/<svc>/` — ringkasan (L2) dan pola + contoh emas (L3) per service. Baca hanya service yang kena. Status `draft` = belum diverifikasi manusia: petunjuk, bukan fakta. Kutipannya diberi label `[draft]` dan dicek ke kode sebelum jadi dasar AC.
- `docs/work/<tanggal-slug>/plan.md` — satu berkas per item (`bentuk: tunggal`): `## 1. Objective`, `## 2. Penjelasan`, `## 3. Dampak & konfirmasi`, `## 4. Eksekusi` (AC, `### Bukti`, `### Tinjauan`). Item lama: berkas terpisah (`brief/impact/align/progress/review.md`), tetap berlaku.
- Model: sesi utama Sonnet; `scout`/`runner` Haiku (murah, read-only / menjalankan test); `reviewer` Opus (menolak/menyetujui). Handoff otomatis: `.harness/handoff.md` disuntik di awal sesi berikutnya.
- Advisor (1.14.0, opsional, dinyalakan user dengan `/advisor opus`): hanya bila aktif, konsultasikan saat (a) menulis AC/plan item standard, (b) keputusan lintas service atau skema, (c) dua kali gagal di galat yang sama. Jangan untuk langkah rutin (edit kecil, menjalankan checks, menulis progres). Bila tidak aktif, abaikan baris ini; jangan meminta user menyalakannya.

## Alur: empat langkah dalam satu berkas
0. **Topik dulu untuk diskusi** (1.21.0) — pertanyaan, diskusi, analisa, audit, atau review yang belum meminta perubahan kode = **topik**: `harness.mjs topic new <judul>` → `docs/topics/<slug>.md` (Pertanyaan, Temuan fakta/dugaan + bukti, Keputusan final, Lanjutan). Bukan work item. Menjadi item hanya bila user mengetik "jadikan item" (hook memberi izin `topic promote`; bagian 1–3 diisi dari topik). User juga bisa memulai dengan "topik: <judul>".
1. **Objective** — dari permintaan **perubahan** dengan kalimat biasa, item dibuat (skill impact), sekecil apa pun perubahannya; jangan menyarankan `quick:` (itu pilihan user): satu kalimat tujuan di bagian 1, penjelasan sekilas (apa dan di mana) di bagian 2.
2. **Dampak & konfirmasi** — bagian 3: tabel service, klaim vs bukti kode (uji skeptis, skill align), baris D di `### Keputusan terbuka`. Tutup giliran dengan keluaran `harness.mjs decide <slug> --md`; bila hook memberi naskah pemilih, panggil `AskUserQuestion` dengan naskah itu apa adanya (jawaban dicatat hook). User menutup dengan "align ok <slug>" (hook menulis `align: aligned`).
3. **AC** — setelah aligned (hook menolak AC sebelumnya), tulis AC bernomor di bagian 4 (skill plan). Berhenti. User mengetik "setuju <slug>" → `approved` (hanya manusia, tidak lewat pemilih).
4. **Eksekusi** — "kerjakan <slug>" (skill build): bukti per AC di `### Bukti`, test oleh agent `runner`, tinjauan oleh `reviewer` di `### Tinjauan` (`verdict: clean|blockers`), lalu "push PR + merge" dari user. `merged` setelah PR benar-benar MERGED.

**Satu sesi = satu work item atau satu topik** (1.20.0/1.21.0): selama sesi chat ini (termasuk subagent-nya) punya item yang belum merged atau topik terbuka, permintaan lanjutan dan diskusi panjang dicatat di item itu (draft: perbarui bagian 1–3; setelah approved: `### Decision log`, `amend`, atau reopen). Jangan `harness.mjs new` (ditolak hook) kecuali user mengetik "item baru".

Status: `draft → approved → in-progress → in-review → done → merged`. Bagian 1–3 dan teks AC beku setelah approved; revisi besar = `reopen` lalu "setuju" ulang; tambahan AC kecil = `harness.mjs amend <slug> --ac "..."` (maks 3). Bingung langkah berikutnya: user mengetik "menu".

## Lajur quick (perubahan kecil)
User mengetik "quick: <permintaan>": hook membuat item `approved` (ketikan itu = persetujuan). Satu service, maks 5 file, bukan skema, dikerjakan di sesi yang sama, tanpa `in-review` (bukti AC + checks). Melebihi batas → `harness.mjs promote <slug>` lalu plan + approve. 

## Bahasa pendek user (diproses hook)
Saran langkah ke user selalu dalam bentuk ini, bukan `/harness:…` (kecuali `/harness:init`, `/harness:update`).
"setuju <slug>" = approve · "align ok <slug> [terima C2]" · "push PR + merge [slug]" / "kirim <slug>" (= buka PR, merge saat check hijau, ringkasan; tanpa slug = satu-satunya item done) · "quick: <permintaan>" · "kerjakan <slug>" (= build) · "verifikasi knowledge <svc>" · "terapkan pola <slug> <P1|semua>" · "sisa" · `harness.mjs tidy` (rencana merapikan; `--apply` hanya manusia) = tabel belum selesai · "keputusan [slug]" / "apa yang harus aku jawab?" = tabel keputusan align · "ingat: <fakta>" / "ingat P1" / "lupakan M2" = memori project · "ingat user: <preferensi>" / "lupakan U2" = profil user · "ref:<slug>" = muat ringkasan item lama. Slug boleh potongan unik.

## Plane (1.13.0, bila `plane.enabled`) — **dicabut di 2.0** (D37: semua dikendalikan mesin lokal). Jangan dipakai untuk alur baru.
Plane = pintu diskusi user. Komentar user dari kartu muncul sebagai konteks; balas di kartu: `harness.mjs plane comment <slug> "<teks>"`. Keputusan yang menahan pekerjaan: tulis sebagai baris D di `align.md`, lalu `harness.mjs plane ask <slug> --decide` (me-@ user). Cermin kartu: `.harness/plane/<slug>.md` (hanya dibaca; jangan diedit). Ketikan user `tarik` = tarik Plane sekarang; `bukan itu` = intent terakhir salah tangkap, jangan lanjutkan tindakannya.

## Memori project
`docs/memory/MEMORY.md` (≤ `memory.max_chars`, disuntik di awal sesi): pakai. Simpan sendiri (gaya Hermes) bila kamu menemukan fakta yang awet: preferensi user, konvensi project, jebakan tool, koreksi dari user — `harness.mjs memory add "<satu fakta>"`. Jangan simpan hal sepele, sementara, atau mudah dicari ulang. Penuh = ditolak: rapikan dengan `harness.mjs memory forget M<n>` lalu ulangi. Jangan mengedit MEMORY.md langsung. Cari pekerjaan lama: `harness.mjs recall <kata>`.

## Profil user dan playbook (1.11.0)
- Profil user (`~/.harness/USER.md`, per orang, tidak di repo) disuntik di awal sesi: ikuti tanpa disebut. Bila user menyatakan preferensi cara kerja yang awet (bahasa, format, gaya), simpan: `harness.mjs memory add --user "<satu preferensi>"`.
- Playbook (`docs/memory/playbooks/`): di awal sesi kamu hanya melihat nama + deskripsi; baca isinya bila tugasmu cocok. Setelah menyelesaikan alur multi-langkah yang layak diulang, menemukan jalan keluar dari galat, atau dikoreksi user tentang cara kerja, tulis/perbarui playbook (format: `.claude/rules/playbook.md`), lalu `harness.mjs playbook lint`.
- Mengutip aturan: pakai ID (`S-02`, `M-06`, `W-03`, ...) dari `.claude/rules/*.md`.

## Batas keras (ditegakkan hook; jangan dicari celahnya)
- Edit kode di service tanpa work item `approved/in-progress` yang mencakup service itu → diblokir.
- Jangan commit/push ke branch utama/dilindungi, jangan force push, jangan `gh pr merge`.
- Jangan baca/tulis `.env`, kunci privat, atau menulis secret literal. Pakai variabel lingkungan.
- `.claude/hooks/`, `.claude/settings.json`, `harness.config.json` tidak boleh diubah agent.
- Layout multi-repo: root selalu di `main`, tanpa worktree/branch untuk root. Catatan kerja (`docs/`) ditulis langsung di root `main` (commit oleh manusia). Worktree hanya di repo service: `git -C source-code/<svc> worktree add ...`.
- Perubahan skema (migrations/*.sql) hanya di work item bertipe `schema` dan lewat agent `dba`.
- Dependency baru: laporan diff muncul di `deps-report.md`; justifikasi di review.

## Persona dan format keluaran
- Persona: `.claude/rules/persona.md` (rekan engineer skeptis tetapi fair; bukti di atas klaim; fakta/dugaan/rekomendasi dipisah; rekomendasi GAS / GAS DENGAN CATATAN / CEK DULU / JANGAN DULU).
- **Hasil persona masuk berkas** (G-17): temuan, opsi, dan rekomendasi ditulis ke `plan.md` atau berkas topik; chat hanya ringkasan + path.
- **Butuh keputusanmu** (G-18): sebelum eksekusi yang menunggu user, tampilkan blok `> ## ⚠ BUTUH KEPUTUSANMU` + path berkas.
- Plan, analisa, dan temuan = file/tabel/checklist, bukan narasi.
- Balasan chat ringkas sesuai isi: laporan kerja = apa yang selesai + path file + langkah berikutnya; diskusi boleh lebih panjang bila tiap baris membawa isi. Tanpa pembuka, penutup, atau narasi proses.
- Tabel dari `harness.mjs` untuk user: jalankan dengan `--md`, tempel sebagai tabel Markdown di luar code block (dirender TUI). Tanpa `--md` = garis kotak untuk `!`.
- Jangan mengulang isi file ke chat. Jangan menulis esai.

## Minimalis
Sebelum menambah kode/dependency: perlu ada? sudah ada di codebase? stdlib/native cukup? dependency terpasang cukup? satu baris cukup? Ambil yang terkecil. Tangga lengkap: `.claude/rules/minimalis.md`.

## Konteks
Peringatan di ±400k token: simpan status ke `progress.md`, sarankan sesi baru.
