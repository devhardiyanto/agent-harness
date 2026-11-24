---
name: bootstrap
description: Membangun atau menyegarkan pengetahuan satu service di source-code/ ke docs/knowledge/<svc>/ (summary.md, patterns.md) dan docs/_map.md. Manual, per service, saat user memintanya ("bootstrap <svc>", "/bootstrap <svc>").
argument-hint: "<service>"
disable-model-invocation: true
---
# Bootstrap knowledge

Masukan: `$ARGUMENTS` = satu nama service di `harness.config.json` → `services`. Kosong → tampilkan daftar service dan status `docs/knowledge/<svc>/summary.md` (ada/tidak, `updated`), lalu minta user memilih satu.

## Langkah
1. Baseline = branch deploy service (`production`, lalu `main`/`master`, atau `origin/HEAD`). Jangan checkout ulang repo user: baca lewat `git -C source-code/<svc> show <baseline>:<path>` dan `git -C source-code/<svc> ls-tree -r --name-only <baseline>`, atau minta `scout` melakukannya.
2. Delegasikan pembacaan ke `scout` (satu panggilan per area: entry point, routing/endpoint, data/migrasi, konfigurasi + perintah). Sesi utama hanya merangkum.
3. Tulis `docs/knowledge/<svc>/summary.md` (≤ 80 baris) dan `patterns.md` (≤ 150 baris) sesuai `.claude/rules/knowledge.md`. Frontmatter: `service`, `source_commit` (SHA baseline), `updated`.
4. Perbarui baris service di `docs/_map.md` (stack, peran, branch default) dan relasi yang terbukti.
5. Balas: path berkas · jumlah `UNKNOWN` · perintah test/lint yang ditemukan · service berikutnya yang disarankan.

Jangan mengubah kode service. Jangan commit.
