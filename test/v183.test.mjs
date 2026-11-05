// 1.8.3: kebijakan "root selalu di main, tanpa worktree" (layout multi-repo): guard-bash, doctor, gc, .gitignore.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sh, hx, hook, project, rd, wr, jr } from './helpers.mjs';

const bash = (root, command, cwd) => hook(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...(cwd ? { cwd } : {}) });
const tmpWt = (n) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), n);
const addWt = (root, branch) => { const d = tmpWt(branch); const r = sh('git', ['worktree', 'add', '-b', branch, d], root); assert.equal(r.status, 0, r.stderr); return d; };
const wtCount = (root) => sh('git', ['worktree', 'list', '--porcelain'], root).stdout.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).length;

test('guard-bash: git worktree add di root ditolak; di repo service dan layout single lolos', () => {
  const root = project({ v1: true });
  assert.equal(bash(root, 'git worktree add ../wt').status, 2);
  assert.match(bash(root, 'git worktree add -b x ../wt').stderr, /worktree di root dilarang/);
  assert.equal(bash(root, 'git -C source-code/api worktree add ../wt-api').status, 0, 'repo service boleh');
  assert.equal(bash(root, 'cd source-code/api && git worktree add ../wt-api').status, 0, 'cd ke service boleh');
  assert.equal(bash(root, 'git worktree add ../wt-api', path.join(root, 'source-code', 'api')).status, 0, 'cwd di service boleh');
  assert.equal(bash(root, 'git worktree list').status, 0);
  const cfg = jr(root, 'harness.config.json'); cfg.layout = 'single';
  wr(root, 'harness.config.json', JSON.stringify(cfg));
  assert.equal(bash(root, 'git worktree add ../wt').status, 0, 'layout single: root adalah repo kode, kebijakan tidak berlaku');
});

test('doctor dan gc: worktree root bersih+tergabung masuk rencana, gc --yes menghapus lewat git, doctor lalu OK', () => {
  const root = project({ v1: true });
  assert.equal(hx(root, 'doctor').status, 0);
  const wt = addWt(root, 'wt-bersih');
  const d = hx(root, 'doctor');
  assert.equal(d.status, 2);
  assert.match(d.stdout, /tidak ada worktree di root[^\n]*GAGAL/);
  const plan = hx(root, 'gc');
  assert.match(plan.stdout, /worktree di root \(wt-bersih\): bersih dan sudah digabung/);
  assert.ok(fs.existsSync(wt), 'rencana saja tidak menghapus');
  const yes = hx(root, 'gc', '--yes');
  assert.match(yes.stdout, /dihapus: 1 dari 1/);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(wtCount(root), 1);
  assert.match(sh('git', ['branch', '--list', 'wt-bersih'], root).stdout, /wt-bersih/, 'cabangnya tidak dihapus');
  assert.equal(hx(root, 'doctor').status, 0);
});

test('gc: worktree root yang kotor atau belum digabung ditahan dan dilaporkan, tidak dihapus', () => {
  const root = project({ v1: true });
  const dirty = addWt(root, 'wt-kotor');
  wr(dirty, 'catatan.md', 'belum di-commit');
  const ahead = addWt(root, 'wt-maju');
  sh('git', ['commit', '--allow-empty', '-qm', 'maju'], ahead);
  const plan = hx(root, 'gc');
  assert.doesNotMatch(plan.stdout, /worktree di root \(/);
  assert.match(plan.stdout, /DITAHAN[^\n]*wt-kotor|DITAHAN[\s\S]*ada perubahan belum di-commit/);
  assert.match(plan.stdout, /cabang belum digabung/);
  hx(root, 'gc', '--yes');
  assert.ok(fs.existsSync(dirty) && fs.existsSync(ahead));
  assert.equal(wtCount(root), 3);
});

test('installer: .claude/worktrees/ masuk .gitignore root', () => {
  const root = project({ v1: true });
  assert.match(rd(root, '.gitignore'), /^\.claude\/worktrees\/$/m);
});
