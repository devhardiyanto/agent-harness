// 1.19.6: klaim kosong tidak menjebak user: "align ok" mengarahkan agent ke skill align; Stop menahan giliran tanpa klaim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

function itemWithDecisionsOnly() {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'validasi bio').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(/### Keputusan terbuka\n\| # \| pertanyaan \| opsi \(rekomendasi dulu\) \| jawaban \|\n\|---\|---\|---\|---\|/, '### Keputusan terbuka\n| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |\n|---|---|---|---|\n| D1 | Batas inklusif? | a) 300 lolos | a) 300 lolos (ketik) |');
  fs.writeFileSync(p, t);
  return { root, slug, p };
}

test('align ok tanpa klaim: tidak diblokir, agent diarahkan menjalankan skill align', () => {
  const { root, slug, p } = itemWithDecisionsOnly();
  const r = hook(root, 'prompt.mjs', { prompt: `align ok ${slug}` });
  assert.doesNotMatch(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /Jalankan skill align/);
  assert.match(r.stdout, /bagian 3 plan\.md/);
  assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /^align: aligned/m);
});

test('decide tanpa klaim: Berikutnya (agent) skill align, bukan "align ok"', () => {
  const { root, slug } = itemWithDecisionsOnly();
  const out = hx(root, 'decide', slug, '--md').stdout;
  assert.match(out, /Berikutnya \(agent\): skill align/);
  assert.doesNotMatch(out, /ketik "align ok/);
});

test('Stop: item disentuh sesi ini dengan baris D tanpa klaim → giliran ditahan', () => {
  const { root, slug, p } = itemWithDecisionsOnly();
  hook(root, 'post.mjs', { tool_name: 'Edit', tool_input: { file_path: p } });
  const r = hook(root, 'stop.mjs', { last_assistant_message: 'Jawaban D1 dicatat.' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`${slug} belum punya klaim`));
});
