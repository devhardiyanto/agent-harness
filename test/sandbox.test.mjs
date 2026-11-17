// 1.19.2: sandbox latihan: remote lokal, gh tiruan; alur PR → check → merge tanpa jaringan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { here } from './helpers.mjs';

test('sandbox: semua remote lokal, gh tiruan menangani create/view/checks/merge, --reset hanya untuk folder bertanda', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-')), 'sb');
  const mk = (...a) => spawnSync('node', [path.join(here, '..', 'scripts', 'sandbox.mjs'), dir, ...a], { encoding: 'utf8' });
  const r = mk(); assert.equal(r.status, 0, r.stderr + r.stdout);
  const g = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
  for (const d of [dir, path.join(dir, 'source-code/frontend'), path.join(dir, 'source-code/backend')]) assert.match(g(d, 'remote', 'get-url', 'origin').stdout, /\.sandbox[\\/]remotes[\\/]/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf8')).services, ['frontend', 'backend']);
  const gh = (cwd, ...a) => spawnSync('node', [path.join(dir, '.sandbox/bin/fake-gh.mjs'), ...a], { cwd, encoding: 'utf8' });
  const fe = path.join(dir, 'source-code/frontend');
  g(fe, 'checkout', '-qb', 'fix/x'); fs.appendFileSync(path.join(fe, 'src/format.js'), '// x\n'); g(fe, 'commit', '-qam', 'x'); g(fe, 'push', '-q', 'origin', 'fix/x');
  const url = gh(fe, 'pr', 'create', '--base', 'main', '--head', 'fix/x', '--title', 'x').stdout.trim();
  assert.match(url, /^https:\/\/sandbox\.invalid\/frontend\/pull\/1$/);
  assert.equal(gh(fe, 'pr', 'view', url, '--json', 'state', '-q', '.state').stdout.trim(), 'OPEN');
  assert.equal(gh(fe, 'pr', 'merge', url, '--merge', '--match-head-commit', g(fe, 'rev-parse', 'HEAD').stdout.trim()).status, 0);
  assert.equal(gh(fe, 'pr', 'view', url, '--json', 'state', '-q', '.state').stdout.trim(), 'MERGED');
  assert.equal(g(fe, 'ls-remote', 'origin', 'main').stdout.split('\t')[0], g(fe, 'rev-parse', 'HEAD').stdout.trim());
  assert.notEqual(gh(fe, 'repo', 'clone', 'x').status, 0);
  assert.notEqual(mk().status, 0, 'tanpa --reset tidak menimpa');
  assert.equal(mk('--reset').status, 0);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'bukan-')); fs.writeFileSync(path.join(other, 'a'), 'x');
  const r2 = spawnSync('node', [path.join(here, '..', 'scripts', 'sandbox.mjs'), other, '--reset'], { encoding: 'utf8' });
  assert.notEqual(r2.status, 0); assert.ok(fs.existsSync(path.join(other, 'a')));
});
