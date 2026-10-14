---
name: plane
description: Sinkronkan status work item ke Plane lewat MCP. Dipakai build dan ship; hanya bila plane.enabled true di harness.config.json.
argument-hint: "<slug>"
---
# plane (sinkron status)

Plane hanya menyimpan tautan dan status; sumber kebenaran adalah `plan.md`.

1. Baca `harness.config.json` → `plane`. `enabled: false` → berhenti diam-diam.
2. Cari tool MCP Plane (ToolSearch "plane"). Tidak ada → katakan satu baris bahwa MCP Plane belum terpasang; lanjutkan tanpa Plane.
3. Pemetaan (sama untuk semua project):

| status plan.md | state Plane |
|---|---|
| draft | Backlog |
| approved | Todo |
| in-progress | In Progress |
| in-review | Review |
| done | Review |
| merged | Done |

4. `plan_id`/work item Plane disimpan di frontmatter `plan.md` (`plane_id:`; boleh ditulis lewat Edit). Belum ada → buat work item di `plane.project_id` dengan judul + tautan ke `docs/work/<slug>/plan.md`.
5. Perbarui state sesuai tabel. Jangan menyalin isi plan ke Plane.
