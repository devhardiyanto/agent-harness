#!/usr/bin/env node
// Status line 2.0: satu baris. Root · topik aktif · model · effort.
// Persen konteks tidak ditampilkan (K6): pakai tampilan bawaan Claude Code / `/context` agar angkanya sama.
// Tidak pernah gagal keras: galat apa pun → nama root saja.
import path from 'node:path';
import { loadConfig, isMain } from './lib.mjs';
import { activeTopic } from './topics.mjs';

const THEMES = {
  tenang: { root: '36', item: '1', dim: '2' },
  kontras: { root: '1;96', item: '1;97', dim: '37' },
  mono: null,
};
const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;

export function statusData(root, payload = {}) {
  const d = { root: path.basename(root), topic: null, model: null, effort: null };
  if (payload.model) d.model = String(payload.model.display_name || payload.model.id || '').trim() || null;
  if (payload.effort && payload.effort.level) d.effort = String(payload.effort.level);
  try { const t = activeTopic(root); if (t) d.topic = t.slug; } catch { /* abaikan */ }
  return d;
}

export function render(d, { theme = 'tenang', max = 120 } = {}) {
  const T = THEMES[theme] === undefined ? THEMES.tenang : THEMES[theme];
  const c = (k, s) => (T && T[k] ? `\x1b[${T[k]}m${s}\x1b[0m` : s);
  const parts = [c('root', `▌${d.root}`)];
  parts.push(d.topic ? c('item', `topik: ${d.topic.length > 40 ? `${d.topic.slice(0, 39)}…` : d.topic}`) : c('dim', 'belum ada topik'));
  if (d.model) parts.push(c('dim', d.effort ? `${d.model} · ${d.effort}` : d.model));
  let out = '';
  for (const p of parts) { const next = out ? `${out}  ${p}` : p; if (width(next) > max) break; out = next; }
  return out;
}

async function main() {
  let payload = {};
  try { const chunks = []; for await (const ch of process.stdin) chunks.push(ch); payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* bukan JSON */ }
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || (payload.workspace && payload.workspace.project_dir) || payload.cwd || process.cwd());
  try {
    const cfg = loadConfig(root);
    if (cfg.tui.statusline === false) return;
    const theme = process.env.NO_COLOR ? 'mono' : cfg.tui.theme;
    process.stdout.write(`${render(statusData(root, payload), { theme, max: cfg.tui.max_width })}\n`);
  } catch { process.stdout.write(`▌${path.basename(root)}\n`); }
}
if (isMain(import.meta.url)) main();
