# Work items
Satu folder per permintaan: `YYYY-MM-DD-slug/`. Dibuat `/harness:impact`. Status ada di frontmatter `plan.md`.
Lihat daftar: `node .claude/hooks/harness.mjs list`
Papan lokal: `node .claude/hooks/harness.mjs board --open` (atau `/harness:status board`) membuat `.claude/state/board.html` dengan snapshot tertanam; ulangi setelah status berubah. Snapshot untuk viewer di tempat lain (artifact): `node .claude/hooks/harness.mjs snapshot --json | clip` (Windows; `pbcopy` di macOS, `xclip -selection clipboard` di Linux) lalu tempel di halaman viewer. Isi snapshot hanya metadata (slug, tipe, status, service, ID AC + status bukti, verdict review, baseline, kesegaran knowledge); tanpa judul, teks AC, bukti, atau path kode.
