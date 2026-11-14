# Changelog

## 1.14.0
Keputusan D26–D28. Hanya dokumen dan aturan; tidak ada hook atau config baru.
- **Advisor Opus sebagai panduan opt-in** (README, `AGENTS.md`): user menyalakan `/advisor opus` untuk tugas besar dan `/advisor off` sesudahnya. Harness tidak menyalakannya dan `doctor` tidak menagihnya, karena tiap konsultasi membaca seluruh percakapan tanpa cache. Saat aktif, agent hanya berkonsultasi untuk AC/plan, keputusan lintas service/skema, atau galat yang berulang.
- **`reviewer` tanpa `isolation: worktree`** (dicatat di agent dan dijaga test): worktree baru bercabang dari branch utama, sehingga perubahan yang belum di-commit tidak terlihat.

## 1.13.2
- **Tabel CLI bergaris kotak**: semua tabel keluaran `harness.mjs` (`plane check`, `doctor`, `sisa`/`open`, `next`, `decide`, `pilot`, `migrate`, ...) kini dicetak dengan garis kotak (`┌─┬─┐`), sehingga tampil sebagai tabel saat dijalankan lewat `!` di Claude Code atau di terminal biasa, yang tidak merender Markdown. Sel panjang dibungkus per kata agar muat di lebar terminal (bawaan 120 kolom bila tak diketahui; `HARNESS_TABLE_WIDTH` untuk mengubah).
- **`--md` untuk agent**: `harness.mjs <cmd> --md` mencetak Markdown rata kolom. Skill dan aturan (O-04, O-07, O-08 baru, AGENTS.md) meminta agent memakai `--md` dan menempel tabel di luar code block, sehingga dirender TUI di balasan.
- Tabel di berkas (`gate.md`, `handoff.md`, summary) dan teks yang disuntik hook tetap Markdown biasa.

## 1.13.1
Perbaikan dari pemakaian 1.13.0 di event/astra (keputusan D25).
- **Token Plane dibersihkan sebelum dipakai**: CR di akhir (`~/.bashrc` ber-CRLF di Windows), spasi/baris baru, dan tanda kutip pembungkus dibuang. Sebelumnya ini berujung `HTTP 403 Given API token is not valid`. `plane check` menampilkan baris Info bila token sempat dibersihkan, tanpa isi token.
- **`token_env` harus nama variabel**: `plane check` dan `doctor` menolak bila isinya mirip token (diawali `plane_api_`, bukan pola nama variabel), dengan saran mencabut token yang telanjur tertulis di config. Tanpa permintaan jaringan.
- **Rekap "Belum selesai" sebagai tabel Markdown** (`recap.render`, bawaan `"assistant"`): hook Stop menahan giliran sekali saat isi rekap berubah, dan agent menutup dengan tabel itu (dirender TUI). Tidak ditahan bila pesan terakhir agent sudah memuatnya (`last_assistant_message`) atau giliran itu sudah pernah ditahan (`stop_hook_active`). `"system"` = perilaku lama (`systemMessage`, teks polos).
- **Slug pendek di tabel**: kolom item dan perintah di `next`/`sisa`/rekap memakai slug tanpa tanggal bila unik, jadi sel tidak terpotong.

