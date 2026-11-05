// 1.8.4: layout multi-repo → worktree.bgIsolation = "none" di .claude/settings.json root (sesi background tidak pindah ke worktree).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, hx, project, commitAll, wr, jr, gitRepo } from './helpers.mjs';

test('pasang baru di layout multi-repo: settings.json memuat worktree.bgIsolation = none; doctor OK', () => {
  const root = project({ v1: true });
  assert.equal(jr(root, 'harness.config.json').layout, 'multi-repo');
  assert.deepEqual(jr(root, '.claude/settings.json').worktree, { bgIsolation: 'none' });
  assert.equal(hx(root, 'doctor').status, 0);
});

test('layout single: kunci worktree tidak ditambahkan dan doctor tidak memeriksanya', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'single-')), 'solo');
  gitRepo(root);
  wr(root, 'README.md', 'x\n');
  commitAll(root, 'init');
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(jr(root, 'harness.config.json').layout, 'single');
  assert.equal('worktree' in jr(root, '.claude/settings.json'), false);
  assert.doesNotMatch(hx(root, 'doctor').stdout, /bgIsolation/);
});

test('--update dari root lama tanpa kunci itu: ditambahkan, kunci worktree lain milik user ikut terbawa', () => {
  const root = project({ v1: true });
  const st = jr(root, '.claude/settings.json');
  st.worktree = { symlinkDirectories: ['node_modules'] };
  wr(root, '.claude/settings.json', JSON.stringify(st, null, 2));
  commitAll(root, 'settings lama');
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(jr(root, '.claude/settings.json').worktree, { symlinkDirectories: ['node_modules'], bgIsolation: 'none' });
});

test('--update: pilihan user untuk bgIsolation tidak ditimpa', () => {
  const root = project({ v1: true });
  const st = jr(root, '.claude/settings.json');
  st.worktree = { bgIsolation: 'worktree' };
  wr(root, '.claude/settings.json', JSON.stringify(st, null, 2));
  commitAll(root, 'pilihan user');
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(jr(root, '.claude/settings.json').worktree.bgIsolation, 'worktree');
});

test('doctor: multi-repo tanpa bgIsolation = none → GAGAL; settings.local.json juga dihitung', () => {
  const root = project({ v1: true });
  const st = jr(root, '.claude/settings.json');
  delete st.worktree;
  wr(root, '.claude/settings.json', JSON.stringify(st, null, 2));
  const d = hx(root, 'doctor');
  assert.equal(d.status, 2);
  assert.match(d.stdout, /worktree\.bgIsolation[^\n]*GAGAL/);
  wr(root, '.claude/settings.local.json', JSON.stringify({ worktree: { bgIsolation: 'none' } }));
  assert.equal(hx(root, 'doctor').status, 0);
});
