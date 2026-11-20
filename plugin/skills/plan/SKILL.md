---
name: plan
description: Menulis plan.md (acceptance criteria bernomor, langkah per service, verifikasi, rollback) untuk work item. Berhenti di status draft; tidak mengimplementasikan.
argument-hint: "<slug>"
user-invocable: false
---
# /harness:plan

> **Bentuk tunggal** (frontmatter `bentuk: tunggal` di `plan.md`, bawaan item baru sejak 1.16): semua catatan ada di satu `plan.md`, bukan berkas terpisah. `brief` → `## 1. Objective` dan `## 2. Penjelasan` · `impact` dan `align` → `## 3. Dampak & konfirmasi` (tabel service, `### Klaim vs bukti kode`, `### Keputusan terbuka`; ronde di frontmatter `align_rounds`, jangan menulis `align: aligned`) · AC → `## 4. Eksekusi` (`- AC1: ...`) · bukti → `### Bukti` · review → `### Tinjauan` (`verdict: clean|blockers`) · `### Decision log`, `### Status terkini`. Bagian 1–3 dan teks AC beku setelah approved.

Masukan: `$ARGUMENTS` (slug work item). Sesi ini adalah sesi **planning**: tidak ada perubahan kode.

## Langkah
1. `node .claude/hooks/harness.mjs show <slug>`; status harus `draft`. Item standard (bukan quick/analysis/onboard) wajib sudah `aligned` (`docs/work/<slug>/align.md`, ditutup user lewat "align ok <slug>"); bila belum, berhenti dan tampilkan keluaran `node .claude/hooks/harness.mjs decide <slug> --md` apa adanya (hook juga menolak AC di `plan.md` sebelum aligned). Bila sudah `approved`+, plan beku: gunakan `reopen` hanya atas permintaan user.
2. Baca `brief.md`, `align.md` (klaim terverifikasi = dasar; parking lot BUKAN lingkup), `impact.md`. Pertanyaan blokir yang belum dijawab → tanyakan lewat `AskUserQuestion` (maks 4 sekaligus, opsi konkret), jangan menebak.
3. Baca `patterns.md` service yang disentuh agar langkah mengikuti pola nyata.
4. Isi `plan.md` (frontmatter: `services: [..]` dari impact; `status: draft` jangan diubah):
   - `## Acceptance criteria`: format persis `- AC1: ...`, tiap AC bisa dibuktikan (perintah, respons, langkah manual).
   - `## Langkah`: tabel #, service, perubahan, file perkiraan, AC yang dipenuhi. Urut sesuai urutan deploy.
   - `## Verifikasi (rencana)`: cara membuktikan tiap AC.
   - `## Rollback` konkret. `## Di luar lingkup` eksplisit.
5. Terapkan rule minimalis (`.claude/rules/minimalis.md`): tolak langkah/dependency yang tak perlu.
6. Tipe `hotfix`: plan ringkas 4 baris (gejala, akar masalah, perubahan minimal, verifikasi) + minimal 1 AC.
7. Tipe `schema`: sertakan tabel dba (perubahan, pemilik skema, konsumen, kompatibel mundur, urutan deploy, rollback, risiko data).
8. Tipe `analysis`: AC = pertanyaan yang harus terjawab; keluaran analisa ditulis ke `docs/work/<slug>/` sebagai tabel.

## Balasan chat (ringkas, persona R-13)
`plan.md` siap di `docs/work/<slug>/plan.md` (N AC, M langkah). Tinjau, lalu ketik "setuju <slug>". Setelah itu: "kerjakan <slug>" (boleh di sesi ini; sesi baru bila konteks > 50%). **Jangan mengimplementasikan sebelum user mengetiknya.**
