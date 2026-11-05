#!/usr/bin/env node
// Perbarui harness di semua project terdaftar.
//   node scripts/update-all.mjs                 pull installer → plugin global (marketplace update + plugin update --scope user) → tiap project: install --update
//   node scripts/update-all.mjs --list          daftar project + versi terpasang
//   node scripts/update-all.mjs --scan <dir>    cari project ber-harness (.claude/harness.version) di bawah <dir> lalu daftarkan
//   node scripts/update-all.mjs --add <p>... | --remove <p>...
//   node scripts/update-all.mjs --setup-plugin  pasang plugin harness global (scope user), sekali per mesin
//   opsi: --dry-run (rencana installer saja) · --no-pull · --no-plugin · --force · --cleanup-project (hapus pemasangan plugin tingkat project lama setelah kernel diperbarui)
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
// Alasan kegagalan ada di stderr (installer: "GAGAL: …"); stdout hanya rencana. Tanda | diganti agar tabel tidak pecah.
const lines = (s) => String(s || '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const lastLine = (r) => { const e = lines(r.stderr); return (e.length ? e.slice(0, 3) : lines(r.stdout).slice(-2)).join(' ; ').replace(/\|/g, '/').slice(0, 200); };
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

if (flag('setup-plugin')) {
  const url = spawnSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  const slug = (/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/.exec(url) || [])[1];
  if (!slug) { console.error('GAGAL: remote origin installer bukan GitHub; pasang manual: claude plugin install harness --marketplace <owner>/<repo> --scope user'); process.exit(1); }
  if (claude(['--version']).status !== 0) { console.error('GAGAL: claude tidak ditemukan di PATH'); process.exit(1); }
  const r = claude(['plugin', 'install', 'harness', '--marketplace', slug, '--scope', 'user']);
  console.log(r.status === 0 ? `plugin ${PLUGIN} terpasang global (scope user) dari ${slug}` : `GAGAL: ${lastLine(r)}`);
  process.exit(r.status === 0 ? 0 : 1);
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
let globalFailed = false;
if (hasClaude) {
  const m = claude(['plugin', 'marketplace', 'update', MARKET]); notes.push(m.status === 0 ? `marketplace ${MARKET}: diperbarui` : `marketplace ${MARKET}: gagal (${lastLine(m)})`);
  const u = claude(['plugin', 'update', PLUGIN, '--scope', 'user']); globalFailed = u.status !== 0;
  notes.push(u.status === 0 ? `plugin ${PLUGIN} (global, user): OK` : `plugin ${PLUGIN} (global, user): GAGAL (${lastLine(u)}); belum terpasang? jalankan --setup-plugin`);
}
console.log(`Installer ${VERSION}${DRY ? ' (dry run)' : ''}\n`);
notes.push('alur ini membuat branch harness-update (lama). Alur 1.7+ langsung di main tanpa branch tambahan: node scripts/harness-update.mjs <root>... | --all [--dry-run]');

const rows = []; let failed = 0;
for (const p of projects) {
  const inst = installedOf(p);
  let kernel, note = '';
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
  if (fs.existsSync(p) && inst) {
    let reg = false; try { const st = JSON.parse(fs.readFileSync(path.join(p, '.claude', 'settings.json'), 'utf8')); reg = !!(st.enabledPlugins && PLUGIN in st.enabledPlugins); } catch { /* abaikan */ }
    if (reg) note = `${note ? note + ' · ' : ''}masih mendaftarkan plugin di tingkat project (dibuang oleh update kernel setelah branch di-merge)`;
    if (flag('cleanup-project') && hasClaude && /→/.test(kernel) && !DRY) { const r = claude(['plugin', 'uninstall', PLUGIN, '--scope', 'project'], p); note = `${note ? note + ' · ' : ''}${r.status === 0 ? 'plugin project dihapus' : 'plugin project: tidak ada/gagal dihapus'}`; }
  }
  rows.push([p, kernel, note || '-']);
}
table(['project', 'kernel', 'catatan'], rows);
console.log(`\n${notes.map((n) => `- ${n}`).join('\n')}`);
if (!DRY) console.log('- Plugin baru dimuat pada sesi berikutnya (atau /reload-plugins di sesi yang berjalan).');
process.exit(failed || globalFailed ? 1 : 0);
