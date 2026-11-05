// Pembersihan berkas sementara. Bawaan = rencana saja; hanya `--yes` yang menghapus (dan agent tidak boleh memakai --yes: guard-bash).
// Tidak menyentuh: work item, docs/, knowledge, config, metrics, handoff terakhir.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listItems } from './lib.mjs';

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

// Worktree tambahan di repo root (selain worktree utama). Kebijakan layout multi-repo: root selalu di branch utama, tanpa worktree;
// worktree hanya di repo service. `removable` = bersih dan sudah digabung ke HEAD root (git worktree remove tanpa --force tetap menolak yang kotor).
export function rootWorktrees(root, cfg) {
  if (!cfg || cfg.layout !== 'multi-repo') return [];
  const r = git(root, ['worktree', 'list', '--porcelain']);
  if (r.status !== 0) return [];
  const blocks = r.stdout.split(/\r?\n\r?\n/).map((b) => b.trim()).filter(Boolean).slice(1); // entri pertama = worktree utama
  return blocks.map((b) => {
    const f = {}; for (const l of b.split(/\r?\n/)) { const i = l.indexOf(' '); f[i < 0 ? l : l.slice(0, i)] = i < 0 ? true : l.slice(i + 1); }
    const p = path.resolve(f.worktree);
    const branch = f.branch ? String(f.branch).replace(/^refs\/heads\//, '') : null;
    const exists = fs.existsSync(p);
    const dirty = exists && !!git(p, ['status', '--porcelain']).stdout.trim();
    const merged = git(root, ['merge-base', '--is-ancestor', branch || f.HEAD, 'HEAD']).status === 0;
    return { path: p, branch, exists, dirty, merged, removable: exists && !dirty && merged };
  });
}

const age = (p) => { try { return (Date.now() - fs.statSync(p).mtimeMs) / 86400e3; } catch { return 0; } };
const size = (p) => { try { const st = fs.statSync(p); if (!st.isDirectory()) return st.size; return fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0); } catch { return 0; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

export function planGc(root, cfg, { days = 30 } = {}) {
  const out = []; const add = (p, why, extra = {}) => out.push({ path: p, rel: path.relative(root, p).split(path.sep).join('/'), why, bytes: size(p), ...extra });
  for (const w of rootWorktrees(root, cfg)) if (w.removable) add(w.path, `worktree di root${w.branch ? ` (${w.branch})` : ''}: bersih dan sudah digabung; root selalu di main tanpa worktree`, { kind: 'worktree', root });
  const open = new Set(listItems(root).filter((i) => i.status !== 'merged').map((i) => i.slug));
  const ev = path.join(root, '.harness', 'evidence');
  for (const slug of ls(ev)) if (!open.has(slug)) add(path.join(ev, slug), 'bukti test item yang sudah merged / tidak ada');
  const rot = path.join(root, '.harness', 'events.jsonl.1'); if (fs.existsSync(rot)) add(rot, 'event log hasil rotasi');
  for (const f of ls(path.join(root, '.harness', 'state'))) if (/^stop-.+\.json$/.test(f) && age(path.join(root, '.harness', 'state', f)) > 1) add(path.join(root, '.harness', 'state', f), 'penghitung Stop sesi lama');
  const st = path.join(root, '.claude', 'state');
  for (const f of ls(st)) if (/^ctx-.+\.json$/.test(f) && age(path.join(st, f)) > 1) add(path.join(st, f), 'penanda ambang konteks sesi lama');
  for (const f of ls(path.join(st, 'merge-tickets'))) { const p = path.join(st, 'merge-tickets', f); if (age(p) * 1440 > (cfg.ship.ticket_ttl_min || 30)) add(p, 'tiket merge kedaluwarsa'); }
  const ut = path.join(st, 'update-ticket.json'); if (fs.existsSync(ut) && age(ut) * 1440 > 30) add(ut, 'tiket update kedaluwarsa');
  const ad = path.join(root, '.claude', 'audit');
  for (const f of ls(ad)) if (f.endsWith('.jsonl') && age(path.join(ad, f)) > days) add(path.join(ad, f), `audit lebih dari ${days} hari`);
  return out;
}

export function applyGc(items) {
  let n = 0;
  for (const i of items) {
    try {
      if (i.kind === 'worktree') { if (git(i.root, ['worktree', 'remove', i.path]).status !== 0) continue; git(i.root, ['worktree', 'prune']); n++; }
      else { fs.rmSync(i.path, { recursive: true, force: true }); n++; }
    } catch { /* lewati */ }
  }
  return n;
}
