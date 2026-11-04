// Pembersihan berkas sementara. Bawaan = rencana saja; hanya `--yes` yang menghapus (dan agent tidak boleh memakai --yes: guard-bash).
// Tidak menyentuh: work item, docs/, knowledge, config, metrics, handoff terakhir.
import fs from 'node:fs';
import path from 'node:path';
import { listItems } from './lib.mjs';

const age = (p) => { try { return (Date.now() - fs.statSync(p).mtimeMs) / 86400e3; } catch { return 0; } };
const size = (p) => { try { const st = fs.statSync(p); if (!st.isDirectory()) return st.size; return fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0); } catch { return 0; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

export function planGc(root, cfg, { days = 30 } = {}) {
  const out = []; const add = (p, why) => out.push({ path: p, rel: path.relative(root, p).split(path.sep).join('/'), why, bytes: size(p) });
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
  let n = 0; for (const i of items) { try { fs.rmSync(i.path, { recursive: true, force: true }); n++; } catch { /* lewati */ } }
  return n;
}
