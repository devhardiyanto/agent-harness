// 1.13.0: bukti kesiapan 2.0. Tiap kalimat pendek yang ditangkap hook, tiap slash /harness:*, tiap penahanan Stop, dan tiap
// koreksi "bukan itu" dicatat LOKAL di .harness/state/intent-log.jsonl (tidak di-commit; prompt dipotong 60 karakter).
// `harness.mjs pilot` merangkumnya dan menilai ambang D9 (jendela pilot.hours, bawaan 6 jam): 0 salah tangkap + minimal 1 "push PR + merge" yang sampai merged.
import fs from 'node:fs';
import path from 'node:path';
import { listItems } from './lib.mjs';

export const logPath = (root) => path.join(root, '.harness', 'state', 'intent-log.jsonl');

export function logIntent(root, cfg, rec) {
  if (!cfg.pilot || !cfg.pilot.enabled) return;
  try {
    fs.mkdirSync(path.dirname(logPath(root)), { recursive: true });
    const r = { ts: new Date().toISOString(), ...rec };
    if (r.prompt) r.prompt = String(r.prompt).replace(/\s+/g, ' ').slice(0, 60);
    fs.appendFileSync(logPath(root), JSON.stringify(r) + '\n');
  } catch { /* log tidak boleh menggagalkan hook */ }
}

export function readLog(root) {
  try { return fs.readFileSync(logPath(root), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}

// Intent terakhir sesi ini (bukan slash/stop/misfire) → ditandai salah tangkap. Dikembalikan agar pemanggil bisa membatalkan efeknya.
export function markMisfire(root, cfg, sid) {
  const all = readLog(root);
  const last = [...all].reverse().find((r) => r.sid === sid && r.type === 'intent' && !r.misfire);
  if (!last) return null;
  logIntent(root, cfg, { type: 'misfire', sid, of: last.ts, kind: last.kind, slug: last.slug || null });
  return last;
}

export function pilotReport(root, cfg, { hours = cfg.pilot.hours || (cfg.pilot.days || 14) * 24 } = {}) {
  const since = Date.now() - hours * 3600000;
  const rows = readLog(root).filter((r) => Date.parse(r.ts) >= since);
  const count = (f) => rows.filter(f).length;
  const intents = count((r) => r.type === 'intent');
  const slash = count((r) => r.type === 'slash');
  const misfires = count((r) => r.type === 'misfire');
  const holds = count((r) => r.type === 'stop-hold');
  const ships = listItems(root).filter((i) => i.status === 'merged' && i.fm.pr && Date.parse(String(i.fm.updated || '')) >= since - 86400000).length; // updated = tanggal saja: toleransi satu hari
  const kinds = {};
  for (const r of rows.filter((x) => x.type === 'intent')) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  const deprecated = {};
  for (const r of rows.filter((x) => x.type === 'slash')) deprecated[r.skill] = (deprecated[r.skill] || 0) + 1;
  const checks = [
    ['S1', 'kalimat pendek dipakai lebih sering dari /harness:*', `${intents} frasa vs ${slash} slash`, intents > 0 && intents >= slash],
    ['S2', `salah tangkap ≤ ${cfg.pilot.max_misfires}`, `${misfires}`, misfires <= cfg.pilot.max_misfires],
    ['S3', 'tabel keputusan ditahan di akhir giliran minimal sekali', `${holds} penahanan`, holds > 0],
    ['S4', `"push PR + merge" sampai merged ≥ ${cfg.pilot.min_ships}`, `${ships} item`, ships >= cfg.pilot.min_ships],
  ];
  const ready = checks.every((c) => c[3]);
  return { hours, rows: rows.length, kinds, deprecated, checks, ready };
}

export function formatPilot(r) {
  const out = [`Pilot ${r.hours >= 48 && r.hours % 24 === 0 ? `${r.hours / 24} hari` : `${r.hours} jam`} terakhir (${r.rows} catatan):`, '| # | ukuran | hasil | status |', '|---|---|---|---|',
    ...r.checks.map((c) => `| ${c[0]} | ${c[1]} | ${c[2]} | ${c[3] ? 'OK' : 'BELUM'} |`)];
  const k = Object.entries(r.kinds).map(([a, b]) => `${a} ${b}`).join(', ');
  if (k) out.push(`Frasa: ${k}`);
  const d = Object.entries(r.deprecated).map(([a, b]) => `/harness:${a} ${b}`).join(', ');
  if (d) out.push(`Slash yang masih dipakai: ${d}`);
  out.push(r.ready ? 'Siap 2.0: semua ukuran terpenuhi.' : 'Belum siap 2.0: lanjutkan pilot atau perbaiki yang BELUM.');
  return out.join('\n');
}
