# Uji terukur Graphify (sebelum `graphify.enabled: true`)

Kriteria ditetapkan SEBELUM menjalankan uji. Bila salah satu gagal, Graphify tetap nonaktif.

**Setup**: satu service (yang bahasanya didukung tree-sitter; Vue/Nuxt belum dikonfirmasi: uji dulu pada Laravel/PHP atau Go). Bangun graph dari worktree baseline (`harness.mjs worktree add <svc>` → `graphify update <path>`).

**Soal**: 5–8 pertanyaan dampak yang jawabannya SUDAH Anda ketahui (mis. "siapa yang memanggil `X`?", "apa yang rusak bila kolom `Y` berubah?"). Tulis jawaban benar (daftar file) lebih dulu.

| # | pertanyaan | jawaban benar (file) | grep/knowledge saja: ditemukan | + graph: ditemukan | token impact tanpa graph | token impact dengan graph |
|---|---|---|---|---|---|---|

**Ukur**: tiap soal dijalankan dua kali pada sesi baru (`/usage` sebelum dan sesudah), tanpa dan dengan graph.

**Aturan keputusan**
- recall(dengan graph) ≥ recall(tanpa graph) pada semua soal, **dan**
- token fase impact turun berarti (ambang Anda sendiri, mis. ≥ 30%), **dan**
- tidak ada hasil graph yang menyesatkan (kesimpulan salah yang dikatakan yakin).
Lolos → nyalakan untuk service itu saja. Gagal → catat hasilnya di sini dan biarkan nonaktif. Klaim hemat token dari README Graphify tidak dipakai sebagai bukti.
