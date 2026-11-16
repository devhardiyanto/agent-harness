# PRD: Harness 1.15 "Sederhana"

Status: **draf untuk diputuskan** (belum ada kode). Penulis: sesi cloud, 2026-11-16. Dasar: 1.14.0.
Dokumen teknis: [TECH.md](TECH.md). Tampilan dan alur: artifact "Harness 1.15".

## 1. Masalah

| # | keluhan user | akar (yang terverifikasi di repo) |
|---|---|---|
| P1 | TUI kurang interaktif | Semua keputusan diketik sebagai teks ("setuju …", "D2: a"). Status item hanya terlihat bila diminta (`sisa`). Tidak ada tampilan tetap. |
| P2 | Harness sama untuk semua situasi | Satu set gerbang dan satu gaya keluaran untuk analisa, bangun, tinjau, dan kirim. Yang membedakan hanya status item. |
| P3 | "Makin tua makin pintar" belum terasa | Memori, playbook, dan recall ada (1.10–1.11), tetapi pasif: user harus mengetik `ingat P1`, `ref:<slug>`. Tidak ada ukuran apakah pengetahuan terpakai. |
| P4 | Terlalu banyak `/harness:` | 14 skill tampil; `AGENTS.md`, README, dan `nextStep` masih menyebut `/harness:*` sebagai langkah berikutnya. |
| P5 | Keluaran masih bisa "slop" | Tidak ada filter mutu untuk UI, copy, dan komentar kode. antislop (MIT) sudah diriset di ROADMAP §2 tetapi belum dipakai. |

## 2. Objective

> User membuka `claude agents`, mengetik permintaan, lalu **memilih**, bukan mengetik perintah. Harness menunjukkan keadaan kerja terus-menerus, menyesuaikan diri dengan peran yang sedang dijalankan, dan makin jarang bertanya hal yang sudah pernah dijawab.

Bukan tujuan: mengganti Claude Code TUI, membuat TUI terpisah yang wajib dibuka, melonggarkan gerbang approve/merge, atau memindahkan work item ke Plane (itu 2.0).

## 3. Pengguna dan konteks

Satu orang (pemilik) menjalankan 2–3 root sekaligus (`astra`, `event`, `yhpa`) di Windows, kuota sering ketat, memulai dengan `claude agents` lalu prompt langsung. Preferensi: bahasa Indonesia, tabel keputusan, tidak mondar-mandir.

## 4. Lingkup: lima pilar

### Pilar A — TUI interaktif

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| A1 | **Status line harness** dua baris: item aktif, status, AC berbukti n/m, keputusan terbuka, inbox Plane, persona, konteks %. | Terlihat tanpa mengetik apa pun; diperbarui ≤ 1 detik setelah status berubah. |
| A2 | **Keputusan lewat pilihan**: baris D di `align.md` ditanyakan dengan pemilih (opsi rekomendasi di urutan pertama), jawaban dicatat kode. | Menjawab 1 keputusan = 1 pilihan, tanpa mengetik slug atau nomor. |
| A3 | **Menu "lalu apa?"**: user mengetik `menu` (atau `?`), muncul pemilih berisi langkah yang sah untuk item sesi ini. | Tidak ada langkah yang perlu dihafal. |
| A4 | **Gaya keluaran "Harness"** sebagai output style proyek: tabel, maksimal 5 baris, tanpa narasi. | Aturan format pindah dari `AGENTS.md` ke satu berkas gaya. |
| A5 | Tabel dari CLI tetap terbaca (1.13.2) dan tema warna status line bisa diatur per root. | Tiga tema bawaan; `harness.config.json` → `tui.theme`. |

Batas keras: **approve dan merge tetap dari ketikan user** (D21). Pemilih hanya untuk keputusan D, menu, dan usulan pelajaran.

### Pilar B — Persona

Persona = preset cara kerja untuk satu sesi: gaya keluaran, gerbang yang aktif, agent yang dipakai, dan apa yang ditampilkan di status line.

| persona | untuk | boleh mengedit kode | gerbang | keluaran |
|---|---|---|---|---|
| `perancang` | impact, align, plan | tidak | align wajib | tabel keputusan |
| `pembangun` | build item approved | ya, service yang tercakup | bukti AC + checks | progres per AC |
| `peninjau` | review, audit | tidak | review clean | tabel temuan |
| `pengirim` | PR, merge, ringkasan | tidak | gate PASS | tabel PR |

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| B1 | Persona dipilih otomatis dari status item sesi ini; user bisa mengganti dengan `mode: <persona>` atau lewat menu. | Tidak pernah wajib diketik. |
| B2 | Persona hanya **mempersempit**: tidak ada persona yang membuka izin yang ditolak gerbang. | Test: tiap persona × tiap gerbang. |
| B3 | Persona tampil di status line dan di handoff. | — |

