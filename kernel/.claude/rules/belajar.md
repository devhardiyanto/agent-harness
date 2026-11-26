# Belajar dan pengetahuan

- B-01. Memori dimuat di awal sesi (`docs/memory/MEMORY.md`, `~/.harness/USER.md` lewat `CLAUDE.md`). Pakai sebelum bertanya ulang atau menjelajah kode.
- B-02. User mengoreksi cara kerja, gaya, atau fakta → jalankan skill `belajar` di giliran itu juga, lalu lanjutkan.
- B-03. Simpan hanya yang ada buktinya di percakapan. Ragu = jangan simpan.
- B-04. Urutan mencari jawaban: memori → skill yang cocok → `docs/knowledge/<svc>/` → `topic find` (topik dan sesi lama) → kode. Sumber yang sudah menjawab dengan bukti tidak perlu dicari ulang.
- B-05. Sebelum merencanakan perubahan di service X: `node .claude/hooks/harness.mjs knowledge X`. "belum ada" → jalankan skill `bootstrap X` (mode ringkas) dulu. Ada catatan menunggu merge yang sudah merged → pindahkan ke fakta (skill `bootstrap`). "usang" → sebut di jawaban, segarkan bagian yang dipakai.
