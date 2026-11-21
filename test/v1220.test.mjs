// 1.22.0: blok "BUTUH KEPUTUSANMU" (D38) dan persona G-17/G-18 (D39).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatOpen } from '../kernel/.claude/hooks/recap.mjs';
import { decisionBanner } from '../kernel/.claude/hooks/lib.mjs';

test('decisionBanner: heading dalam blockquote + path + kalimat baca ulang', () => {
  const b = decisionBanner('docs/work/x/plan.md', '2 keputusan');
  assert.match(b, /^> ## ⚠ BUTUH KEPUTUSANMU\n> \*\*2 keputusan\*\* ada di `docs\/work\/x\/plan\.md`\. Tolong dibaca ulang sebelum kita eksekusi\.$/);
});

test('formatOpen: baris yang menunggu "setuju" didahului blok; baris agent tidak', () => {
  const ask = formatOpen([{ item: '2026-x', label: 'x', jenis: 'langkah', apa: 'draft', siapa: 'kamu', aksi: 'tinjau plan.md; bila setuju ketik setuju x' }]);
  assert.match(ask, /^> ## ⚠ BUTUH KEPUTUSANMU\n> \*\*Persetujuan\*\* untuk `docs\/work\/2026-x\/plan\.md`/);
  const work = formatOpen([{ item: '2026-x', label: 'x', jenis: 'langkah', apa: 'approved', siapa: 'agent', aksi: 'skill build x' }]);
  assert.doesNotMatch(work, /BUTUH KEPUTUSANMU/);
});

test('persona G-17/G-18 dan O-09 ada di aturan kernel', () => {
  const k = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'kernel');
  const persona = fs.readFileSync(path.join(k, '.claude/rules/persona.md'), 'utf8');
  assert.match(persona, /G-17\. .*ditulis ke berkas work item/);
  assert.match(persona, /G-18\. .*BUTUH KEPUTUSANMU|## ⚠ BUTUH KEPUTUSANMU/);
  assert.match(fs.readFileSync(path.join(k, '.claude/rules/output.md'), 'utf8'), /O-09\./);
});

test('1.22.1: next --md memuat blok bila menunggu "setuju"; rekap tidak dianggap tampil tanpa blok', async () => {
  const { project, hx } = await import('./helpers.mjs');
  const { alreadyShown } = await import('../kernel/.claude/hooks/stop.mjs');
  const root = project({ v1: true });
  delete process.env.HARNESS_ITEM_BENTUK;
  const slug = hx(root, 'new', 'feature', 'bio').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  let t = fs.readFileSync(p, 'utf8').replace(/^align: open$/m, 'align: aligned');
  t = t.replace(/### Klaim vs bukti kode\n\| # \| klaim \| bukti path:baris \| status \|\n\|---\|---\|---\|---\|/, '### Klaim vs bukti kode\n| # | klaim | bukti path:baris | status |\n|---|---|---|---|\n| C1 | x | a.js:1 | terverifikasi |');
  t = t.replace(/## 4\. Eksekusi\n/, '## 4. Eksekusi\n- AC1: bio dibatasi\n');
  fs.writeFileSync(p, t);
  const out = hx(root, 'next', slug, '--md').stdout;
  assert.match(out, /^> ## ⚠ BUTUH KEPUTUSANMU/, out);
  const table = formatOpen([{ item: slug, label: 'bio', jenis: 'langkah', apa: 'draft', siapa: 'kamu', aksi: `tinjau plan.md; bila setuju ketik setuju ${slug}` }]);
  assert.equal(alreadyShown(table, `| ${slug} | draft | kamu | tinjau plan.md; bila setuju ketik setuju ${slug} |`), false);
  assert.equal(alreadyShown(table, `> ## ⚠ BUTUH KEPUTUSANMU\n| ${slug} | tinjau plan.md; bila setuju ketik setuju ${slug} |`), true);
});
