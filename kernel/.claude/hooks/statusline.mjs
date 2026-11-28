#!/usr/bin/env node
// Baris 1: root · topik sesi · service · model · effort · ponytail. Baris 2: konteks · batas 5j/7h · +/- baris.
// Konteks dari respons API terakhir, jadi `/context` bisa sedikit lebih tinggi sampai respons berikutnya.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, isMain } from './lib.mjs';
import { sessionTopic, planServices } from './topics.mjs';
import { readCache } from './knowledge.mjs';

const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
// Satu desimal untuk ribuan (469.2k) dan dua untuk juta (1.25M), nol di belakang dibuang: sama dengan angka Claude Code.
export const kfmt = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
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

// Nilai jendela auto-compact: angka, "400k", "1M", atau 100..1000 (= ribuan). "auto"/tidak valid = null.
export function parseWindow(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (v <= 1000 ? v * 1000 : v) : null;
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  return m[2] ? n : n <= 1000 ? n * 1000 : n;
}

// Jendela auto-compact (bukan jendela model): env, lalu settings local → project → user.
// Per file, modelSettings.<model>.autoCompactWindow menang atas autoCompactWindow top-level.
// JSON status line tidak memuatnya, jadi `konteks %` dihitung terhadap jendela ini bila lebih kecil.
export function compactWindow(root, modelId, env = process.env) {
  if (env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) return parseWindow(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
  const key = String(modelId || '').replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
  const home = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  for (const f of [path.join(root, '.claude', 'settings.local.json'), path.join(root, '.claude', 'settings.json'), path.join(home, 'settings.json')]) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const ms = j && j.modelSettings && key ? j.modelSettings[key] : null;
    const v = ms && ms.autoCompactWindow !== undefined ? ms.autoCompactWindow : j && j.autoCompactWindow;
    if (v !== undefined) return parseWindow(v);
  }
  return null;
}