## 1.13.0
Rilis jembatan ke **2.0.0 "satu pintu"** (keputusan D6–D19 di `ROADMAP.md`). Aditif: tidak ada yang dihapus, folder `docs/work` tetap ada.
- **Plane = pintu diskusi** (`plane.push_content`, `pull_comments`, `mention_user_id`, `pull_min_interval_s`): kartu kini berisi **Tujuan** (Objective di `brief.md`), **Konteks**, **Keputusan** (D yang terjawab, klaim dikoreksi/diterima, Decision log), dan **Checklist** AC (to-do list Plane; AC berbukti dicentang). Dikirim setelah tiap `plane sync`, hanya bila isinya berubah. Judul kartu diringkas.
- `plane pull [slug]`: kartu + komentar ditarik ke cermin lokal `.harness/plane/<slug>.md` (tidak di-commit, hanya dibaca). Komentar manusia yang baru masuk inbox dan muncul **sekali** sebagai konteks di prompt berikutnya; centang checklist yang dibuat di Plane ditandai bila bukti lokal belum ada. Ditarik di latar saat awal sesi dan tiap prompt (maks 1×/menit); ketikan **`tarik`** = tarik sekarang.
- **Deskripsi yang diedit di Plane tidak ditimpa** (D20): `push` menyimpan hash deskripsi seperti yang tersimpan di Plane; bila berubah sejak kiriman terakhir, kiriman DITAHAN dan agent diberi tahu lewat inbox untuk menyelaraskan, lalu `plane push <slug> --force`. Centang checklist tidak dihitung sebagai ubahan.
- `plane comment <slug> <teks>` (agent membalas di kartu) dan `plane ask <slug> --decide` (tabel keputusan align, dibuat kode, dengan **@mention** ke `mention_user_id`). Hook Stop mengirim `ask --decide` di latar saat menahan giliran karena keputusan (D19: @mention hanya saat keputusan menahan pekerjaan). Komentar agent ditandai `[harness] agent`.
- `plane migrate` (dry-run bawaan: rencana per item + daftar knowledge yang akan jadi Pages), `--apply` (buat/perbarui kartu termasuk item `merged`, tempel `summary.md` sebagai komentar sekali, tandai `plane_migrated`), `--verify` (baca balik: tiap AC harus ada di kartu). **Folder lokal tidak dihapus** di 1.13 (D18); penghapusan dan knowledge → Pages di 2.0.
- **Pilot 2.0** (`pilot.enabled`, `hours` 6, `max_misfires` 0, `min_ships` 1; `pilot --hours N|--days N`): frasa yang ditangkap hook, slash `/harness:*`, penahanan Stop, dan koreksi dicatat lokal di `.harness/state/intent-log.jsonl` (prompt dipotong 60 karakter). `harness.mjs pilot` menilai S1–S4. Ketikan **`bukan itu`** / `salah tangkap` = intent terakhir ditandai salah tangkap dan dibatalkan bila bisa (izin merge dicabut, memori dihapus lagi).
- **Slash usang**: `/harness:approve`, `status`, `next`, `quick` memberi pengganti pendeknya (D8: di 2.0 hanya `init` dan `update` yang tampil).
- **`harness.mjs migrate [--apply]`** dan baris `doctor` "siap 2.0" (info): align format lama, flag yang dikunci di 2.0 (D7: flag tetap ada sebagai escape hatch), kesiapan Plane, item yang belum dimigrasi. `align.md` format lama diberi bagian `## Keputusan terbuka` otomatis di awal sesi (D10).
- **Slug dan judul ringkas**: kata pengisi ("oke", "tolong", "disini aku ingin kamu", ...) dibuang, slug ≤ 40 karakter (`new` dan `quick`).

## 1.12.0
Menutup sisa tujuan T2 (tidak mondar-mandir) dan T3 (tabel, bukan narasi) dari `ROADMAP.md`. Aditif, di belakang flag.
- **Tabel keputusan dibuat kode** (F1): `harness.mjs decide [slug]`, ketikan `keputusan` / `apa yang harus aku jawab?`. Sumber: klaim `bertentangan`/`dugaan` di `align.md` + bagian baru `## Keputusan terbuka` (`| D1 | pertanyaan | opsi | jawaban |`, jawaban kosong = terbuka). Tiap baris berisi cara menjawab; baris terakhir = satu langkah berikutnya yang sah. `sisa` dan pesan tolak `align ok` memakai sumber yang sama.
- **Hook Stop menahan giliran** yang menyentuh item draft belum-aligned sampai tabel itu ditampilkan, sekali per isi tabel per sesi; `stop_hook_active` tidak ditahan lagi (`align.decision_table`).
- **Plan setelah aligned** (F2): `gate` menolak AC baru/berubah di `plan.md` sebelum `aligned` (`align.block_plan_before_aligned`); bagian plan lain tetap bisa diedit. Dikecualikan: quick, `analysis`/`onboard`, `align.required: false`.
- **Langkah berikutnya dari kode** (F3): `next` membedakan klaim bertentangan / dugaan atau D terbuka / siap `align ok`; perintah memakai slug pendek (tanpa awalan tanggal) bila unik. Rule baru `O-07`: langkah untuk user disalin dari `next`/`decide`.
- **`terima Cn` tersimpan segera** di `align.md` (dan audit) walau align belum bisa ditutup karena klaim lain.
- **`doctor`: versi plugin skill** (F4) dibandingkan dengan kernel lewat `claude plugin list`; beda = GAGAL dengan perintah perbaikan; tak terbaca = TIDAK DIPERIKSA.
- Skill `align`, `impact`, `plan`: pertanyaan sebagai baris D, balasan = keluaran `decide`/`next`; template `align.md` punya `## Keputusan terbuka`.

