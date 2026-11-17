# PRD: Harness 1.15–1.19 "Sederhana"

Status: **rancangan disetujui untuk dikerjakan** (revisi 2, 2026-11-17; keputusan D29–D35 sudah dijawab). Dasar: 1.14.1.
Dokumen teknis: [TECH.md](TECH.md). Tampilan dan alur: artifact "Harness 1.15".

## 1. Masalah

| # | keluhan user | akar (terverifikasi di repo) |
|---|---|---|
| P1 | TUI kurang interaktif | Semua keputusan diketik. Status item hanya terlihat bila diminta (`sisa`). |
| P2 | Dokumen per item terlalu banyak | Enam berkas per item (`brief`, `impact`, `align`, `plan`, `progress`, `review`) untuk hal yang intinya empat langkah. |
| P3 | Tidak ada spesialis | Satu `implementer` untuk semua bidang; arah pekerjaan (backend, frontend, …) baru ketahuan saat mengerjakan. |
| P4 | "Makin tua makin pintar" belum terasa | Memori, playbook, recall ada tetapi pasif dan tidak terukur. |
| P5 | Terlalu banyak `/harness:` | 14 skill tampil; keluaran kode masih menyarankan `/harness:*`. |
| P6 | Keluaran masih bisa "slop" | Belum ada filter mutu untuk UI, copy, dan komentar kode. |

## 2. Objective

> User membuka `claude agents`, mengetik permintaan, lalu **memilih**. Tiap pekerjaan melewati empat langkah dalam satu berkas, arahnya (bidang) sudah diketahui sejak diskusi, dan saat eksekusi spesialis bidang itu yang dipanggil. Harness menunjukkan keadaan kerja terus-menerus dan makin jarang bertanya hal yang sudah pernah dijawab.

Bukan tujuan: mengganti Claude Code TUI, melonggarkan gerbang approve/merge, memindahkan sumber kebenaran ke Plane (itu 2.0).

## 3. Pengguna dan konteks

Satu orang (pemilik) menjalankan 2–3 root sekaligus (`astra`, `event`, `yhpa`) di Windows, kuota sering ketat, memulai dengan `claude agents` lalu prompt langsung. Preferensi: bahasa Indonesia, tabel keputusan, tidak mondar-mandir.

## 4. Lingkup: enam pilar

### Pilar A — TUI interaktif

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| A1 | **Status line harness** dua baris: root, item aktif, status, AC berbukti n/m, checks, bidang, keputusan terbuka, inbox Plane, umur, konteks %. | Terlihat tanpa mengetik; berubah ≤ 1 detik setelah status berubah. |
| A2 | **Keputusan lewat pemilih**: baris D ditanyakan sebagai pilihan (rekomendasi di urutan pertama), jawaban dicatat kode. | 1 keputusan = 1 pilihan. |
| A3 | **Menu "lalu apa?"**: ketik `menu`, muncul pemilih berisi langkah yang sah. | Tidak ada langkah yang perlu dihafal. |
| A4 | **Gaya keluaran "harness"** sebagai output style proyek. | Aturan format pindah dari `AGENTS.md` ke satu berkas gaya. |
| A5 | Tema warna status line per root (`tenang`, `kontras`, `mono`). | `tui.theme`. |

Batas keras (D33): **approve dan merge tetap dari ketikan user.** Pemilih hanya untuk keputusan D, menu, dan usulan pelajaran.

### Pilar B — Satu berkas, empat langkah (D34 a, D35 a)

Satu item = satu berkas `docs/work/<slug>.md` dengan empat bagian. Bagian ini juga menjadi isi kartu Plane.