// Service yang benar-benar ada (config atau folder repo); teks bebas di kolom service plan.md dibuang.
function knownServices(root) {
  const cfg = loadConfig(root);
  const out = new Set(cfg.services.map((s) => (typeof s === 'string' ? s : s && s.name)).filter(Boolean));
  try { for (const e of fs.readdirSync(path.join(root, cfg.services_dir), { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) out.add(e.name); } catch { /* abaikan */ }
  return out;
}

export function statusData(root, payload = {}, env = process.env) {
  const d = { root: path.basename(root), topic: null, model: null, effort: null, ctx: null, limits: [], lines: null, ponytail: ponytailMode(env) };
  if (payload.model) d.model = String(payload.model.display_name || payload.model.id || '').trim() || null;
  if (payload.effort && payload.effort.level) d.effort = String(payload.effort.level);
  try {
    const t = sessionTopic(root, payload);
    if (t) {
      d.topic = t.slug;
      const kc = readCache(root);
      // ? = knowledge belum ada, * = usang (dari hasil terakhir `harness.mjs knowledge`).
      const known = knownServices(root);
      d.services = [...new Set([...planServices(t.dir), ...t.services])].filter((s) => !known.size || known.has(s)).map((s) => (kc[s] === 'belum' ? `${s}?` : kc[s] === 'usang' ? `${s}*` : s));
    }
  } catch { /* abaikan */ }
  const cw = payload.context_window || {};
  const cu = cw.current_usage || {};
  // Isi konteks giliran berikutnya = input respons terakhir (termasuk cache) + output-nya, sama dengan angka "/clear to save" Claude Code.
  // used_percentage hanya menghitung input, jadi persen dihitung ulang dari token yang sama agar angka dan persen selaras.
  const inTok = num(cw.total_input_tokens) ?? (cw.current_usage ? (num(cu.input_tokens) || 0) + (num(cu.cache_creation_input_tokens) || 0) + (num(cu.cache_read_input_tokens) || 0) : null);
  const outTok = num(cw.total_output_tokens) ?? num(cu.output_tokens) ?? 0;
  // 0 sebelum respons pertama dan sesudah /compact: kosong, bukan 0%.
  const tokens = inTok ? inTok + outTok : null;
  const model = num(cw.context_window_size);
  const win = compactWindow(root, payload.model && payload.model.id, env);
  const size = win && (!model || win < model) ? win : model;
  const pct = tokens !== null && size ? (tokens * 100) / size : tokens === null && inTok !== 0 ? num(cw.used_percentage) : null;
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

// Penanda level selain warna (terbaca di mono, NO_COLOR, dan bagi pembaca buta warna).
const mark = (lv) => (lv === 'bad' ? ' !!' : lv === 'warn' ? ' !' : '');

// Segmen + prioritas (1 = paling penting, dipertahankan paling akhir saat baris terlalu lebar).
function segments(d) {
  const l1 = [{ t: d.root, k: 'root', pill: true, p: 1 }];
  l1.push(d.topic ? { t: d.topic.length > 40 ? `${d.topic.slice(0, 39)}…` : d.topic, k: 'topic', pill: true, p: 1, shrink: true } : { t: 'belum ada topik', k: 'dim', p: 2 });
  if (d.services && d.services.length) l1.push({ t: d.services.length > 3 ? `${d.services.slice(0, 3).join(', ')} +${d.services.length - 3}` : d.services.join(', '), k: 'svc', p: 3 });
  if (d.model) l1.push({ t: d.effort ? `${d.model} · ${d.effort}` : d.model, k: 'dim', p: 4 });
  if (d.ponytail) l1.push({ t: `ponytail:${d.ponytail}`, k: 'dim', p: 5 });
  const l2 = [];
  if (d.error) l2.push({ t: 'status line galat: lihat .claude/state/statusline.log', k: 'ctx-bad', p: 1 });
  else if (d.ctx) {
    const lv = level(d.ctx.pct);
    l2.push({ t: `konteks ${d.ctx.pct}%${mark(lv)}`, k: `ctx-${lv}`, pill: true, p: 1 });
    if (d.ctx.tokens !== null) l2.push({ t: d.ctx.size ? `${kfmt(d.ctx.tokens)}/${kfmt(d.ctx.size)}` : kfmt(d.ctx.tokens), k: 'dim', p: 3 });
  } else l2.push({ t: 'konteks ?', k: 'dim', pill: true, p: 1 }); // sebelum respons API pertama: tinggi status line tetap 2 baris
  for (const x of d.limits) {
    const lv = level(x.pct);
    l2.push({ t: `${x.label} ${x.pct}%${mark(lv)}${lv === 'bad' && x.reset ? ` (reset ${hhmm(x.reset)})` : ''}`, k: lv === 'ok' ? 'dim' : `lim-${lv}`, p: lv === 'ok' ? 4 : 2 });
  }
  if (d.lines) l2.push({ t: `+${d.lines.add} −${d.lines.del}`, k: 'dim', p: 5 });
  return [l1, l2];
}

// Alasan tiap warna (R-31). Kontras dihitung terhadap latar terminal gelap #0c0c0c; tui.background "light" memakai kolom kedua.
// kapsul (xterm-256):
//   root  latar 23 #005f5f, teks 255: 6.9:1; pembeda project, satu-satunya warna non-status di baris 1.
//   topic latar 240 #585858, teks 255: 6.3:1; latar cukup terang agar bentuk kapsul terlihat di terminal gelap.
//   svc   warna teks bawaan terminal: selalu terbaca, tidak bersaing dengan kuning peringatan.
//   dim   245 (gelap, 5.9:1) / 240 (terang, 6.6:1): info sekunder.
//   ctx   hijau 71 / kuning 178 dengan teks hitam, merah 124 #af0000 dengan teks 255 (6.0:1): hanya untuk status.
//   lim   kuning 178 / merah 167 (gelap), 136 / 160 (terang): batas 5j/7h yang ≥ 60%, per batas.
// tenang dan kontras: kode ANSI 16 warna, mengikuti skema warna terminal. kontras dirancang untuk terminal gelap.
const PALETTE = {
  kapsul: {
    dark: { root: [23, 255], topic: [240, 255], svc: null, dim: 245, 'ctx-ok': [71, 16], 'ctx-warn': [178, 16], 'ctx-bad': [124, 255], 'lim-warn': 178, 'lim-bad': 167 },
    light: { root: [23, 255], topic: [240, 255], svc: null, dim: 240, 'ctx-ok': [28, 255], 'ctx-warn': [136, 255], 'ctx-bad': [124, 255], 'lim-warn': 136, 'lim-bad': 160 },
  },
  tenang: { root: '36', topic: '1', svc: null, dim: '90', 'ctx-ok': '32', 'ctx-warn': '33', 'ctx-bad': '1;31', 'lim-warn': '33', 'lim-bad': '1;31' },
  kontras: { root: '1', topic: '1;4', svc: null, dim: '37', 'ctx-ok': '1;92', 'ctx-warn': '1;93', 'ctx-bad': '1;91', 'lim-warn': '1;93', 'lim-bad': '1;91' },
};

function paint(seg, theme, bg) {
  if (theme === 'mono') return seg.pill ? `[${seg.t}]` : seg.t;
  if (theme === 'kapsul') {
    const v = PALETTE.kapsul[bg][seg.k];
    if (seg.pill && Array.isArray(v)) return `\x1b[38;5;${v[0]}m▐\x1b[0m\x1b[48;5;${v[0]};38;5;${v[1]};1m${seg.t}\x1b[0m\x1b[38;5;${v[0]}m▌\x1b[0m`;
    const fg = Array.isArray(v) ? v[0] : v;
    return fg ? `\x1b[38;5;${fg}m${seg.t}\x1b[0m` : seg.t;
  }
  const c = PALETTE[theme][seg.k];
  return c ? `\x1b[${c}m${seg.t}\x1b[0m` : seg.t;
}

// Satu aturan untuk semua tema: pemisah " · " di antara teks biasa, spasi di samping kapsul; tema hanya mengganti warna.
// Baris terlalu lebar: buang segmen berprioritas terendah dulu, lalu persingkat topik dengan "…".
export function render(d, { theme = 'kapsul', max = 120, background = 'dark' } = {}) {
  const th = theme in PALETTE || theme === 'mono' ? theme : 'kapsul';
  const bg = background === 'light' ? 'light' : 'dark';
  const join = (segs) => {
    let out = '';
    segs.forEach((s, i) => {
      const prev = segs[i - 1];
      const pill = th === 'kapsul' || th === 'mono';
      const glue = !prev ? '' : pill && (s.pill || prev.pill) ? ' ' : ' · ';
      out += glue + paint(s, th, bg);
    });
    return out;
  };
  return segments(d).map((orig) => {
    const segs = orig.map((s) => ({ ...s }));
    while (width(join(segs)) > max && segs.some((s) => s.p > 1)) {
      const worst = Math.max(...segs.map((s) => s.p));
      const i = segs.map((s) => s.p).lastIndexOf(worst);
      segs.splice(i, 1);
    }
    const sh = segs.find((s) => s.shrink);
    if (sh) {
      while (width(join(segs)) > max && sh.t.length > 6) sh.t = `${sh.t.slice(0, -2)}…`;
    }
    return join(segs);
  }).filter(Boolean).join('\n');
}

// Satu baris terakhir: durasi dan galat, untuk menyelidiki status line yang hilang.
function logRun(root, ms, err) {
  try {
    const f = path.join(root, '.claude', 'state', 'statusline.log');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `${new Date().toISOString()} ${ms}ms${err ? ` GALAT ${String(err && err.stack || err).split('\n').slice(0, 3).join(' | ')}` : ''}\n`);
  } catch { /* abaikan */ }
}

async function main() {
  const t0 = Date.now();
  let payload = {};
  try { const chunks = []; for await (const ch of process.stdin) chunks.push(ch); payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* bukan JSON */ }
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || (payload.workspace && payload.workspace.project_dir) || payload.cwd || process.cwd());
  try {
    const cfg = loadConfig(root);
    if (cfg.tui.statusline === false) return;
    const theme = process.env.NO_COLOR ? 'mono' : cfg.tui.theme;
    const cols = Number(process.stdout.columns) || Number(process.env.COLUMNS) || 0;
    const max = cols ? Math.max(20, Math.min(cfg.tui.max_width, cols - 4)) : cfg.tui.max_width;
    const out = render(statusData(root, payload), { theme, max, background: cfg.tui.background });
    process.stdout.write(`${out || path.basename(root)}\n`);
    logRun(root, Date.now() - t0);
  } catch (e) { process.stdout.write(`${path.basename(root)} · status line galat: lihat .claude/state/statusline.log\n`); logRun(root, Date.now() - t0, e); }
}
if (isMain(import.meta.url)) main();