## 1.11.0
Lanjutan ATM dari Hermes Agent dan antislop (`ROADMAP.md`). Aditif; semua di belakang flag.
- **Profil user per orang** (`memory.user_enabled`, `user_max_chars` 1375): `~/.harness/USER.md`, di luar repo (root dipakai bersama tim). `ingat user: ...`, `lupakan U2`, agent `memory add --user`. Dimuat di awal sesi sebelum memori project; `memory list` menampilkan keduanya.
- **Playbook** (`playbooks.enabled`, `max_chars` 6000, `index_max` 20): `docs/memory/playbooks/<nama>.md` dengan frontmatter `name` + `description`, ditulis agent (padanan skill dari pengalaman Hermes). Progressive disclosure: awal sesi hanya nama + deskripsi. `harness.mjs playbook list|lint` (error: nama ≠ berkas, deskripsi kosong/terlalu panjang, terlalu besar, secret; saran: tanpa `## Langkah`/`## Verifikasi`, berbentuk log PR). Yang gagal lint tidak dimuat. `recall` ikut mencari playbook. Rule baru path-scoped `.claude/rules/playbook.md`.
- **ID aturan** (gaya R-01 antislop): tiap butir rule ber-ID (`O-`, `S-`, `W-`, `K-`, `M-`, `P-`). Reviewer dan `review.md` punya kolom `aturan`. `check-repo` menolak butir tanpa ID dan ID ganda.
- README: tabel sebelum/sesudah.

## 1.10.0
Fokus: **mudah dipakai, tidak mondar-mandir.** Semua aditif, perintah `/harness:*` lama tetap berlaku; tiap fitur punya flag di `harness.config.json`. Rencana lengkap dan riset (antislop, Hermes Agent): `ROADMAP.md`.
- **Intent tanpa slash** (`intent.enabled`): hook `UserPromptSubmit` memetakan kalimat pendek (≤ `intent.max_chars`, 120) ke perintah: `setuju <slug>`, `align ok <slug> [terima C2]`, `kirim <slug>`, `quick: ...`, `sisa`, `ingat: ...`, `ingat P1`, `lupakan M2`. Slug boleh potongan unik; slug tak dikenal atau kalimat lebih panjang diteruskan sebagai chat biasa. Modul baru `intent.mjs`.
- **Align tidak lagi buntu pada klaim "bertentangan"**: pesan penolakan berupa tabel klaim + dua opsi. `align ok <slug> terima C2,C3|semua` = manusia menerima risikonya; baris diubah ke `diterima (manusia)` dan dicatat di `## Debat`. Matikan: `align.accept_contradictions: false`.
- **Tabel "Belum selesai"** (`recap`): `harness.mjs open [--mine] [--json]` dan ketikan `sisa`. Isi: langkah per item, Open questions di `brief.md`, klaim dugaan/bertentangan, AC tanpa bukti, blocker review, usulan memori. Hook `Stop` menampilkannya ke user (`systemMessage`) untuk item yang disentuh sesi, hanya bila isinya berubah (`recap.on_stop`). Modul baru `recap.mjs`.
- **Memori project** (`memory`, diadaptasi dari Hermes): `docs/memory/MEMORY.md` dibatasi `max_chars` (2200), disuntik sebagai snapshot di awal sesi; penuh = ditolak (tidak dipadatkan diam-diam). Manusia: `ingat: <fakta>`, `ingat P1|semua`, `lupakan M2`. Agent: `harness.mjs memory add` masuk antrean `pending.md` (`write_approval`); `memory approve|rm|reject` diblokir untuk agent. MEMORY.md dilindungi dari Edit/Write. Modul baru `memory.mjs`.
- **Jejak dan rujukan pekerjaan lama**: saat `done`/`merged`, item dicatat di `docs/memory/INDEX.md` dan maks `learn_max` keputusan dari `## Decision log` diusulkan sebagai pelajaran (antrean). `harness.mjs recall <kata>` mencari di ringkasan/brief/align/sesi/memori (lokal, nol token). `ref:<slug>` di prompt menyuntik `summary.md` item itu.
- Rule `output.md`: diskusi = tabel keputusan (maks 4 baris), giliran yang mengubah item ditutup tabel Belum selesai. Skill `align`: balasan berupa tabel klaim yang menunggu keputusan.
- **"push PR + merge" = satu keputusan** (`ship.merge_on_request`, bawaan nyala; `ship.intent_ttl_min` 240): ketikan ship (bentuk pendek atau `/harness:ship`) saat PR belum ada atau check belum hijau ditulis hook sebagai izin merge tertunda (`.claude/state/merge-tickets/intent-<slug>.json`, dilindungi). Fase A langsung dijalankan agent (skill `ship` kini boleh dipanggil model, hanya atas konteks hook). `harness.mjs ship` tanpa tiket memakai izin itu untuk menerbitkan tiket sendiri dengan pemeriksaan penuh (gate, OPEN, bukan draft, check hijau, akses, SHA); belum hijau = tidak merge dan izin tetap. Setelah `merged`: `summary.md`, `docs/memory/INDEX.md`, skill summarize. Tanpa slug = satu-satunya item `done`. Ketikan ship pada item yang belum `done` kini ditolak dengan langkah berikutnya.
- **Memori gaya Hermes** (`memory.write_approval: false` bawaan): agent menulis dan merapikan memori sendiri (`memory add`, `memory forget`); pelajaran dari Decision log langsung masuk, dan masuk antrean bila memori penuh. `write_approval: true` = mode antrean + `memory approve|forget|reject` hanya manusia. Subperintah `memory rm` diganti `forget` (`rm` di baris perintah terbaca sebagai hapus berkas oleh guard).
- **Upgrade dari 1.9.x**: `docs/work`, `docs/knowledge`, `docs/sessions` tetap utuh dan config buatanmu menang (diuji: pasang 1.9.0 → `--update`). Sesi pertama setelah update mengindeks item `done`/`merged` lama ke `docs/memory/INDEX.md` (sekali, tanpa token); `recall` dan `ref:<slug>` langsung menjangkau ringkasan lama. Manual: `harness.mjs memory reindex`. `docs/memory` masuk daftar data yang dipertahankan installer. `MEMORY.md` mulai kosong (knowledge per service tetap di `docs/knowledge`).
- Ringkasan ditulis ke `docs/work/<slug>/summary.md` di root `main` (bukan push ke branch `staging`: root selalu `main`, dan `staging` branch dilindungi).

