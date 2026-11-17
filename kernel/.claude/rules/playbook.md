---
paths:
  - "docs/memory/playbooks/**"
---
# Menulis playbook (prosedur yang dipelajari)

- P-01. Buat playbook setelah kamu menyelesaikan alur multi-langkah yang layak diulang, menemukan jalan keluar dari galat/buntu, atau dikoreksi user tentang cara kerja. Bukan untuk fakta satu baris (itu `memory add`).
- P-02. Satu berkas = satu prosedur: `docs/memory/playbooks/<nama>.md`, nama huruf kecil dan `-`. Perbarui playbook yang ada bila sudah ada yang mirip; jangan membuat duplikat.
- P-03. Frontmatter wajib: `name` (= nama berkas) dan `description` (satu kalimat ≤ 200 karakter: KAPAN dipakai). Deskripsi itulah yang dimuat di awal sesi.
- P-04. Isi: `## Kapan dipakai`, `## Langkah` (bernomor, perintah persis), `## Jebakan`, `## Verifikasi`. Maks `playbooks.max_chars` (6000). Tanpa secret, tanpa data produksi.
- P-05. Prosedur, bukan log kejadian: jangan menumpuk nomor PR/issue atau kronologi.
- P-06. Periksa: `node .claude/hooks/harness.mjs playbook lint`. Playbook yang gagal lint tidak dimuat.
- P-07. Opsional: `bidang: backend|frontend|devops|dba` di frontmatter. Playbook berlabel hanya disebut ke spesialis bidang itu saat eksekusi; tanpa label = umum.

```markdown
---
name: rilis-hotfix-api
description: Saat perlu hotfix service api ke production tanpa menunggu rilis mingguan.
---
## Kapan dipakai
## Langkah
1. ...
## Jebakan
- ...
## Verifikasi
- ...
```
