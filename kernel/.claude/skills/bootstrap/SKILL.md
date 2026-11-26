---
name: bootstrap
description: Membangun atau menyegarkan pengetahuan satu service di source-code/ ke docs/knowledge/<svc>/ (summary.md, patterns.md) dan docs/_map.md. Pakai saat user meminta ("bootstrap <svc>"), saat `harness.mjs knowledge <svc>` menyebut "belum ada", atau untuk memindahkan catatan "menunggu merge" yang sudah merged.
argument-hint: "<service>"
---
# Bootstrap knowledge

Masukan: `$ARGUMENTS` = satu nama service di `harness.config.json` → `services`. Kosong → tampilkan daftar service dan status `docs/knowledge/<svc>/summary.md` (ada/tidak, `updated`), lalu minta user memilih satu.

## Mode
- **Lengkap** (diminta user): seluruh langkah di bawah.
- **Ringkas** (otomatis sebelum topik menyentuh service tanpa knowledge): hanya `summary.md` ≤ 40 baris (stack, entry point, perintah test/lint, area yang disentuh topik). Satu panggilan `scout`.
- **Konfirmasi merge**: `node .claude/hooks/harness.mjs knowledge <svc>`. Baris "menunggu merge" yang `merged: ya` → tulis faktanya ke bagian yang sesuai, hapus barisnya, perbarui `source_commit` dan `updated`. Yang belum merged dibiarkan.

## Langkah
1. Baseline = branch deploy service (`production`, lalu `main`/`master`, atau `origin/HEAD`). Jangan checkout ulang repo user: baca lewat `git -C source-code/<svc> show <baseline>:<path>` dan `git -C source-code/<svc> ls-tree -r --name-only <baseline>`, atau minta `scout` melakukannya.
2. Delegasikan pembacaan ke `scout` (satu panggilan per area: entry point, routing/endpoint, data/migrasi, konfigurasi + perintah). Sesi utama hanya merangkum.
3. Tulis `docs/knowledge/<svc>/summary.md` (≤ 80 baris, akhiri dengan bagian `## Menunggu merge` kosong) dan `patterns.md` (≤ 150 baris) sesuai `.claude/rules/knowledge.md`. Frontmatter: `service`, `source_commit` (SHA baseline), `updated`.
4. Perbarui baris service di `docs/_map.md` (stack, peran, branch default) dan relasi yang terbukti.
5. Balas: path berkas · jumlah `UNKNOWN` · perintah test/lint yang ditemukan · service berikutnya yang disarankan.

Jangan mengubah kode service. Jangan commit.