## 1.9.0
Fase 1 integrasi Plane: **sinkron status satu arah**, work item lokal → kartu Plane. Mati bawaan; root yang tidak menyalakannya tidak berubah perilaku.
- Baru: `.claude/hooks/plane.mjs` dan perintah `harness.mjs plane sync [slug] [--dry-run] [--include-merged]` / `plane check`. Kartu dibuat di state sesuai status (`external_id` = slug, `external_source` = `harness`), `plane_id` ditulis ke frontmatter `plan.md` (sudah diabaikan oleh pembekuan plan), tiap pemindahan kolom memberi komentar bertanda `[harness]`.
- Config `plane`: `enabled`, `base_url` (https; http hanya localhost), `workspace`, `project_id`, `token_env` (nama variabel lingkungan; token tidak pernah di berkas), `marker`, `states` (status harness → nama state Plane; astra: `in-review` → `In Review`). Blok `plane` lama (`enabled:false, project_id:null`) tetap kompatibel; installer tidak lagi menandainya sebagai modul lama.
- Pemicu: `audit` untuk peristiwa `status`/`approve`/`quick`/`promote` dan awal sesi menjalankan sync di proses latar (`planeKick`); tidak menunda hook, gagal diam, satu proses sekaligus (kunci `.harness/plane.lock`). Yang gagal dikirim diulang pada sync berikutnya.
- Keamanan: tanpa redirect, timeout 10 dtk, galat disaring `redact`, pesan galat tanpa header; `doctor` GAGAL bila `enabled` tanpa konfigurasi/token lengkap.
- Belum: Plane Wiki, polling dari Plane (Todo memulai Build), isi task di Plane.

