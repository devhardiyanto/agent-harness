// Uji list/show/snapshot --json: metadata saja, tanpa isi dokumen. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const g = (dir, ...a) => sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', '-c', 'commit.gpgsign=false', ...a], dir);
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cfgP = path.join(root, 'harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8')); cfg.services = ['svc-a']; cfg.project = 'proyek-uji';
  fs.writeFileSync(cfgP, JSON.stringify(cfg));
  const svc = path.join(root, 'source-code', 'svc-a');
  fs.mkdirSync(svc, { recursive: true });
  g(svc, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(svc, 'package.json'), '{}');
  g(svc, 'add', '-A'); g(svc, 'commit', '-qm', 'init');
  return root;
}
function newItem(root, title) {
  const slug = path.basename(cli(root, 'new', 'feature', title).stdout.trim());
  return { slug, dir: path.join(root, 'docs/work', slug) };
}
function writePlan(it, { acs, extra = '' }) {
  const fm = ['---', 'title: judul-rahasia-plan', 'type: feature', 'status: draft', 'services: [svc-a]', 'created: 2026-10-23', 'updated: 2026-10-23', `pr: null${extra}`, '---'];
  fs.writeFileSync(path.join(it.dir, 'plan.md'), `${fm.join('\n')}\n# Plan\n## Acceptance criteria\n${acs.join('\n')}\n`);
}

test('list --json: kosong => []; berisi => metadata AC per bukti', () => {
  const root = mkProject();
  assert.deepEqual(JSON.parse(cli(root, 'list', '--json').stdout), []);
  const it = newItem(root, 'Fitur Uji');
  writePlan(it, { acs: ['- AC1: kalimat-ac-rahasia-satu', '- AC2: kalimat-ac-rahasia-dua', '- AC3: kalimat-ac-rahasia-tiga'] });
  fs.writeFileSync(path.join(it.dir, 'progress.md'), '## Verifikasi\n- AC1: curl /health => 200 {"ok":true} bukti-rahasia\n- AC2: TODO\n');
  const [row] = JSON.parse(cli(root, 'list', '--json').stdout);
  assert.equal(row.slug, it.slug); assert.equal(row.status, 'draft'); assert.deepEqual(row.services, ['svc-a']);
  assert.deepEqual(row.ac, [{ id: 'AC1', evidence: 'ok' }, { id: 'AC2', evidence: 'missing' }, { id: 'AC3', evidence: 'missing' }]);
  assert.equal(row.has.progress, true);
});

test('show --json: satu item; review verdict + blocker terhitung', () => {
  const root = mkProject();
  const it = newItem(root, 'Fitur Review');
  writePlan(it, { acs: ['- AC1: kalimat-ac'] });
  fs.writeFileSync(path.join(it.dir, 'review.md'), '---\nverdict: blockers\n---\n## Blocker\n- [ ] [BLOCKER] temuan-rahasia-a\n- [x] [BLOCKER] temuan-rahasia-b\n- [ ] [BLOCKER] temuan-rahasia-c\n');
  const r = JSON.parse(cli(root, 'show', it.slug, '--json').stdout);
  assert.deepEqual(r.review, { verdict: 'blockers', blockers_open: 2, blockers_done: 1 });
  const none = JSON.parse(cli(root, 'show', '--json', it.slug).stdout); // urutan argumen bebas
  assert.equal(none.slug, it.slug);
  // bentuk teks tetap seperti semula
  assert.match(cli(root, 'show', it.slug).stdout, /^status: draft/m);
});

test('snapshot: skema, service (baseline + knowledge), dan tidak membocorkan isi dokumen', () => {
  const root = mkProject();
  const it = newItem(root, 'Fitur Privasi');
  writePlan(it, { acs: ['- AC1: kalimat-ac-rahasia'], extra: '\napproved_at: 2026-10-23T01:00:00Z\napproved_by: orang@rahasia.example' });
  fs.writeFileSync(path.join(it.dir, 'progress.md'), '## Verifikasi\n- AC1: output-nyata-bukti-rahasia 200 OK\n');
  fs.writeFileSync(path.join(it.dir, 'review.md'), '---\nverdict: clean\n---\nisi-review-rahasia\n');
  fs.writeFileSync(path.join(it.dir, 'impact.md'), 'path/kode/rahasia.ts:12 isi-impact-rahasia\n');
  const res = cli(root, 'snapshot', '--json');
  assert.equal(res.status, 0, res.stderr);
  const s = JSON.parse(res.stdout);
  assert.equal(s.schema, 1); assert.equal(s.project, 'proyek-uji');
  assert.ok(!Number.isNaN(Date.parse(s.generated_at)));
  assert.equal(s.work_items.length, 1);
  assert.equal(s.work_items[0].approved_at, '2026-10-23T01:00:00Z');
  assert.deepEqual(s.work_items[0].ac, [{ id: 'AC1', evidence: 'ok' }]);
  assert.equal(s.work_items[0].review.verdict, 'clean');
  assert.equal(s.services.length, 1);
  assert.equal(s.services[0].service, 'svc-a');
  assert.equal(s.services[0].baseline.ref, 'main');
  assert.equal(s.services[0].baseline.sha.length, 10);
  assert.equal(s.services[0].knowledge.state, 'missing');
  for (const rahasia of ['kalimat-ac-rahasia', 'bukti-rahasia', 'isi-review-rahasia', 'isi-impact-rahasia', 'path/kode', 'orang@rahasia', 'judul-rahasia-plan']) {
    assert.ok(!res.stdout.includes(rahasia), `snapshot membocorkan: ${rahasia}`);
  }
});

test('snapshot: tanpa work item dan service tanpa baseline tetap JSON valid', () => {
  const root = mkProject();
  fs.rmSync(path.join(root, 'source-code', 'svc-a', '.git'), { recursive: true, force: true });
  const res = cli(root, 'snapshot');
  assert.equal(res.status, 0, res.stderr);
  const s = JSON.parse(res.stdout);
  assert.deepEqual(s.work_items, []);
  assert.equal(s.services[0].baseline.ref, null);
  assert.match(s.services[0].baseline.note, /bukan repo git/);
});
