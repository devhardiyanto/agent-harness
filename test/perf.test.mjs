// S9: SessionStart ringan. Jalur ringan baselineOf harus sama persis dengan jalur lengkap, dengan jauh lebih sedikit proses git.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { here } from './helpers.mjs';

const hooks = path.join(here, '..', 'kernel', '.claude', 'hooks');
const { baselineOf, knowledgeStatus } = await import(pathToFileURL(path.join(hooks, 'knowledge.mjs')).href);
const g = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const init = (d, b = 'main') => { fs.mkdirSync(d, { recursive: true }); g(d, 'init', '-q', '-b', b); g(d, 'config', 'user.email', 't@t'); g(d, 'config', 'user.name', 't'); g(d, 'config', 'commit.gpgsign', 'false'); };
const commit = (d, f = 'a.txt', c = 'x') => { fs.writeFileSync(path.join(d, f), c + Math.random()); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'c'); };

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'perf-')); }
const same = (r, cfg, svc) => {
  const full = baselineOf(r, cfg, svc); const light = baselineOf(r, cfg, svc, { light: true });
  assert.equal(light.ok, full.ok, svc);
  for (const k of ['ref', 'sha', 'branch', 'via']) assert.equal(light[k], full[k], `${svc}.${k}`);
  return full;
};

test('baseline ringan = baseline lengkap: hanya main, clone dengan origin/HEAD, production, override, tanpa baseline', () => {
  const r = root(); const cfg = { services_dir: 'source-code', baseline: {} };
  const sd = path.join(r, 'source-code');
  // a) hanya branch lokal main
  init(path.join(sd, 'a')); commit(path.join(sd, 'a'));
  // b) clone dengan origin/HEAD → main, lalu commit lokal yang berbeda dari origin
  const bare = path.join(r, 'bare.git'); init(path.join(r, 'seed')); commit(path.join(r, 'seed'));
  g(r, 'clone', '-q', '--bare', path.join(r, 'seed'), bare);
  g(sd, 'clone', '-q', bare, 'b'); commit(path.join(sd, 'b'));
  // c) ada branch production lokal dan main: production didahulukan
  init(path.join(sd, 'c')); commit(path.join(sd, 'c')); g(path.join(sd, 'c'), 'branch', 'production');
  // d) override dari config
  init(path.join(sd, 'd')); commit(path.join(sd, 'd')); g(path.join(sd, 'd'), 'branch', 'staging');
  // e) tidak ada baseline yang dikenal
  init(path.join(sd, 'e'), 'trunk'); commit(path.join(sd, 'e'));
  const cfg2 = { ...cfg, baseline: { d: 'staging' } };
  assert.equal(same(r, cfg2, 'a').branch, 'main');
  const b = same(r, cfg2, 'b'); assert.equal(b.via, 'origin/HEAD'); assert.match(b.ref, /^origin\//);
  assert.equal(same(r, cfg2, 'c').branch, 'production');
  assert.equal(same(r, cfg2, 'd').via, 'config');
  const e = same(r, cfg2, 'e'); assert.equal(e.ok, false);
  assert.equal(baselineOf(r, cfg2, 'e', { light: true }).note.includes('branch baseline tidak ditemukan'), true, 'jatuh ke jalur lengkap untuk pesan rinci');
  assert.equal(same(r, cfg2, 'tidak-ada').ok, false);
});

test('knowledgeStatus memakai jalur ringan dan hasilnya tidak berubah', () => {
  const r = root(); const cfg = { services_dir: 'source-code', baseline: {}, knowledge: {} };
  const d = path.join(r, 'source-code', 'a'); init(d); commit(d);
  const sha = g(d, 'rev-parse', 'HEAD').stdout.trim();
  fs.mkdirSync(path.join(r, 'docs/knowledge/a'), { recursive: true });
  fs.writeFileSync(path.join(r, 'docs/knowledge/a/summary.md'), `---\nservice: a\nsource_commit: ${sha}\nstatus: draft\nupdated: 2026-01-01\n---\nx\n`);
  assert.equal(knowledgeStatus(r, cfg, 'a').state, 'ok');
  commit(d);
  const s = knowledgeStatus(r, cfg, 'a'); assert.equal(s.state, 'behind'); assert.equal(s.behind, 1);
});

test('SessionStart: maksimal 3 proses git per service (6 service ≤ 18)', { skip: process.platform === 'win32' }, () => {
  const r = root();
  fs.cpSync(path.join(here, '..', 'kernel'), r, { recursive: true });
  const svcs = ['s0', 's1', 's2', 's3', 's4', 's5'];
  const cfgP = path.join(r, 'harness.config.json');
  fs.writeFileSync(cfgP, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgP, 'utf8')), services: svcs }));
  for (const s of svcs) {
    const d = path.join(r, 'source-code', s); init(d); commit(d);
    const sha = g(d, 'rev-parse', 'HEAD').stdout.trim();
    fs.mkdirSync(path.join(r, 'docs/knowledge', s), { recursive: true });
    fs.writeFileSync(path.join(r, 'docs/knowledge', s, 'summary.md'), `---\nservice: ${s}\nsource_commit: ${sha}\nstatus: verified\nupdated: 2026-01-01\n---\nx\n`);
  }
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'gitwrap-')); const log = path.join(w, 'calls');
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(w, 'git'), `#!/bin/sh\necho x >> ${log}\nexec ${real} "$@"\n`, { mode: 0o755 });
  const res = spawnSync('node', [path.join(r, '.claude/hooks/session.mjs')], { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: r }), env: { ...process.env, CLAUDE_PROJECT_DIR: r, PATH: w + path.delimiter + process.env.PATH }, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const n = fs.readFileSync(log, 'utf8').trim().split('\n').length;
  assert.ok(n <= 18, `git dipanggil ${n}x untuk 6 service`);
});