## 1.8.5
Ditemukan saat update yhpa di Windows: `gc --yes` mencetak "dihapus: 0 dari 1" tanpa alasan karena worktree-nya **terkunci** (Claude Code mengunci worktree buatannya selama sesi hidup: `claude session <nama> (pid N)`; git menolak menghapus yang terkunci).
- `gc`: worktree root yang terkunci tidak masuk rencana hapus. Laporan "DITAHAN" menyebut alasan kunci dan cara menanganinya: tutup sesinya, atau bila sesi sudah mati, `git worktree unlock <path>` (keputusan manusia). Alasan lain (kotor, belum digabung, folder hilang) tetap disebut bersamaan.
- `doctor`: baris "tidak ada worktree di root" menandai `[dikunci]` pada worktree yang terkunci.
- Baru: workflow `.github/workflows/release.yml`. Saat `VERSION` berubah di `main`, ia membuat tag `vX.Y.Z` dan GitHub Release dengan catatan dari bagian `## X.Y.Z` di CHANGELOG. Dilewati bila release-nya sudah ada; gagal (merah) bila `VERSION` bukan semver atau bagian CHANGELOG-nya tidak ada. Hanya memakai `GITHUB_TOKEN` (`contents: write`). Alur rilis jadi: bump, PR, merge; tag dan release menyusul otomatis.

## 1.8.4
Untuk root ber-layout multi-repo: sesi background Claude Code (`claude --bg`, agent view) tidak lagi dipindah ke worktree di `.claude/worktrees/`. Itu perilaku bawaan Claude Code dan bertentangan dengan kebijakan 1.8.3 (root selalu di `main`).
- Installer menulis `{"worktree": {"bgIsolation": "none"}}` ke `.claude/settings.json` root, hanya untuk layout multi-repo (kunci dan nilai resmi: halaman agent view Claude Code). Nilai `bgIsolation` yang sudah dipilih user tidak ditimpa; kunci `worktree` lain milik user dibawa.
- `doctor`: baris baru "sesi background tidak dipindah ke worktree" (GAGAL bila multi-repo dan tidak ada `bgIsolation: "none"` di `settings.json` atau `settings.local.json`).
- `update-all.mjs` dan README: alur `harness-update.mjs` (di `main`, tanpa branch tambahan) dijadikan jalur update project; `update-all.mjs` mencetak catatan bahwa alur lamanya membuat branch `harness-update`.
- Batas yang perlu diketahui: setelan ini mengatur sesi background. Sesi yang kamu pindahkan ke background dengan `←` atau `/background` memang tidak pernah dipindah, dan worktree yang dibuat manual (mis. dari opsi worktree di aplikasi desktop) tidak diatur olehnya; `guard-bash` hanya menolak `git worktree add` oleh agent.

## 1.8.3
Kebijakan untuk semua project ber-layout multi-repo: **root selalu di `main`, tanpa worktree atau branch untuk root.** Catatan kerja (`docs/`) ditulis langsung di root `main` (commit oleh manusia); worktree hanya di repo service.
- `AGENTS.md`: aturan ditambahkan di "Batas keras".
- `guard-bash`: agent tidak bisa `git worktree add` di root (boleh di repo service: `git -C source-code/<svc> worktree add ...`, atau `cd` ke service). Layout `single` tidak terkena.
- `doctor`: baris baru "tidak ada worktree di root" (GAGAL bila ada).
- `gc`: worktree root yang bersih dan sudah digabung masuk rencana; `gc --yes` (hanya manusia) menghapusnya lewat `git worktree remove` tanpa `--force` dan tanpa menghapus cabangnya. Yang kotor, belum digabung, atau foldernya hilang ditahan dan dilaporkan.
- Installer: `.claude/worktrees/` masuk `.gitignore` root. Catatan: bila folder itu sudah terlanjur ter-track sebagai gitlink, hapus dari indeks dengan `git rm --cached` (installer tidak melakukannya).

## 1.8.2
Perbaikan gerbang Stop, ditemukan saat uji di Claude Code 2.1.318:
- Gerbang hanya menahan sesi yang mengerjakan item itu. Sebelumnya penanda "baru disentuh" memakai mtime berkas, padahal `git clone/pull/switch/merge` menulis ulang mtime semua berkas, sehingga sesi yang hanya menjalankan `/harness:status` ikut ditolak berhenti karena item lama milik orang lain. Kini `post.mjs` mencatat item yang disentuh tiap sesi (tulis ke `docs/work/<slug>/...`, atau perintah shell yang menyebut slug) di `.harness/state/touched-<sesi>.json`, dan `stop.mjs` hanya memeriksa item itu.
- `stop_gate.recent_hours` tidak lagi dipakai (kunci dibiarkan di config demi kompatibilitas).
- `PILOT.md` 9.4: wizard `/agents` sudah dihapus di Claude Code 2.1.318; routing diperiksa lewat berkas agent dan `measure`.

