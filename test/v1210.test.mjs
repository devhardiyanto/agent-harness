// 1.21.0: topik untuk diskusi/analisa/audit sebelum work item; persona rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;
const bash = (root, command, sid = 's') => hook(root, 'guard-bash.mjs', { session_id: sid, tool_name: 'Bash', tool_input: { command } });

function withTopic(sid = 's') {
  const root = project({ v1: true });
  const rel = hx(root, 'topic', 'new', 'audit validasi profil').stdout.trim();
  assert.match(rel, /^docs\/topics\/\d{4}-\d{2}-\d{2}-audit-validasi-profil\.md$/);
  hook(root, 'post.mjs', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: path.join(root, rel) } });
  return { root, slug: path.basename(rel, '.md'), p: path.join(root, rel) };
}

test('topic new: berkas topik berstatus open dengan bagian Pertanyaan/Temuan/Keputusan/Lanjutan', () => {
  const { root, p } = withTopic();
  const t = fs.readFileSync(p, 'utf8');
  for (const h of ['status: open', '## Pertanyaan', '## Temuan', '## Keputusan', '## Lanjutan']) assert.ok(t.includes(h), h);
  assert.match(hx(root, 'topic', 'list').stdout, /audit-validasi-profil \| open/);
});

test('sesi bertopik: prompt = lanjutan topik; harness.mjs new ditolak', () => {
  const { root, slug } = withTopic();
  assert.match(hook(root, 'prompt.mjs', { prompt: 'cek juga apakah bio dibatasi di frontend' }).stdout, new RegExp(`membahas topik ${slug}`));
  const r = bash(root, 'node .claude/hooks/harness.mjs new feature "bio"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /jadikan item/);
});

test('"jadikan item": promote diizinkan sekali, item tertaut ke topik, topik promoted', () => {
  const { root, slug } = withTopic();
  assert.equal(bash(root, `node .claude/hooks/harness.mjs topic promote ${slug} feature`).status, 2, 'tanpa ketikan user ditolak');
  assert.match(hook(root, 'prompt.mjs', { prompt: 'jadikan item' }).stdout, /DIJADIKAN WORK ITEM/);
  assert.equal(bash(root, `node .claude/hooks/harness.mjs topic promote ${slug} feature`).status, 0);
  const out = hx(root, 'topic', 'promote', slug, 'feature').stdout;
  const item = /docs\/work\/([\w.-]+)/.exec(out)[1];
  assert.match(fs.readFileSync(path.join(root, 'docs/work', item, 'plan.md'), 'utf8'), new RegExp(`^topic: ${slug}$`, 'm'));
  assert.match(hx(root, 'topic', 'list', '--all').stdout, new RegExp(`${slug} \\| promoted \\| ${item}`));
});

test('"topik: ..." diarahkan ke topic new, bukan work item', () => {
  const root = project({ v1: true });
  const r = hook(root, 'prompt.mjs', { prompt: 'topik: review arsitektur auth' });
  assert.match(r.stdout, /topic new/);
  assert.match(r.stdout, /Jangan membuat work item/);
});

test('persona rule terpasang dan output style tidak lagi membatasi 5 baris', () => {
  const root = project({ v1: true });
  assert.ok(fs.existsSync(path.join(root, '.claude/rules/persona.md')));
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.claude/output-styles/harness.md'), 'utf8'), /5 baris/);
});
