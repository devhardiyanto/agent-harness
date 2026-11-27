#!/usr/bin/env node
// Daftar project ber-harness dan plugin global. Pembaruan project dijalankan oleh harness-update.mjs.
//   node scripts/update-all.mjs                 = node scripts/harness-update.mjs --all (meneruskan --dry-run, --no-pull, --no-plugin, --push)
//   node scripts/update-all.mjs --list          daftar project + versi terpasang
//   node scripts/update-all.mjs --scan <dir>    cari project ber-harness (.claude/harness.version) di bawah <dir> lalu daftarkan
//   node scripts/update-all.mjs --add <p>... | --remove <p>...
//   node scripts/update-all.mjs --setup-plugin  pasang plugin harness global (scope user), sekali per mesin
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readProjects, addProject, removeProject, registryFile } from './projects.mjs';
import { ROOT, readVer, table, claude, installedOf, tail } from './util.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const vals = (n) => { const i = argv.indexOf(`--${n}`); if (i < 0) return []; const o = []; for (const a of argv.slice(i + 1)) { if (a.startsWith('--')) break; o.push(a); } return o; };
const PLUGIN = 'harness@harness-marketplace';

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
  console.log(r.status === 0 ? `plugin ${PLUGIN} terpasang global (scope user) dari ${slug}` : `GAGAL: ${tail(r)}`);
  process.exit(r.status === 0 ? 0 : 1);
}

const projects = readProjects();
if (flag('list') || !projects.length) {
  if (!projects.length) console.log(`Belum ada project terdaftar (${registryFile()}). Pasang/perbarui lewat install.mjs (terdaftar otomatis) atau: --scan <folder>, --add <path>.`);
  else console.log(table(['project', 'terpasang', 'installer'], projects.map((p) => [p, fs.existsSync(p) ? installedOf(p) || '-' : 'HILANG', readVer()])));
  process.exit(0);
}

// Satu jalur update: langsung di root_branch tiap project (lihat harness-update.mjs).
const pass = argv.filter((a) => ['--dry-run', '--no-pull', '--no-plugin', '--push'].includes(a));
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'harness-update.mjs'), '--all', ...pass], { stdio: 'inherit' });
process.exit(r.status ?? 1);
