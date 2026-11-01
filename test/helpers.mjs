// Helper bersama untuk tes berbasis project contoh. Memasang CLI `claude` palsu di PATH (runner CI tidak punya).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const installer = path.join(here, '..', 'install.mjs');

const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-shim-'));
fs.writeFileSync(path.join(shim, 'claude'), '#!/bin/sh\necho "2.1.300 (Claude Code)"\n', { mode: 0o755 });
fs.writeFileSync(path.join(shim, 'claude.cmd'), '@echo 2.1.300 (Claude Code)\r\n');
process.env.HARNESS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-home-'));
process.env.PATH = shim + path.delimiter + process.env.PATH;

export const sh = (cmd, args, cwd, input) => spawnSync(cmd, args, { cwd, encoding: 'utf8', input });
export const install = (dir, ...a) => sh('node', [installer, dir, '--repo', 'devhardiyanto/agent-harness', ...a], dir);
export const hx = (dir, ...a) => spawnSync('node', [path.join(dir, '.claude/hooks/harness.mjs'), ...a], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
export const hook = (dir, script, payload) => spawnSync('node', [path.join(dir, '.claude/hooks', script)], { input: JSON.stringify({ session_id: 's', cwd: dir, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });

export function gitRepo(dir, branch = 'main') {
  fs.mkdirSync(dir, { recursive: true });
  sh('git', ['init', '-q', '-b', branch], dir);
  sh('git', ['config', 'user.name', 't'], dir); sh('git', ['config', 'user.email', 't@t.t'], dir); sh('git', ['config', 'commit.gpgsign', 'false'], dir);
}
export const commitAll = (dir, msg = 'x') => { sh('git', ['add', '-A'], dir); sh('git', ['commit', '-qm', msg], dir); };
export const rd = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
export const wr = (root, p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
export const jr = (root, p) => JSON.parse(rd(root, p));

// Project contoh ber-git dengan dua service. `withV1` memasang harness lebih dulu.
export function project({ v1 = false, name = 'proj' } = {}) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'upd-')), name);
  gitRepo(root);
  wr(root, 'README.md', 'x\n');
  for (const s of ['api', 'web']) { gitRepo(path.join(root, 'source-code', s)); wr(path.join(root, 'source-code', s), 'package.json', '{}'); }
  commitAll(root, 'init');
  if (v1) { const r = install(root, '--yes'); if (r.status !== 0) throw new Error(r.stderr + r.stdout); }
  return root;
}
