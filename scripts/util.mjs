// Helper bersama skrip installer (install.mjs, harness-update.mjs, update-all.mjs). Tanpa dependency.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readVer = () => fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
export const readJson = (f, fallback = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
export const installedOf = (p) => readJson(path.join(p, '.claude', 'harness.version'))?.version || null;

const semver = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
export const cmpVer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

// Tabel markdown sebagai string; tanda | di sel diganti agar tabel tidak pecah.
export const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`).join('\n')}`;

// Dua baris terakhir keluaran proses (stderr dulu) untuk pesan galat.
export const tail = (r) => String(r.stderr || r.stdout || r.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ; ').slice(0, 220);

// claude di Windows adalah claude.cmd: lewat shell. Argumen selalu konstan (bukan input user).
export const claude = (args, { cwd, timeout = 120000 } = {}) => (process.platform === 'win32'
  ? spawnSync(`claude ${args.join(' ')}`, { cwd, encoding: 'utf8', shell: true, timeout })
  : spawnSync('claude', args, { cwd, encoding: 'utf8', timeout }));

export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  try { fs.renameSync(tmp, file); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}

// True bila modul dijalankan langsung (bukan di-import).
export function isMainScript(metaUrl) {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}
