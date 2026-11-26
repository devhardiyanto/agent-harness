#!/usr/bin/env node
// Baris 1: root · topik sesi · service · model · effort · ponytail. Baris 2: konteks · batas 5j/7h · +/- baris.
// Konteks dari respons API terakhir, jadi `/context` bisa sedikit lebih tinggi sampai respons berikutnya.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, isMain } from './lib.mjs';
import { sessionTopic, planServices } from './topics.mjs';

const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const hhmm = (sec) => { const d = new Date(sec * 1000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const level = (p) => (p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok');

// Berkas penanda mode yang ditulis plugin ponytail; tidak ada atau "off" = tanpa badge.
export function ponytailMode(env = process.env) {
  const dir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  try {
    const m = fs.readFileSync(path.join(dir, '.ponytail-active'), 'utf8').trim().split(/\s+/)[0].toLowerCase();
    return m === 'off' ? null : m || 'on';
  } catch { return null; }
}

export function statusData(root, payload = {}, env = process.env) {
  const d = { root: path.basename(root), topic: null, model: null, effort: null, ctx: null, limits: [], lines: null, ponytail: ponytailMode(env) };
  if (payload.model) d.model = String(payload.model.display_name || payload.model.id || '').trim() || null;
  if (payload.effort && payload.effort.level) d.effort = String(payload.effort.level);
  try {
    const t = sessionTopic(root, payload);
    if (t) { d.topic = t.slug; d.services = [...new Set([...planServices(t.dir), ...t.services])]; }
  } catch { /* abaikan */ }
  const cw = payload.context_window || {};
  const cu = cw.current_usage || {};
  const tokens = num(cw.total_input_tokens) ?? (cw.current_usage ? (num(cu.input_tokens) || 0) + (num(cu.cache_creation_input_tokens) || 0) + (num(cu.cache_read_input_tokens) || 0) : null);
  const size = num(cw.context_window_size);
  const pct = num(cw.used_percentage) ?? (tokens !== null && size ? (tokens * 100) / size : null);
  if (pct !== null) d.ctx = { pct: Math.round(pct), tokens, size };
  const rl = payload.rate_limits || {};
  for (const [key, label] of [['five_hour', '5j'], ['seven_day', '7h']]) {
    const p = num(rl[key] && rl[key].used_percentage);
    if (p !== null) d.limits.push({ label, pct: Math.round(p), reset: num(rl[key].resets_at) });
  }
  const c = payload.cost || {};
  // Tanpa topik, +/- adalah total sesi (termasuk sebelum resume) dan menyesatkan.
  if (d.topic && (num(c.total_lines_added) || 0) + (num(c.total_lines_removed) || 0) > 0) d.lines = { add: num(c.total_lines_added) || 0, del: num(c.total_lines_removed) || 0 };
  return d;
}

function segments(d) {
  const topic = d.topic ? (d.topic.length > 40 ? `${d.topic.slice(0, 39)}…` : d.topic) : null;
  const l1 = [{ t: d.root, k: 'root', pill: true }, topic ? { t: topic, k: 'topic', pill: true } : { t: 'belum ada topik', k: 'dim' }];
  if (d.services && d.services.length) l1.push({ t: d.services.length > 3 ? `${d.services.slice(0, 3).join(', ')} +${d.services.length - 3}` : d.services.join(', '), k: 'svc' });
  if (d.model) l1.push({ t: d.effort ? `${d.model} · ${d.effort}` : d.model, k: 'dim' });
  if (d.ponytail) l1.push({ t: `ponytail:${d.ponytail}`, k: 'dim' });
  const l2 = [];
  if (d.ctx) {
    const lv = level(d.ctx.pct);
    l2.push({ t: `konteks ${d.ctx.pct}%`, k: `ctx-${lv}`, pill: true });
    if (d.ctx.tokens !== null) l2.push({ t: d.ctx.size ? `${kfmt(d.ctx.tokens)}/${kfmt(d.ctx.size)}` : kfmt(d.ctx.tokens), k: 'dim' });
  }
  if (d.limits.length) {
    const worst = Math.max(...d.limits.map((x) => x.pct));
    const txt = d.limits.map((x) => `${x.label} ${x.pct}%${x.pct >= 85 && x.reset ? ` (reset ${hhmm(x.reset)})` : ''}`).join(' · ');
    l2.push({ t: txt, k: worst >= 85 ? 'ctx-bad' : 'dim' });
  }
  if (d.lines) l2.push({ t: `+${d.lines.add}`, k: 'add', join: true }, { t: `−${d.lines.del}`, k: 'del' });
  return [l1, l2];
}

const PALETTE = {
  kapsul: { root: [30, 255], topic: [238, 255], svc: 179, 'ctx-ok': [71, 16], 'ctx-warn': [178, 16], 'ctx-bad': [167, 255], dim: 244, add: 71, del: 167 },
  tenang: { root: '36', topic: '1', svc: '33', dim: '2', 'ctx-ok': '32', 'ctx-warn': '33', 'ctx-bad': '31', add: '32', del: '31' },
  kontras: { root: '1;96', topic: '1;97', svc: '1;93', dim: '37', 'ctx-ok': '1;92', 'ctx-warn': '1;93', 'ctx-bad': '1;91', add: '1;92', del: '1;91' },
};

function paint(seg, theme) {
  const P = PALETTE[theme];
  if (!P) return seg.pill && seg.k.startsWith('ctx-') ? `[${seg.t}]` : seg.t;
  if (theme === 'kapsul') {
    const v = P[seg.k];
    if (seg.pill && Array.isArray(v)) return `\x1b[38;5;${v[0]}m▐\x1b[0m\x1b[48;5;${v[0]};38;5;${v[1]};1m${seg.t}\x1b[0m\x1b[38;5;${v[0]}m▌\x1b[0m`;
    const fg = Array.isArray(v) ? v[0] : v;
    return fg ? `\x1b[38;5;${fg}m${seg.t}\x1b[0m` : seg.t;
  }
  return P[seg.k] ? `\x1b[${P[seg.k]}m${seg.t}\x1b[0m` : seg.t;
}

export function render(d, { theme = 'kapsul', max = 120 } = {}) {
  const th = theme in PALETTE || theme === 'mono' ? theme : 'kapsul';
  const sep = th === 'kapsul' ? ' ' : th === 'mono' ? ' · ' : '  ';
  const lines = segments(d).map((segs) => {
    let out = '';
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const piece = paint(s, th);
      const prev = segs[i - 1];
      const glue = !out ? '' : prev && prev.join ? ' ' : th === 'kapsul' && prev && !prev.pill && !s.pill ? ' · ' : sep;
      const next = out + glue + piece;
      if (width(next) > max) break;
      out = next;
    }
    return th === 'kapsul' || !out ? out : `${paint({ t: '▌', k: 'root' }, th)}${out}`;
  }).filter(Boolean);
  return lines.join('\n');
}

async function main() {
  let payload = {};
  try { const chunks = []; for await (const ch of process.stdin) chunks.push(ch); payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* bukan JSON */ }
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || (payload.workspace && payload.workspace.project_dir) || payload.cwd || process.cwd());
  try {
    const cfg = loadConfig(root);
    if (cfg.tui.statusline === false) return;
    const theme = process.env.NO_COLOR ? 'mono' : cfg.tui.theme;
    const cols = Number(process.env.COLUMNS) || 0;
    const max = cols ? Math.max(20, Math.min(cfg.tui.max_width, cols - 4)) : cfg.tui.max_width;
    process.stdout.write(`${render(statusData(root, payload), { theme, max })}\n`);
  } catch { process.stdout.write(`▌${path.basename(root)}\n`); }
}
if (isMain(import.meta.url)) main();
