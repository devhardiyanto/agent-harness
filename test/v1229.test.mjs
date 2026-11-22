// 1.22.9: temuan uji nyata di project event (H1–H4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';
import { parseTypedAnswers, buildQuestions } from '../kernel/.claude/hooks/ask.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

function itemWith(root, title, sid, claims = '') {
  const slug = hx(root, 'new', 'feature', title).stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  if (claims) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(### Klaim vs bukti kode\n\| # \| klaim \| bukti path:baris \| status \|\n\|---\|---\|---\|---\|\n)/, `$1${claims}\n`));
  hook(root, 'post.mjs', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: p } });
  return { slug, p };
}

test('H4: open --mine hanya item sesi terakhir, bukan item sesi lain dari event log', async () => {
  const root = project({ v1: true });
  const other = itemWith(root, 'punya sesi lain', 'lain');
  // event log mencatat semua sesi (emit dimatikan di test, jadi ditulis langsung)
  fs.appendFileSync(path.join(root, '.harness/events.jsonl'), JSON.stringify({ ts: new Date().toISOString(), kind: 'status', slug: other.slug }) + '\n');
  await new Promise((r) => setTimeout(r, 30));
  itemWith(root, 'punya sesi ini', 'ini');
  const out = hx(root, 'open', '--mine').stdout;
  assert.match(out, /punya-sesi-ini/);
  assert.doesNotMatch(out, /punya-sesi-lain/);
});

test('H3: baris Berikutnya dipisah baris kosong dari tabel keputusan', async () => {
  const { formatDecision, readItem } = await import('../kernel/.claude/hooks/lib.mjs');
  const root = project({ v1: true });
  const { slug } = itemWith(root, 'tabel', 's', '| C1 | x belum pasti | - | dugaan |');
  const t = formatDecision(root, readItem(root, slug));
  assert.match(t, /\|\n\nBerikutnya \(kamu\)/);
});

test('H2: klaim dugaan punya opsi "belum tahu"; ketikan "C1 belum tahu" tidak mengonfirmasi klaim', async () => {
  const { readItem, decisionRows } = await import('../kernel/.claude/hooks/lib.mjs');
  const root = project({ v1: true });
  const { slug, p } = itemWith(root, 'klaim', 's', '| C1 | webhook mendahului cron | - | dugaan |');
  const q = buildQuestions(root, readItem(root, slug)).find((x) => x.id === 'C1');
  assert.deepEqual(q.options.map((o) => o.label), ['benar', 'salah', 'belum tahu']);
  assert.deepEqual(parseTypedAnswers('C1 belum tahu'), [{ id: 'C1', val: 'belum tahu', note: '' }]);
  hook(root, 'prompt.mjs', { session_id: 's', prompt: 'C1 belum tahu' });
  const t = fs.readFileSync(p, 'utf8');
  assert.match(t, /\| C1 \|.*belum diketahui \(user, ketik; risiko terbuka\)/);
  assert.doesNotMatch(t, /\| C1 \|.*dikonfirmasi/);
  assert.equal(decisionRows(readItem(root, slug)).filter((r) => r.id === 'C1').length, 0, 'tidak ditanyakan ulang');
});

test('H1: analisa tanpa "topik:" di sesi kosong → saran topik sekali per sesi', () => {
  const root = project({ v1: true });
  const a = hook(root, 'prompt.mjs', { session_id: 'n', prompt: 'tolong analisa alur create order event' });
  assert.match(a.stdout, /buka topik dulu/);
  const b = hook(root, 'prompt.mjs', { session_id: 'n', prompt: 'jelaskan lagi bagian webhook' });
  assert.doesNotMatch(b.stdout, /buka topik dulu/, 'sekali per sesi');
  const c = hook(root, 'prompt.mjs', { session_id: 'm', prompt: 'tambahkan tombol simpan' });
  assert.doesNotMatch(c.stdout, /buka topik dulu/, 'bukan analisa');
});
