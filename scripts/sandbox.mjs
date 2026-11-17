#!/usr/bin/env node
// `harness sandbox`: root latihan untuk menguji alur harness dari awal sampai "push PR + merge" TANPA menyentuh project nyata.
//   node scripts/sandbox.mjs [folder] [--reset]      (bawaan: ~/harness-sandbox)
// Isi: root git (main) + dua service (frontend, backend) masing-masing repo git sendiri. Semua remote `origin` adalah repo
// bare LOKAL di <folder>/.sandbox/remotes, jadi `git push` tidak pernah sampai ke GitHub. `gh` diganti tiruan
// (<folder>/.sandbox/bin/gh): PR, check (selalu hijau), dan merge dicatat di <folder>/.sandbox/prs.json; merge = push
// fast-forward ke remote lokal. Tiruan hanya aktif bila claude dibuka lewat start.cmd / start.sh (PATH sesi itu saja).
// --reset menghapus folder lama hanya bila berpenanda sandbox (.sandbox/MARKER).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(os.homedir(), 'harness-sandbox'));
const sb = path.join(dir, '.sandbox');
const die = (m) => { console.error(`sandbox: ${m}`); process.exit(1); };
const git = (cwd, ...a) => { const r = spawnSync('git', ['-c', 'user.name=sandbox', '-c', 'user.email=sandbox@sandbox.invalid', ...a], { cwd, encoding: 'utf8' }); if (r.status !== 0) die(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
const wr = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
  if (!argv.includes('--reset')) die(`${dir} sudah ada. Pakai --reset untuk membuat ulang, atau sebut folder lain.`);
  if (!fs.existsSync(path.join(sb, 'MARKER'))) die(`${dir} bukan sandbox (tidak ada .sandbox/MARKER); tidak dihapus.`);
  fs.rmSync(dir, { recursive: true, force: true });
}

function repo(cwd, name, files) {
  for (const [f, c] of Object.entries(files)) wr(path.join(cwd, f), c);
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'add', '-A'); git(cwd, 'commit', '-qm', 'init');
  const bare = path.join(sb, 'remotes', `${name}.git`);
  fs.mkdirSync(bare, { recursive: true }); git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(cwd, 'remote', 'add', 'origin', bare); git(cwd, 'push', '-q', '-u', 'origin', 'main');
}

wr(path.join(sb, 'MARKER'), 'harness sandbox\n');
const svcs = {
  frontend: {
    'package.json': '{\n  "name": "frontend",\n  "private": true,\n  "scripts": { "test": "node --test" },\n  "dependencies": { "react": "18.3.1" }\n}\n',
    'src/ProfileForm.tsx': `import { useState } from 'react';\n\n// Form profil: tombol Save selalu aktif walau belum ada perubahan.\nexport function ProfileForm({ initial, onSave }: { initial: { name: string; bio: string }; onSave: (v: { name: string; bio: string }) => void }) {\n  const [value, setValue] = useState(initial);\n  return (\n    <form onSubmit={(e) => { e.preventDefault(); onSave(value); }}>\n      <input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />\n      <textarea value={value.bio} onChange={(e) => setValue({ ...value, bio: e.target.value })} />\n      <button type="submit">Save</button>\n    </form>\n  );\n}\n`,
    'src/format.js': 'export const initials = (name) => name.split(/\\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");\n',
    'test/format.test.js': 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { initials } from "../src/format.js";\ntest("initials", () => assert.equal(initials("ada lovelace"), "AL"));\n',
  },
  backend: {
    'package.json': '{\n  "name": "backend",\n  "private": true,\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n',
    'src/profile.js': '// Validasi profil. Bio belum dibatasi panjangnya.\nexport function validateProfile(p) {\n  const errors = [];\n  if (!p.name || !p.name.trim()) errors.push("name wajib");\n  return errors;\n}\n',
    'test/profile.test.js': 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { validateProfile } from "../src/profile.js";\ntest("name wajib", () => assert.deepEqual(validateProfile({ name: "" }), ["name wajib"]));\n',
  },
};
for (const [name, files] of Object.entries(svcs)) repo(path.join(dir, 'source-code', name), name, files);
repo(dir, 'root', { 'README.md': '# harness sandbox\n\nRoot latihan. Remote semua repo adalah folder lokal .sandbox/remotes; tidak ada yang sampai ke GitHub.\n', '.gitignore': 'source-code/\n.sandbox/\nstart.sh\nstart.cmd\n' });

const ins = spawnSync('node', [path.join(HARNESS, 'install.mjs'), dir, '--yes', '--in-place'], { cwd: dir, encoding: 'utf8' });
if (ins.status !== 0) die(`install gagal:\n${ins.stdout}\n${ins.stderr}`);
const cfgF = path.join(dir, 'harness.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgF, 'utf8'));
cfg.services = ['frontend', 'backend'];
cfg.ship = { ...(cfg.ship || {}), base: { frontend: 'main', backend: 'main' } };
if (cfg.plane) cfg.plane.enabled = false;
fs.writeFileSync(cfgF, `${JSON.stringify(cfg, null, 2)}\n`);
git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'sandbox: config'); git(dir, 'push', '-q', 'origin', 'main');

// gh tiruan + peluncur
const fake = path.join(sb, 'bin', 'fake-gh.mjs');
fs.mkdirSync(path.dirname(fake), { recursive: true });
fs.copyFileSync(path.join(HARNESS, 'scripts', 'fake-gh.mjs'), fake);
wr(path.join(sb, 'bin', 'gh'), `#!/bin/sh\nexec node "${fake.replace(/\\/g, '/')}" "$@"\n`); fs.chmodSync(path.join(sb, 'bin', 'gh'), 0o755);
wr(path.join(sb, 'bin', 'gh.cmd'), `@echo off\r\nnode "${fake}" %*\r\n`);
const bin = path.join(sb, 'bin');
wr(path.join(dir, 'start.sh'), `#!/bin/sh\n# Buka claude di sandbox dengan gh tiruan (hanya untuk sesi ini).\ncd "$(dirname "$0")"\nexport PATH="${bin.replace(/\\/g, '/')}:$PATH"\nexport HARNESS_SANDBOX=1\nexec claude "$@"\n`); fs.chmodSync(path.join(dir, 'start.sh'), 0o755);
wr(path.join(dir, 'start.cmd'), `@echo off\r\ncd /d "%~dp0"\r\nset "PATH=${bin};%PATH%"\r\nset HARNESS_SANDBOX=1\r\nclaude %*\r\n`);

console.log(`Sandbox siap: ${dir}
- service: frontend (ProfileForm: tombol Save selalu aktif), backend (validasi bio belum dibatasi)
- semua remote = folder lokal ${path.join(sb, 'remotes')}; push tidak sampai ke GitHub
- gh = tiruan (PR/check/merge dicatat di ${path.join(sb, 'prs.json')}), aktif hanya lewat peluncur

Buka:  ${process.platform === 'win32' ? path.join(dir, 'start.cmd') : path.join(dir, 'start.sh')}
Cek tiruan aktif (di sesi itu):  ! gh --version   → "gh version 0.0.0-sandbox"
Ulang dari nol:  node ${path.join(HARNESS, 'scripts', 'sandbox.mjs')} ${dir} --reset`);
