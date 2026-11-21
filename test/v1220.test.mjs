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
