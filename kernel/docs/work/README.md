# Work items
Satu folder per permintaan: `YYYY-MM-DD-slug/`. Dibuat `/harness:impact`. Status ada di frontmatter `plan.md`.
Lihat daftar: `node .claude/hooks/harness.mjs list`
Snapshot untuk viewer: `node .claude/hooks/harness.mjs snapshot --json | clip` (Windows) lalu tempel di halaman viewer. Isi snapshot hanya metadata (slug, tipe, status, service, ID AC + status bukti, verdict review, baseline, kesegaran knowledge); tanpa judul, teks AC, bukti, atau path kode.