## 1.8.1
Perbaikan installer `--update`, ditemukan saat uji di project nyata:
- `docs/knowledge/_init.md` (log `/harness:init` milik user) tidak lagi ditimpa templat. Yang diperbarui di folder data hanya berkas bawaan harness: `docs/work/_TEMPLATE/*`, `docs/work/README.md`, `docs/knowledge/README.md`.
- `services`, `layout`, dan rule `svc-*.md` tidak lagi dihapus bila foldernya tidak ada di `source-code/` pada mesin itu (klon sebagian, repo belum di-clone). Service tersebut dipertahankan dan dilaporkan sebagai peringatan; `doctor` tetap menandainya. Service baru di disk ditambahkan di belakang urutan lama.

## 1.8.0
Baru: `.harness/events.jsonl` (event bermakna, rotasi, redaksi), `harness.mjs watch` (TUI papan kerja, Node murni), `summary.md` otomatis saat `done`/`merged`, `harness.mjs gc` (rencana; `--yes` hanya manusia), `harness.mjs log` kini membaca event log. `progress.md` template punya bagian `## Decision log`. Tidak ada perubahan perilaku yang merusak dari 1.7.0.

Catatan: rencana awal menyebut TUI sebagai binary Go; diganti Node murni karena repo ini tanpa dependency dan tanpa langkah build/rilis binary per OS.

## 1.7.0
Perintah `/harness:*` tidak berpenanda versi. Nama skill lama tetap berlaku (`init impact plan approve build review ship status knowledge next quick summarize`); ditambah `align` dan `update`. Tag/branch cadangan lama (`harness-pre-v1-*`, `harness-v1`) tidak diubah demi kompatibilitas.

| nama lama / perilaku lama | sekarang |
|---|---|
| label produk "Harness v1" (plugin, judul, banner) | "Harness" |
| `impact → plan → approve` | `impact → align → plan → approve` (item standard butuh `aligned`; quick, `analysis`, `onboard` dikecualikan; matikan: `align.required: false`) |
| `brief.md` berisi tabel permintaan/tujuan | objective saja: Objective, Success criteria, Out of scope, Open questions |
| `explorer`/`reviewer`/`implementer` semua mewarisi model sesi | sesi utama Sonnet; `scout`, `runner` Haiku; `reviewer` Opus (`omitClaudeMd`) |
| test hanya dijalankan gate saat `done` | `run-checks` menulis `.harness/evidence/<slug>/tests.json`; hook `Stop` menolak berhenti tanpa bukti |
| tidak ada serah-terima antar sesi | `.harness/handoff.md` (PreCompact/SessionEnd) disuntik di SessionStart |
| update lewat branch `harness-update` + review | tetap tersedia; ditambah `harness update` (di `main`, `pull --ff-only`, commit `chore(harness): update to vX.Y.Z`, push hanya bila `update.autoPush`) |

Berubah yang perlu kamu tahu: `.claude/settings.json` kernel sekarang menetapkan `"model": "sonnet"` (menimpa pilihan model di settings project; ubah setelah update bila perlu). `.harness/` masuk `.gitignore`. Work item `draft` yang sedang berjalan butuh `align.md` sebelum di-approve (salin template dari `docs/work/_TEMPLATE/align.md`, atau set `align.required: false` sementara).

Cara update pertama ke 1.7.0 (root masih 1.6.x, belum punya perintah `update`): `git pull` di folder agent-harness, lalu `node <agent-harness>/scripts/harness-update.mjs <root>` (atau `--all` setelah root terdaftar). Skrip ini juga memperbarui plugin skill global (`--no-plugin` untuk melewati). Setelahnya `/harness:update` dan kalimat "tolong root nya di update ke main" tersedia di root itu.

Baru: WorkStore (`store.mjs`, backend lokal), `harness.mjs run-checks | log | measure | update`, config `store`, `align`, `stop_gate`, `handoff`, `update`.