### Pilar C — Pengetahuan yang tumbuh

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| C1 | **Pelajaran otomatis diusulkan** saat item `merged`: dari Decision log, koreksi user, dan galat yang berulang; diterima/ditolak lewat pemilih. | Tanpa `ingat P1`. |
| C2 | **Ingatan dipanggil sendiri**: pada prompt baru, hook menyuntik maksimal 2 rujukan (playbook atau ringkasan item) yang paling cocok, satu baris masing-masing. | Nol token model untuk pencarian (kode, bukan LLM). |
| C3 | **Catatan pemakaian**: tiap entri memori/playbook punya hitungan dipakai dan tanggal terakhir. Entri yang tidak pernah dipakai 60 hari diusulkan untuk dibuang. | Memori tidak membengkak. |
| C4 | **Umur dan kepintaran terlihat**: `harness.mjs growth` dan status line menampilkan umur root, jumlah pelajaran, dan rasio "pertanyaan yang terjawab dari memori". | User bisa melihat apakah root makin pintar. |
| C5 | Koreksi user yang sama dua kali menjadi aturan tetap (usulan playbook). | — |

### Pilar D — Tanpa `/harness:` di rekomendasi

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| D1 | Semua "langkah berikutnya" dari kode memakai kalimat pendek atau menu. | `grep "/harness:"` pada keluaran `next`, `sisa`, `decide`, rekap, handoff = 0. |
| D2 | Skill yang tampil: `init` dan `update` saja; sisanya tetap ada tetapi tidak disarankan (`user-invocable: false` bila didukung). | — |
| D3 | `AGENTS.md` ditulis ulang tanpa menyebut `/harness:*` sebagai alur utama. | ≤ 60 baris. |

### Pilar E — antislop

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| E1 | antislop dipasang sebagai **plugin hulu** (bukan disalin), terkunci di satu commit, opsional per root (`antislop.enabled`). | `doctor` melaporkan terpasang/versi. |
| E2 | Hanya aktif untuk item yang menyentuh UI, copy, atau dokumen; reviewer mengutip nomor aturan antislop di kolom `aturan`. | Tidak menambah konteks pada item backend. |
| E3 | Atribusi MIT tercatat di `THIRD_PARTY.md`. | S-04 terpenuhi. |

## 5. Keputusan yang dibutuhkan dari user

| # | yang perlu diputuskan | opsi (rekomendasi dulu) | dampak |
|---|---|---|---|
| D29 | Arti "persona" | a. peran kerja per sesi (tabel Pilar B) · b. profil orang (pemilik/tim/tamu) · c. dua-duanya | a paling kecil dan langsung terasa; b tumpang-tindih dengan `USER.md` |
| D30 | Cara memakai antislop | a. plugin hulu terkunci commit · b. salin ke repo (vendor) · c. hanya rujukan aturan | a ikut pembaruan hulu dengan sadar; b bebas jaringan tetapi harus dirawat |
| D31 | Bentuk rilis | a. lima rilis kecil 1.15.0–1.19.0 · b. satu rilis besar 1.15.0 | a bisa dipakai dan dibatalkan per bagian; b lebih lama tanpa umpan balik |
| D32 | Urutan terhadap 2.0 | a. 1.15 dulu, pilot 2.0 sesudahnya · b. pilot 2.0 dulu | a: status line dan pemilih ikut terukur di pilot |
| D33 | Persetujuan lewat pemilih | a. tidak, approve/merge tetap diketik (D21) · b. boleh untuk lajur quick | a menjaga batas "hanya manusia" tanpa asumsi baru |

## 6. Ukuran keberhasilan

| ukuran | sekarang | target |
|---|---|---|
| Ketikan perintah per item standard (dari permintaan sampai merged) | ±6 kalimat pendek | ≤ 3 (approve, merge, dan satu koreksi) |
| Kemunculan `/harness:` di keluaran kode | puluhan | 0 selain `init`/`update` |
| Keputusan dijawab lewat pemilih | 0% | ≥ 80% |
| Pertanyaan agent yang sudah pernah dijawab (diukur dari koreksi "sudah pernah") | tidak diukur | diukur, tren turun |
| Baris `AGENTS.md` | 60 | ≤ 60, tanpa `/harness:` di alur |

## 7. Risiko

| risiko | akibat | penanganan |
|---|---|---|
| Pemilih (AskUserQuestion) tidak memicu hook, atau jawabannya tidak terbaca hook | A2 tidak bisa dicatat kode | Spike M0; cadangan: agent menjalankan `harness.mjs answer` dan hook Stop memeriksa |
| Status line memperlambat TUI | terasa berat | skrip < 50 ms, hanya membaca berkas; diuji `bench` |
| Output style mengganti instruksi coding bawaan | mutu kode turun | `keep-coding-instructions: true` |
| Persona salah tebak | agent ditolak mengedit | persona hanya mempersempit; pesan tolakan menyebut cara ganti |
| antislop menambah konteks | kuota | hanya dimuat untuk item UI/copy |
| Suntikan ingatan salah sasaran | konteks kotor | maksimal 2 baris, ambang skor, bisa dimatikan |

## 8. Di luar lingkup

Plane sebagai sumber kebenaran (2.0), TUI terpisah berbasis curses, tema warna Claude Code itu sendiri (bukan milik harness), advisor otomatis.
