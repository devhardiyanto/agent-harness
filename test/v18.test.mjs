// Uji 1.8.0: event log, TUI watch, ringkasan lokal saat Done, gc.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');

function mk(cfg = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v18-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cp = path.join(root, 'harness.config.json');
  fs.writeFileSync(cp, JSON.stringify({ ...JSON.parse(fs.readFileSync(cp, 'utf8')), services: ['svc-a'], align: { required: false }, ...cfg }));
  const d = path.join(root, 'source-code', 'svc-a');
  fs.mkdirSync(d, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: d });
  return root;
}
const env = (root, extra = {}) => ({ ...process.env, CLAUDE_PROJECT_DIR: root, ...extra });
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: env(root), encoding: 'utf8' });
const hook = (root, script, payload) => spawnSync('node', [path.join(root, '.claude/hooks', script)], { input: JSON.stringify({ session_id: 's', cwd: root, ...payload }), env: env(root), encoding: 'utf8' });
const prompt = (root, t) => hook(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: t });
const rd = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const wr = (root, p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
const events = (root) => rd(root, '.harness/events.jsonl').trim().split('\n').map((l) => JSON.parse(l));

function item(root, title = 'Tambah endpoint') {
  const slug = path.basename(cli(root, 'new', 'feature', title).stdout.trim());
  wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace('services: []', 'services: [svc-a]').replace('- AC1:', '- AC1: endpoint mengembalikan 200'));
  return slug;
}
function toDone(root, slug) {
  assert.match(prompt(root, `/harness:approve ${slug}`).stdout, /APPROVED/);
  assert.equal(cli(root, 'start', slug).status, 0);
  wr(root, `docs/work/${slug}/progress.md`, '## Decision log\n- 2026-11-05 · pakai cache TTL · hemat request\n-\n\n## Verifikasi\n- AC1: curl localhost:3000/x -> 200 OK\n');
  assert.equal(cli(root, 'set-status', slug, 'in-review').status, 0);
  wr(root, `docs/work/${slug}/review.md`, '---\nverdict: clean\n---\n');
  const r = cli(root, 'set-status', slug, 'done');
  assert.equal(r.status, 0, r.stderr);
}

