# Brief {{TASK_ID}} — {{judul singkat}}

> Dibaca oleh agy (executor). Agy TIDAK melihat percakapan Claude: semua yang dibutuhkan harus ada di sini.
> Satu brief = satu task = satu panggilan. Ditulis Claude di P3, bukan oleh agy.

## Task
{{Satu paragraf: apa yang diubah dan kenapa. Hanya perilaku yang diminta AC, tanpa perbaikan sampingan.}}

## Context
- Service: `source-code/{{service}}` (branch kerja sudah dibuat Claude)
- Pola yang diikuti: {{rujukan docs/knowledge/patterns-*.md}}
- Contoh emas (tiru gayanya): `{{path/ke/file/contoh}}`

## Scope
> Satu entri per baris, dalam backtick, relatif terhadap root workspace, WAJIB di bawah `source-code/{{service}}/`.
> Direktori ditulis dengan akhiran `/`. Hanya file di sini yang boleh berubah. Manifest dependency
> (package.json, composer.json, go.mod, lockfile) hanya boleh bila disebut persis di sini.
- `source-code/{{service}}/{{path/file-atau-glob}}`

## AC
> ID dari `docs/work/{{id}}/ac.md` (format EARS). Hanya yang tercantum di sini yang dikerjakan.
- {{AC-1}}: {{When ..., the system shall ...}}

## Boundaries
- Jangan commit, push, buat branch, atau ubah konfigurasi git.
- Jangan menambah/mengubah dependency, menjalankan migrasi, atau mengubah skema.
- Jangan refactor atau memperbaiki hal di luar Scope. Temuan di luar Scope masuk `open_questions`.
- Perintah shell yang boleh: `git status`, `git diff`, dan perintah cek service ini (lihat Done-when), PERSIS seperti tertulis,
  tanpa `cd`, pipe, atau argumen tambahan. Pilih direktori kerja lewat parameter `Cwd` (mis. `source-code/<svc>`), bukan `cd`. Selebihnya otomatis ditolak; jangan dicoba dengan cara lain.
- Jangan menulis atribusi AI di kode atau komentar.

## Done-when
> Dari `harness.config.json` → `projects.{{service}}` (`lint_command`, `test_command`; lewati yang null).
> Agy menjalankannya sendiri dan melaporkan exit code di `commands_run`. Claude menjalankan ulang yang sama di P5.
- `{{lint_command}}`
- `{{test_command}}`
- (curl / perilaku runtime: hanya dijalankan Claude di P5)

## Stop rule
Bila ada yang ambigu, bertentangan dengan AC, atau butuh sesuatu di luar Scope/Boundaries: HENTIKAN, isi
`status: "BLOCKED"` dan tulis pertanyaannya di `open_questions`. Jangan menebak dan jangan mengulang percobaan
yang ditolak dengan cara lain.

## Output
Balas hanya dengan JSON sesuai `docs/templates/executor-result.schema.json`:
task_id, status (DONE/PARTIAL/BLOCKED), files_changed (relatif root), commands_run (exit code asli, jangan dikarang), ac_claims
([{id, evidence}] — evidence = lokasi kode/baris yang memenuhi AC), deviations, open_questions.
