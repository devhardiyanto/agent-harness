// 1.19.1: tidy tidak menuntut brief.md pada item lajur quick; --apply tanpa rencana memberi tahu; bidang tanpa services memberi petunjuk.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, wr } from './helpers.mjs';

test('tidy: item quick (folder) tanpa brief.md tidak dianggap tidak sesuai; --apply tanpa rencana menyatakan tidak ada yang diterapkan', () => {
  const root = project({ v1: true });
  const d = 'docs/work/2026-11-08-hapus-bio';
  wr(root, `${d}/plan.md`, '---\ntitle: hapus bio\ntype: fix\nlane: quick\nstatus: merged\nservices: [api]\ncreated: 2026-11-08\nupdated: 2026-11-08\npr: 1\n---\n# Plan (quick)\n\n## Acceptance criteria\n- AC1: x\n');
  wr(root, `${d}/progress.md`, '# Progress\n');
  const j = JSON.parse(hx(root, 'tidy', '--json').stdout);
  assert.ok(!j.structure.some((r) => r.slug === '2026-11-08-hapus-bio'), JSON.stringify(j.structure));
  const out = hx(root, 'tidy', '--apply').stdout;
  assert.match(out, /Tidak ada yang diterapkan/);
  assert.ok(fs.existsSync(path.join(root, d)));
});

test('bidang: services kosong → petunjuk, bukan tabel kosong', () => {
  const root = project({ v1: true });
  const cfgp = path.join(root, 'harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgp, 'utf8')); cfg.services = []; fs.writeFileSync(cfgp, JSON.stringify(cfg));
  const out = hx(root, 'bidang').stdout;
  assert.match(out, /services belum diisi/);
  assert.doesNotMatch(out, /│ service/);
});