| # | bagian | isi | batas |
|---|---|---|---|
| 1 | **Objective** | satu kalimat tujuan + bidang (`backend`, `frontend`, `devops`, `dba`) | ≤ 2 baris |
| 2 | **Penjelasan** | apa yang diubah dan di mana, sekilas | ≤ 8 baris |
| 3 | **Dampak & konfirmasi** | tabel service yang kena; tabel keputusan D (dijawab lewat pemilih); ditutup ketikan `setuju` | tabel saja |
| 4 | **Eksekusi** | checklist tugas = AC bernomor dengan bukti per AC; hasil checks; tinjauan; PR | AC tetap diperiksa gerbang |

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| B1 | Item baru dibuat dalam bentuk satu berkas. | Tidak ada `brief.md`/`impact.md`/`align.md`/`plan.md`/`progress.md`/`review.md` untuk item baru. |
| B2 | Semua gerbang yang ada tetap berlaku pada berkas tunggal: keputusan terjawab sebelum AC ditulis, `approved` sebelum edit kode, bukti per AC + checks + tinjauan sebelum `done`. | Test gerbang lama dijalankan ulang pada bentuk baru. |
| B3 | Item lama (bentuk folder) tetap terbaca dan bisa diselesaikan; tidak dimigrasi paksa. | 223 test lama tetap lulus. |
| B4 | Kartu Plane berisi keempat bagian; bagian 4 sebagai to-do list. | `plane push` memakai berkas tunggal. |

### Pilar C — Persona = spesialis per bidang (D29, D29b a)

Persona adalah **agent spesialis yang di-spawn saat eksekusi**. Bidangnya sudah diketahui sejak diskusi; tidak ada "mode" yang berganti di tengah.

| spesialis | bidang | memuat |
|---|---|---|
| `backend` | API, service, logika bisnis | knowledge + pola service backend, playbook bidang backend, `antislop-code` |
| `frontend` | UI, halaman, komponen | knowledge frontend, playbook frontend, `antislop-ui`, `-human`, `-layoutmobile`, `-code` |
| `devops` | CI/CD, deploy, infrastruktur, konfigurasi | knowledge terkait, playbook devops, `antislop-code` |
| `dba` | skema, migrasi, query | sudah ada; tetap satu-satunya yang boleh menyentuh migrasi |

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| C1 | **Bidang diketahui sejak diskusi**: dari ucapan user ("backend: …", "minta DBA cek …") atau dari service yang disebut (`services.<svc>.bidang` di config). Ditulis di Objective dan di kartu. | Bidang tampil di status line sebelum eksekusi. |
| C2 | **Spawn saat eksekusi**: setelah `setuju`, sesi utama memanggil spesialis sesuai bidang; item multi-bidang memanggil tiap spesialis untuk service-nya. | Sesi utama tidak mengerjakan kode bidang itu sendiri. |
| C3 | Spesialis tidak dibuat dadakan: berkas tetap di `.claude/agents/`. Service tanpa bidang memakai `implementer` (cadangan). | — |
| C4 | Peran tahap (perancang, pembangun, peninjau, pengirim) **tidak ada**; tahap terbaca dari status item. `reviewer`, `runner`, `scout` tetap sebagai agent pembantu, bukan persona. | Satu arti "persona". |

### Pilar D — Pengetahuan yang tumbuh

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| D1 | Pelajaran diusulkan saat `merged` dan diterima/ditolak lewat pemilih. | Tanpa `ingat P1`. |
| D2 | Rujukan dipanggil sendiri saat prompt baru: maksimal 2 baris, dicari kode (bukan model). | Nol token untuk pencarian. |
| D3 | Hitungan pemakaian per entri; yang tidak terpakai 60 hari diusulkan dibuang. | Memori tidak membengkak. |
| D4 | `harness.mjs growth` + status line: umur root, jumlah pelajaran, rasio rujukan terpakai. | Terlihat apakah root makin pintar. |
| D5 | **Playbook per bidang**: pelajaran dan playbook diberi label bidang; spesialis hanya menerima milik bidangnya. | Spesialis makin pintar di bidangnya tanpa menambah konteks bidang lain. |

### Pilar E — Tanpa `/harness:` di rekomendasi

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| E1 | Semua "langkah berikutnya" dari kode memakai kalimat pendek atau menu. | Tidak ada `/harness:` di keluaran `next`, `sisa`, `decide`, rekap, handoff. |
| E2 | Yang tampil: `init`, `update`, dan `/summarize`. | — |
| E3 | `AGENTS.md` ditulis ulang mengikuti empat langkah. | ≤ 60 baris. |

### Pilar F — antislop (D30 b)