test('event log: perubahan status dan approve masuk .harness/events.jsonl tanpa tool call berisik', () => {
  const root = mk();
  const slug = item(root);
  prompt(root, `/harness:approve ${slug}`);
  cli(root, 'start', slug);
  hook(root, 'post.mjs', { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
  const ev = events(root);
  assert.ok(ev.some((e) => e.event === 'approve' && e.slug === slug));
  assert.ok(ev.some((e) => e.event === 'status' && e.from === 'approved' && e.to === 'in-progress'));
  assert.ok(!ev.some((e) => e.event === 'PostToolUse'), 'PostToolUse tidak masuk event log');
  const out = cli(root, 'log', '10').stdout;
  assert.match(out, /approve/);
  assert.match(out, /approved→in-progress/);
});

test('event log: rotasi di atas 1 MB dan redaksi secret', () => {
  const root = mk();
  wr(root, '.harness/events.jsonl', 'x'.repeat(1_000_100) + '\n');
  const slug = item(root);
  prompt(root, `/harness:approve ${slug}`);
  assert.ok(fs.existsSync(path.join(root, '.harness/events.jsonl.1')));
  assert.ok(fs.statSync(path.join(root, '.harness/events.jsonl')).size < 5000);
  const lib = pathToFileURL(path.join(root, '.claude/hooks/lib.mjs')).href;
  const r = spawnSync('node', ['-e', `import('${lib}').then((m) => m.emit(process.env.CLAUDE_PROJECT_DIR, { event: 'x', reason: 'token ghp_${'a'.repeat(36)}' }))`], { env: env(root), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(rd(root, '.harness/events.jsonl'), /ghp_a{36}/);
});

test('watch --once: lima kolom, kartu menurut status, event terakhir', () => {
  const root = mk();
  const a = item(root, 'Satu'); const b = item(root, 'Dua');
  toDone(root, b);
  const out = cli(root, 'watch', '--once', '--width', '120').stdout;
  for (const col of ['Backlog (1)', 'Todo (0)', 'In Progress (0)', 'Review (0)', 'Done (1)']) assert.ok(out.includes(col), col);
  assert.match(out, /satu/);
  assert.match(out, /dua/);
  assert.match(out, /AC 1\/1/);
  assert.match(out, /Event terakhir/);
  assert.match(out, /in-review→done|→done/);
  assert.doesNotMatch(out, /\x1b\[/, 'tanpa ANSI di mode --once non-TTY');
});

test('ringkasan lokal saat done: objective, AC, keputusan, review, gate; ditulis ulang saat merged', () => {
  const root = mk();
  const slug = item(root);
  wr(root, `docs/work/${slug}/brief.md`, rd(root, `docs/work/${slug}/brief.md`).replace('<satu-dua kalimat: hasil akhir yang diinginkan dan untuk siapa>', 'Pengguna bisa melihat status pesanan.'));
  toDone(root, slug);
  const s = rd(root, `docs/work/${slug}/summary.md`);
  assert.match(s, /status: done/);
  assert.match(s, /Pengguna bisa melihat status pesanan/);
  assert.match(s, /\| AC1 \| endpoint mengembalikan 200 \| ada \|/);
  assert.match(s, /pakai cache TTL/);
  assert.match(s, /verdict: clean/);
  assert.match(s, /gate: pass/);
  assert.doesNotMatch(s, /<!--/);
  assert.ok(events(root).some((e) => e.event === 'summary' && e.slug === slug));
});

test('ringkasan memuat debat align dan parking lot', () => {
  const root = mk({ align: { required: true, max_rounds: 3, exempt_types: [] } });
  const slug = item(root);
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\nrounds: 2\n---\n## Klaim vs bukti kode\n| C1 | k | a.ts:1 | terverifikasi |\n\n## Debat\n- Ronde 1: tabel orders ada? → ada di db/schema.sql\n\n## Parking lot\n- rapikan helper tanggal\n');
  assert.match(prompt(root, `/harness:align ${slug} ok`).stdout, /ALIGNED/);
  toDone(root, slug);
  const s = rd(root, `docs/work/${slug}/summary.md`);
  assert.match(s, /\(align\) Ronde 1/);
  assert.match(s, /rapikan helper tanggal/);
});

test('gc: rencana tanpa --yes; --yes menghapus hanya yang kedaluwarsa dan tidak menyentuh item terbuka', () => {
  const root = mk();
  const open = item(root, 'Terbuka'); const merged = 'lama-merged';
  wr(root, `docs/work/${merged}/plan.md`, '---\nstatus: merged\nservices: [svc-a]\n---\n- AC1: x\n');
  wr(root, `.harness/evidence/${open}/tests.json`, '{}');
  wr(root, `.harness/evidence/${merged}/tests.json`, '{}');
  wr(root, '.harness/evidence/hilang/tests.json', '{}');
  wr(root, '.harness/events.jsonl.1', 'x\n');
  wr(root, '.harness/handoff.md', 'tetap');
  wr(root, '.claude/audit/2020-01-01.jsonl', '{}\n');
  wr(root, `.claude/audit/${new Date().toISOString().slice(0, 10)}.jsonl`, '{}\n');
  wr(root, '.claude/state/merge-tickets/x.json', '{}');
  const ago = (d) => new Date(Date.now() - d * 86400e3);
  fs.utimesSync(path.join(root, '.claude/audit/2020-01-01.jsonl'), ago(40), ago(40));
  fs.utimesSync(path.join(root, '.claude/state/merge-tickets/x.json'), ago(3), ago(3));
  const plan = cli(root, 'gc');
  assert.equal(plan.status, 0, plan.stderr);
  for (const x of [`evidence/${merged}`, 'evidence/hilang', 'events.jsonl.1', 'audit/2020-01-01.jsonl', 'merge-tickets/x.json']) assert.ok(plan.stdout.includes(x), x);
  assert.ok(!plan.stdout.includes(`evidence/${open}`), 'item terbuka tidak disentuh');
  assert.match(plan.stdout, /Rencana saja/);
  assert.ok(fs.existsSync(path.join(root, `.harness/evidence/${merged}`)), 'tanpa --yes tidak menghapus');
  const yes = cli(root, 'gc', '--yes');
  assert.equal(yes.status, 0, yes.stderr);
  assert.ok(!fs.existsSync(path.join(root, `.harness/evidence/${merged}`)));
  assert.ok(!fs.existsSync(path.join(root, '.harness/evidence/hilang')));
  assert.ok(!fs.existsSync(path.join(root, '.claude/audit/2020-01-01.jsonl')));
  assert.ok(fs.existsSync(path.join(root, `.harness/evidence/${open}/tests.json`)));
  assert.equal(rd(root, '.harness/handoff.md'), 'tetap');
  assert.ok(fs.existsSync(path.join(root, `docs/work/${open}/plan.md`)));
});

test('gc --yes diblokir untuk agent (guard-bash); tanpa --yes lolos', () => {
  const root = mk();
  const g = (command) => hook(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  assert.equal(g('node .claude/hooks/harness.mjs gc --yes').status, 2);
  assert.equal(g('node .claude/hooks/harness.mjs gc --days 7 --yes').status, 2);
  assert.equal(g('node .claude/hooks/harness.mjs gc').status, 0);
});
