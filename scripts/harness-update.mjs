#!/usr/bin/env node
// `harness update`: perbarui harness di root project ke main.
//   node scripts/harness-update.mjs <root>... [--dry-run] [--push] [--no-pull]
//   node scripts/harness-update.mjs --all                 semua project terdaftar (~/.harness/projects.json)
//   node scripts/harness-update.mjs <root> --rollback     revert commit update harness terakhir (git revert; tidak ada push)
// Alur per root: tentukan root git → pastikan di root_branch (pindah bila bersih, berhenti bila ada perubahan tracked; .harness/ diabaikan)
//   → git fetch origin <branch> + pull --ff-only → installer --update --in-place (commit "chore(harness): update to vX.Y.Z", tanpa kredit apa pun)
//   → doctor → push ke origin/<branch> hanya bila config update.autoPush atau --push → laporan.
// Berkas milik user (docs/discussion, work item, knowledge, config, rule/agent buatan sendiri) tidak ditimpa: itu perilaku install.mjs --update.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProjects } from './projects.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const DRY = flag('dry-run');
const g = (cwd, args, ms = 120000) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: ms });
const gout = (cwd, args) => { const r = g(cwd, args); return r.status === 0 ? r.stdout.trim() : ''; };
const readVer = () => fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const tail = (r) => String(r.stderr || r.stdout || r.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ; ').slice(0, 220);
// perubahan tracked selain di bawah .harness/ (yang memang tidak di-commit)
const dirtyTracked = (cwd) => g(cwd, ['status', '--porcelain', '--untracked-files=no']).stdout.split('\n').filter((l) => l.trim() && !/^.. "?\.harness\//.test(l));

export function updateRoot(root, { dry = DRY, push = flag('push'), pull = !flag('no-pull'), rollback = flag('rollback') } = {}) {
  const rep = { root, steps: [], ok: false };
  const step = (s) => rep.steps.push(s);
  const stop = (why) => { rep.error = why; return rep; };
  if (!fs.existsSync(path.join(root, '.claude', 'harness.version'))) return stop('bukan root ber-harness (.claude/harness.version tidak ada)');
  const top = gout(root, ['rev-parse', '--show-toplevel']);
  if (!top) return stop('bukan repo git');
  const cfg = readJson(path.join(root, 'harness.config.json')) || {};
  const branch = cfg.root_branch || 'main';
  rep.branch = branch;
  const cur = gout(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const hasOrigin = g(root, ['remote', 'get-url', 'origin']).status === 0;

  if (rollback) {
    if (cur !== branch) return stop(`rollback hanya di ${branch} (sekarang: ${cur || 'detached'})`);
    if (dirtyTracked(root).length) return stop('ada perubahan tracked yang belum di-commit; commit/stash dulu');
    const sha = gout(root, ['log', '-n', '1', '--format=%H', '--grep=^chore(harness): update to v']);
    if (!sha) return stop('tidak ada commit "chore(harness): update to v…" untuk dibatalkan');
    const subj = gout(root, ['log', '-n', '1', '--format=%s', sha]);
    if (dry) { step(`(dry run) git revert ${sha.slice(0, 8)} "${subj}"`); rep.ok = true; return rep; }
    const r = g(root, ['-c', 'user.name=' + (gout(root, ['config', 'user.name']) || 'harness-installer'), '-c', 'user.email=' + (gout(root, ['config', 'user.email']) || 'harness@localhost'), 'revert', '--no-edit', sha]);
    if (r.status !== 0) { g(root, ['revert', '--abort']); return stop(`git revert gagal: ${tail(r)}`); }
    step(`revert ${sha.slice(0, 8)} "${subj}"`); rep.ok = true; rep.note = 'tidak di-push; push manual bila perlu'; return rep;
  }

  // 1. pastikan di root_branch
  if (cur !== branch) {
    if (dirtyTracked(root).length) return stop(`sedang di ${cur || 'detached'} dengan perubahan tracked; commit/stash dulu, lalu ulangi (update harus di ${branch})`);
    if (dry) step(`(dry run) git switch ${branch}`);
    else { const r = g(root, ['switch', branch]); if (r.status !== 0) return stop(`gagal pindah ke ${branch}: ${tail(r)}`); step(`pindah ${cur || 'detached'} → ${branch}`); }
  } else if (dirtyTracked(root).length) return stop(`ada perubahan tracked di ${branch}; commit/stash dulu`);
  // 2. sinkron dengan remote
  if (hasOrigin && !dry) {
    const f = g(root, ['fetch', 'origin', branch]);
    if (f.status !== 0) return stop(`git fetch origin ${branch} gagal: ${tail(f)}`);
    const p = g(root, ['pull', '--ff-only', 'origin', branch]);
    if (p.status !== 0) return stop(`git pull --ff-only gagal (history menyimpang?): ${tail(p)}`);
    step(`fetch + pull --ff-only origin/${branch}`);
  } else step(hasOrigin ? `(dry run) fetch + pull origin/${branch}` : 'tidak ada remote origin: sinkronisasi dilewati');
  // 3. installer sendiri
  const before = readJson(path.join(root, '.claude', 'harness.version'))?.version || '?';
  if (pull && !dry && !gout(ROOT, ['status', '--porcelain', '--untracked-files=no'])) { const r = g(ROOT, ['pull', '--ff-only']); step(r.status === 0 ? 'installer: pull --ff-only' : `installer: pull dilewati (${tail(r)})`); }
  const ver = readVer();
  rep.from = before; rep.to = ver;
  const ins = spawnSync(process.execPath, [path.join(ROOT, 'install.mjs'), root, '--update', '--in-place', '--yes', '--commit-message', `chore(harness): update to v${ver}`, ...(dry ? ['--dry-run'] : [])], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (ins.status !== 0) return stop(`installer gagal: ${tail(ins)}`);
  const upToDate = /Sudah terbaru/.test(ins.stdout);
  step(upToDate ? `sudah terbaru (${ver}); tidak ada perubahan` : dry ? `(dry run) ${before} → ${ver}` : `terapkan ${before} → ${ver} + commit "chore(harness): update to v${ver}"`);
  if (dry) { rep.ok = true; return rep; }
  // 4. doctor
  const doc = spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'harness.mjs'), 'doctor'], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  rep.doctor = doc.status === 0 ? 'OK' : `GAGAL (${(doc.stdout.match(/\| (.+?) \| GAGAL/g) || []).map((x) => x.slice(2, -8)).join(', ') || 'lihat doctor'})`;
  step(`doctor: ${rep.doctor}`);
  // 5. push hanya bila diizinkan
  const auto = (cfg.update && cfg.update.autoPush) === true;
  if (!upToDate && hasOrigin && (auto || push)) {
    const r = g(root, ['push', 'origin', branch]);
    rep.pushed = r.status === 0;
    step(r.status === 0 ? `push origin ${branch}` : `push gagal: ${tail(r)}`);
  } else rep.pushed = false;
  rep.ok = true;
  return rep;
}

function show(r) {
  console.log(`\n## ${r.root}\n${r.steps.map((s) => `- ${s}`).join('\n')}`);
  if (r.error) console.log(`GAGAL: ${r.error}`);
  else console.log(`${r.from ? `versi: ${r.from} → ${r.to} · ` : ''}branch: ${r.branch} · di-push: ${r.pushed ? 'ya' : 'tidak'}${r.note ? ` · ${r.note}` : ''}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const skip = new Set();
  const roots = flag('all') ? readProjects() : argv.filter((a, i) => !a.startsWith('--') && !skip.has(i)).map((a) => path.resolve(a));
  if (!roots.length) { console.error('pakai: harness-update.mjs <root>... | --all [--dry-run] [--push] [--no-pull] [--rollback]'); process.exit(1); }
  let failed = 0;
  for (const root of roots) { const r = updateRoot(root); show(r); if (!r.ok) failed++; }
  process.exit(failed ? 1 : 0);
}