| ID | kebutuhan | ukuran lulus |
|---|---|---|
| F1 | **Teks aturan disalin** ke `kernel/.claude/skills/antislop*` dari versi yang sudah diperiksa (3.2.30, commit `35b54dc`), termasuk berkas lisensi. | Terpasang lewat `harness-update`; tanpa jaringan. |
| F2 | **Tidak disalin**: server MCP kontras, izin `Bash(python *)`, folder `cli/`, dan bagian petunjuk pembaruan `npx`. | Tidak ada kode pihak ketiga yang dieksekusi di root. |
| F3 | Dimuat lewat spesialis (lihat Pilar C), bukan "selalu": inti antislop (54 KB) hanya untuk pekerjaan UI/copy/dokumen; `antislop-code` (9 KB) untuk semua pekerjaan kode. | Item backend tidak memuat inti antislop. |
| F4 | Reviewer mengutip `R-xx`; Delivery Gate antislop menjadi satu baris di gate harness untuk item UI/copy. | — |
| F5 | `THIRD_PARTY.md`: nama, dua lisensi MIT (antislop; web-quality-skills), URL, versi, commit. Pembaruan hulu disalin ulang hanya atas permintaan user, setelah diperiksa ulang. | S-04 terpenuhi. |

Hasil pemeriksaan keamanan salinan 3.2.30: tidak ada panggilan jaringan, telemetri, hook, atau skrip pasang otomatis; pemeriksa kontras hanya menghitung lokal; teks skill tidak menyuruh mengirim apa pun. Berlaku untuk salinan yang diperiksa saja.

## 5. Keputusan (sudah dijawab)

| # | keputusan | jawaban |
|---|---|---|
| D29 | arti persona | agent spesialis per bidang, di-spawn saat eksekusi; bidang diketahui sejak diskusi |
| D29b | peran tahap | dibuang |
| D30 | antislop | disalin ke repo (teks aturan saja) |
| D31 | bentuk rilis | lima rilis kecil 1.15.0–1.19.0, dikerjakan beruntun; user menjalankan `harness-release <PR>` |
| D31b | cara merilis | lima PR berurutan |
| D32 | urutan terhadap 2.0 | pilot sesudah 1.19.0 |
| D33 | persetujuan lewat pemilih | tidak; approve dan merge tetap diketik |
| D34 | bentuk berkas | satu berkas per item, empat bagian |
| D35 | AC | tetap, sebagai checklist berbukti di bagian Eksekusi |

## 6. Ukuran keberhasilan

| ukuran | sekarang | target |
|---|---|---|
| Berkas per item | 6 | 1 |
| Ketikan perintah per item standard | ±6 kalimat pendek | ≤ 3 (setuju, push PR + merge, satu koreksi) |
| `/harness:` di keluaran kode | puluhan | 0 selain `init`/`update` |
| Keputusan dijawab lewat pemilih | 0% | ≥ 80% |
| Eksekusi oleh spesialis yang benar | tidak ada | ≥ 90% item berbidang |
| Baris `AGENTS.md` | 60 | ≤ 60, tanpa `/harness:` di alur |

## 7. Risiko

| risiko | akibat | penanganan |
|---|---|---|
| Hook tidak bisa membaca jawaban pemilih | A2 tidak tercatat kode | Uji M0; cadangan: pemilih hanya untuk menu dan pelajaran, keputusan D tetap diketik |
| Berkas tunggal merusak gerbang yang membaca `plan.md`/`align.md` | gerbang bolong | Satu lapisan baca (`store.mjs`) yang mengembalikan bentuk sama untuk kedua format; test gerbang dijalankan pada keduanya |
| Bidang salah tebak | spesialis salah | Bidang tampil sejak diskusi dan bisa dikoreksi ("ini frontend"); cadangan `implementer` |
| Spawn spesialis menambah pemakaian kuota | kuota | Spesialis hanya memuat knowledge dan playbook bidangnya; `omitClaudeMd` |
| Hook tidak tahu agent mana yang mengedit | C2 hanya instruksi | Uji M0; bila tidak bisa ditegakkan, dicatat sebagai anjuran dan diukur di laporan |
| antislop menambah konteks | kuota | Dimuat per bidang; inti hanya untuk UI/copy |
| Status line memperlambat TUI | terasa berat | Skrip hanya membaca satu berkas; p95 < 50 ms |

## 8. Di luar lingkup

Plane sebagai sumber kebenaran (2.0), TUI terpisah, tema warna Claude Code sendiri, advisor otomatis, migrasi paksa item lama ke berkas tunggal, server MCP kontras antislop.
