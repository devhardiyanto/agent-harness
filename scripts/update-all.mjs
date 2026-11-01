#!/usr/bin/env node
// Perbarui harness di semua project terdaftar.
//   node scripts/update-all.mjs                 pull installer → refresh marketplace → tiap project: install --update → claude plugin update
//   node scripts/update-all.mjs --list          daftar project + versi terpasang
//   node scripts/update-all.mjs --scan <dir>    cari project ber-harness (.claude/harness.version) di bawah <dir> lalu daftarkan
//   node scripts/update-all.mjs --add <p>... | --remove <p>...
//   opsi: --dry-run (rencana installer saja) · --no-pull · --no-plugin · --force
// Installer memperbarui tiap project di branch `harness-update` (satu commit); kamu yang me-review dan merge. Tanpa dependency.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProjects, addProject, removeProject, registryFile } from './projects.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const vals = (n) => { const i = argv.indexOf(`--${n}`); if (i < 0) return []; const o = []; for (const a of argv.slice(i + 1)) { if (a.startsWith('--')) break; o.push(a); } return o; };
const MARKET = 'harness-marketplace', PLUGIN = `harness@${MARKET}`;
const readVer = () => fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const installedOf = (p) => { try { return JSON.parse(fs.readFileSync(path.join(p, '.claude', 'harness.version'), 'utf8')).version || null; } catch { return null; } };
const lastLine = (r) => (String(r.stderr || '') + String(r.stdout || '')).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' | ').slice(0, 200);
const table = (head, rows) => { console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`); for (const r of rows) console.log(`| ${r.join(' | ')} |`); };
// Argumen claude konstan (bukan input user), jadi satu string lewat shell di Windows (claude.cmd) aman.
const claude = (args, cwd) => (process.platform === 'win32'
  ? spawnSync(`claude ${args.join(' ')}`, { cwd, encoding: 'utf8', shell: true })
  : spawnSync('claude', args, { cwd, encoding: 'utf8' }));

for (const p of vals('add')) { const ok = fs.existsSync(p); console.log(ok ? (addProject(p) ? `+ ${path.resolve(p)}` : `= ${path.resolve(p)} (sudah terdaftar)`) : `! ${p} tidak ada`); if (ok && !installedOf(path.resolve(p))) console.log('  catatan: belum ada .claude/harness.version (pasang dulu dengan install.mjs)'); }
for (const p of vals('remove')) console.log(removeProject(p) ? `- ${path.resolve(p)}` : `= ${p} tidak terdaftar`);
if (flag('add') || flag('remove')) process.exit(0);

if (flag('scan')) {
  const base = vals('scan')[0];
  if (!base || !fs.existsSync(base)) { console.error('pakai: --scan <folder>'); process.exit(1); }
  const SKIP = new Set(['node_modules', '.git', 'source-code', 'vendor', 'dist', 'build']);
  const walk = (d, depth) => {
    if (fs.existsSync(path.join(d, '.claude', 'harness.version'))) { console.log(addProject(d) ? `+ ${d}` : `= ${d} (sudah terdaftar)`); return; }
    if (depth === 0) return;
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name), depth - 1);
  };
  walk(path.resolve(base), 3);
  process.exit(0);
}

const projects = readProjects();
if (flag('list') || !projects.length) {
  if (!projects.length) console.log(`Belum ada project terdaftar (${registryFile()}). Pasang/perbarui lewat install.mjs (terdaftar otomatis) atau: --scan <folder>, --add <path>.`);
  else table(['project', 'terpasang', 'installer'], projects.map((p) => [p, fs.existsSync(p) ? installedOf(p) || '-' : 'HILANG', readVer()]));
  process.exit(0);
}

const DRY = flag('dry-run');
const notes = [];
if (!flag('no-pull')) {
  const dirty = spawnSync('git', ['-C', ROOT, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim();
  if (dirty) notes.push('git pull dilewati: ada perubahan lokal di folder installer.');
  else { const r = spawnSync('git', ['-C', ROOT, 'pull', '--ff-only'], { encoding: 'utf8' }); notes.push(r.status === 0 ? 'installer: git pull --ff-only OK' : `git pull gagal (${lastLine(r)}); memakai installer lokal.`); }
}
const VERSION = readVer();
const hasClaude = !flag('no-plugin') && !DRY && claude(['--version']).status === 0;
if (!flag('no-plugin') && !hasClaude && !DRY) notes.push('claude tidak ditemukan di PATH: pembaruan plugin dilewati.');
if (hasClaude) { const r = claude(['plugin', 'marketplace', 'update', MARKET]); notes.push(r.status === 0 ? `marketplace ${MARKET}: diperbarui` : `marketplace ${MARKET}: gagal (${lastLine(r)})`); }
console.log(`Installer ${VERSION}${DRY ? ' (dry run)' : ''}\n`);

const rows = []; let failed = 0;
for (const p of projects) {
  const inst = installedOf(p);
  let kernel, plug = '-', note = '';
  if (!fs.existsSync(p)) { kernel = 'HILANG'; note = 'folder tidak ada; --remove bila sudah tidak dipakai'; failed++; }
  else if (!inst) { kernel = 'BUKAN v1'; note = 'tidak ada .claude/harness.version'; failed++; }
  else if (cmp(inst, VERSION) > 0 && !flag('force')) { kernel = `${inst} (lebih baru)`; note = 'perbarui installer (git pull)'; failed++; }
  else if (cmp(inst, VERSION) === 0 && !flag('force')) kernel = `${inst} terbaru`;
  else {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'install.mjs'), p, '--update', DRY ? '--dry-run' : '--yes', ...(flag('force') ? ['--force'] : [])], { cwd: p, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) kernel = DRY ? `${inst} → ${VERSION} (rencana)` : `${inst} → ${VERSION}`;
    else { kernel = 'GAGAL'; note = lastLine(r); failed++; }
    if (r.status === 0 && !DRY) note = 'branch harness-update: review lalu merge';
  }
  if (hasClaude && fs.existsSync(p) && inst) { const r = claude(['plugin', 'update', PLUGIN], p); plug = r.status === 0 ? 'OK' : 'GAGAL'; if (r.status !== 0) { note = `${note ? note + ' · ' : ''}plugin: ${lastLine(r)}`; failed++; } }
  rows.push([p, kernel, plug, note || '-']);
}
table(['project', 'kernel', 'plugin', 'catatan'], rows);
console.log(`\n${notes.map((n) => `- ${n}`).join('\n')}`);
if (!DRY) console.log('- Plugin baru dimuat pada sesi berikutnya (atau /reload-plugins di sesi yang berjalan).');
process.exit(failed ? 1 : 0);
