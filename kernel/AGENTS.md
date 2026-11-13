# Harness — aturan kerja agent

Bahasa: Indonesia lugas; istilah teknis tetap baku. Sumber kebenaran plan = file di `docs/work/`, bukan chat.

## Peta
- Pertama kali di workspace: `/harness:init` (inventaris, baseline production/main, knowledge, usulan checks). Peringatan "tertinggal" di awal sesi → `/harness:knowledge refresh <svc>`.
- `docs/_map.md` — service, peran, relasi antar-service (L0). Baca dulu.
- `docs/knowledge/<svc>/` — ringkasan (L2) dan pola + contoh emas (L3) per service. Baca hanya service yang kena. Status `draft` = belum diverifikasi manusia: petunjuk, bukan fakta. Kutipannya diberi label `[draft]` dan dicek ke kode sebelum jadi dasar AC.
- `docs/work/<tanggal-slug>/` — `brief.md` `impact.md` `align.md` `plan.md` `progress.md` `review.md`.
- Model: sesi utama Sonnet; `scout`/`runner` Haiku (murah, read-only / menjalankan test); `reviewer` Opus (menolak/menyetujui). Handoff otomatis: `.harness/handoff.md` disuntik di awal sesi berikutnya.

## Alur (satu work item = satu alur penuh)
1. `/harness:impact <permintaan>` — dampak dari prompt pertama → `brief.md` (objective saja), `impact.md`.
2. `/harness:align <slug>` — uji klaim permintaan ke kode secara skeptis → `align.md`. Pertanyaan untuk user = baris D di `## Keputusan terbuka`, bukan narasi. Tutup giliran dengan keluaran `harness.mjs decide <slug> --md` apa adanya (hook Stop menahan sampai itu ditampilkan). Debat maks 3 ronde; user menutup dengan `align ok <slug>` (hook menulis `aligned`). Temuan sampingan → parking lot.
3. `/harness:plan <slug>` — hanya setelah `aligned` (hook menolak AC di `plan.md` sebelumnya). `plan.md` berstatus `draft` (AC bernomor `- AC1: ...`). **Sesi planning berhenti di sini.**
4. User mengetik `/harness:approve <slug>` → hook menulis `approved` (butuh `aligned`). Agent tidak boleh.
5. Sesi baru: `/harness:build <slug>` → `in-progress`, catat bukti per AC di `progress.md`. Test dijalankan agent `runner` (bukti ditulis kode, bukan agent); sesi tidak bisa berhenti bila bukti test belum ada.
6. `/harness:review <slug>` → `review.md` (`verdict: clean|blockers`, agent `reviewer`). Ada blocker → kembali ke build.
7. `done` hanya bila tiap AC punya bukti + review `clean` (hook memeriksa). 
8. `/harness:ship <slug>` atau ketikan user "push PR + merge" — branch kerja, commit, push, PR via `gh`; dengan izin merge dari hook, `harness.mjs ship <slug>` setelah check hijau, lalu ringkasan. `merged` setelah PR benar-benar MERGED.

Status: `draft → approved → in-progress → in-review → done → merged`. Plan beku setelah approved; revisi besar = `reopen` lalu approve ulang; tambahan AC kecil = `harness.mjs amend <slug> --ac "..."` (maks 3).

## Lajur quick (perubahan kecil)
User mengetik `/harness:quick <permintaan>`: hook membuat item `approved` (ketikan itu = persetujuan). Satu service, maks 5 file, bukan skema, dikerjakan di sesi yang sama, tanpa `in-review` (bukti AC + checks). Melebihi batas → `harness.mjs promote <slug>` lalu plan + approve. Bingung langkah berikutnya: `/harness:next`.

## Bahasa pendek user (1.10.0, diproses hook)
"setuju <slug>" = approve · "align ok <slug> [terima C2]" · "push PR + merge [slug]" / "kirim <slug>" (= buka PR, merge saat check hijau, ringkasan; tanpa slug = satu-satunya item done) · "quick: <permintaan>" · "sisa" = tabel belum selesai · "keputusan [slug]" / "apa yang harus aku jawab?" = tabel keputusan align · "ingat: <fakta>" / "ingat P1" / "lupakan M2" = memori project · "ingat user: <preferensi>" / "lupakan U2" = profil user · "ref:<slug>" = muat ringkasan item lama. Slug boleh potongan unik.

## Plane (1.13.0, bila `plane.enabled`)
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

## Format keluaran
- Plan, analisa, dan temuan = file/tabel/checklist, bukan narasi.
- Balasan chat maksimal 5 baris: apa yang selesai + path file + langkah user berikutnya.
- Tabel dari `harness.mjs` untuk user: jalankan dengan `--md`, tempel sebagai tabel Markdown di luar code block (dirender TUI). Tanpa `--md` = garis kotak untuk `!`.
- Jangan mengulang isi file ke chat. Jangan menulis esai.

## Minimalis
Sebelum menambah kode/dependency: perlu ada? sudah ada di codebase? stdlib/native cukup? dependency terpasang cukup? satu baris cukup? Ambil yang terkecil. Tangga lengkap: `.claude/rules/minimalis.md`.

## Konteks
Peringatan di ±400k token: simpan status ke `progress.md`, sarankan sesi baru.
