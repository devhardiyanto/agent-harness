---
name: refresh
description: Memperbarui pengetahuan service yang berubah sejak onboarding (berdasarkan source_commit) tanpa mengulang seluruh analisa.
argument-hint: "<nama-service|all>"
disable-model-invocation: true
---
# /harness:refresh

Masukan: `$ARGUMENTS`.

## Langkah
1. Per service: baca `source_commit` di frontmatter `docs/knowledge/<svc>/summary.md`; bandingkan dengan `git -C source-code/<svc> rev-parse HEAD`. Sama → lewati.
2. Berbeda → `git -C source-code/<svc> diff --stat <source_commit>..HEAD`. Hanya area berubah yang di-explore ulang (agent `explorer`).
3. Edit bagian terdampak di `summary.md`/`patterns.md`, perbarui `source_commit` dan `updated`. Status tetap (`verified` → `draft` bila perubahan material).
4. Perbarui graph service itu bila ada: `graphify update source-code/<svc>` lalu pindahkan `graphify-out` ke `docs/knowledge/graph/<svc>` (lihat `/harness:onboard` langkah 4). Perbarui `_map.md` bila relasi berubah.
5. Tabel hasil: service | commit lama→baru | bagian diubah.

## Balasan chat (maks 5 baris)
n service diperbarui, m dilewati · path tabel · temuan yang perlu keputusan user.
