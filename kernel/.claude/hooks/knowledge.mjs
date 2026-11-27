// Status pengetahuan per service: ada atau belum, umur terhadap baseline, dan catatan "menunggu merge".
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFm } from './topics.mjs';
import { writeAtomic } from './lib.mjs';

const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };

// Baseline = branch yang di-deploy: origin/HEAD, lalu production, main, master (remote dulu, lalu lokal).
export function baselineRef(dir) {
  const head = git(dir, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^refs\/remotes\//, '');
  for (const b of ['origin/production', 'origin/main', 'origin/master', 'production', 'main', 'master']) if (git(dir, ['rev-parse', '-q', '--verify', `${b}^{commit}`])) return b;
  return null;
}

export const summaryPath = (root, svc) => path.join(root, 'docs', 'knowledge', svc, 'summary.md');

// Baris di "## Menunggu merge": - <tanggal> · <topik> · <branch>@<sha> · <ringkas>
const PENDING = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*([^·]+?)\s*·\s*([^@\s·]+)@([0-9a-f]{7,40})\s*·\s*(.+)$/i;
export function pendingEntries(text) {
  const m = /^##\s+Menunggu merge\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text || '');
  if (!m) return [];
  return m[1].split(/\r?\n/).map((l) => PENDING.exec(l.trim())).filter(Boolean).map((x) => ({ date: x[1], topic: x[2], branch: x[3], sha: x[4], note: x[5] }));
}

export function serviceStatus(root, cfg, svc) {
  const dir = path.join(root, cfg.services_dir, svc);
  const f = summaryPath(root, svc);
  const row = { svc, state: 'belum ada', behind: null, updated: null, base: null, pending: [] };
  let text = null; try { text = fs.readFileSync(f, 'utf8'); } catch { return row; }
  const fm = readFm(text);
  row.updated = fm.updated || null;
  row.base = fs.existsSync(path.join(dir, '.git')) ? baselineRef(dir) : null;
  if (row.base && fm.source_commit) {
    const n = git(dir, ['rev-list', '--count', `${fm.source_commit}..${row.base}`]);
    row.behind = n === null ? null : Number(n);
  }
  row.pending = pendingEntries(text).map((p) => ({ ...p, merged: !!row.base && spawnSync('git', ['merge-base', '--is-ancestor', p.sha, row.base], { cwd: dir }).status === 0 }));
  const limit = Number(cfg.knowledge_check?.stale_commits) || 30;
  row.state = row.behind === null ? 'ada (umur tidak terbaca)' : row.behind > limit ? `usang (${row.behind} commit)` : 'segar';
  return row;
}

// Hasil terakhir disimpan untuk status line, yang tidak boleh menjalankan git di tiap refresh.
export function writeCache(root, rows) {
  try {
    const f = path.join(root, '.claude', 'state', 'knowledge.json');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    writeAtomic(f, JSON.stringify(Object.fromEntries(rows.map((r) => [r.svc, r.state.startsWith('usang') ? 'usang' : r.state === 'belum ada' ? 'belum' : 'ok']))));
  } catch { /* cache saja */ }
}
export function readCache(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'knowledge.json'), 'utf8')); } catch { return {}; }
}
