#!/usr/bin/env node
// 1.15.0 (A1): status line harness. Dijalankan Claude Code (settings.json → statusLine) dengan JSON sesi di stdin; mencetak
// maksimal dua baris. Hanya membaca berkas item yang disentuh sesi ini, jadi biayanya tidak bergantung jumlah work item.
// Tidak pernah gagal keras: galat apa pun → satu baris polos, agar TUI tidak terganggu.
import fs from 'node:fs';
import { activeSessionTopic } from './topic.mjs';
import path from 'node:path';
import { rootAge } from './growth.mjs';
import { itemBidang, bidangLabel, sessionBidang } from './bidang.mjs';
import { loadConfig, readItem, summarizeItem, decisionRows, readEvidence, readJson, touchedSlugs, shortSlug, isQuick, isMain } from './lib.mjs';

const THEMES = {
  tenang: { root: '36', item: '1', dim: '2', ok: '32', warn: '33', bad: '31', st: { draft: '33', approved: '36', 'in-progress': '33', 'in-review': '35', done: '32', merged: '32' } },
  kontras: { root: '1;96', item: '1;97', dim: '37', ok: '1;92', warn: '1;93', bad: '1;91', st: { draft: '1;93', approved: '1;96', 'in-progress': '1;93', 'in-review': '1;95', done: '1;92', merged: '1;92' } },
  mono: null,
};
const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;

// Nama sesi untuk /summarize: disimpan dalam bentuk aman-berkas. Kosong / tak berubah → tidak menulis.
export function saveSessionName(root, name) {
  const n = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  if (n.length < 2) return null;
  const f = path.join(root, '.harness', 'state', 'session-name');
  try { if (fs.readFileSync(f, 'utf8').trim() === n) return n; } catch { /* belum ada */ }
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${n}\n`); } catch { /* abaikan */ }
  return n;
}

// Item aktif sesi ini: yang terakhir disentuh dan belum merged; bila semua merged, yang terakhir disentuh.
// 1.15.2: juga jumlah item terbuka lain yang disentuh sesi ini (ditampilkan "+N"), agar status line tidak menyembunyikannya.
function activeItem(root, sid) {
  const slugs = [...touchedSlugs(root, sid)].reverse();
  let last = null; let pick = null; let open = 0;
  for (const sl of slugs) { const it = readItem(root, sl); if (!it) continue; if (!last) last = it; if (it.status !== 'merged') { open++; if (!pick) pick = it; } }
  const it = pick || last;
  if (it) it.others = Math.max(0, open - (pick ? 1 : 0));
  return it;
}

export function statusData(root, cfg, payload = {}) {
  const it = activeItem(root, payload.session_id);
  const d = { root: path.basename(root), item: null, lessons: 0, ctx: null, model: null, effort: null };
  // 1.15.1: model dan effort dari JSON sesi Claude Code (effort hanya ada bila model mendukungnya)
  if (payload.model) d.model = String(payload.model.display_name || payload.model.id || '').trim() || null;
  if (payload.effort && payload.effort.level) d.effort = String(payload.effort.level);
  try { d.lessons = fs.readFileSync(path.join(root, 'docs', 'memory', 'MEMORY.md'), 'utf8').split(/\r?\n§\r?\n/).filter((e) => e.replace(/<!--[\s\S]*?-->/g, '').trim()).length; } catch { /* belum ada memori */ }
  d.age = rootAge(root);
  const pct = payload.context_window && payload.context_window.used_percentage;
  if (typeof pct === 'number') d.ctx = Math.floor(pct);
  if (cfg.bidang && cfg.bidang.enabled) { const sb = sessionBidang(root, payload.session_id); d.bidang = it ? bidangLabel(itemBidang(cfg, it, sb)) || sb : sb; }
  if (!it) { try { const tp = activeSessionTopic(root, payload.session_id); if (tp) d.topic = tp.slug.replace(/^\d{4}-\d{2}-\d{2}-/, ''); } catch { /* abaikan */ } }
  if (it) {
    const s = summarizeItem(it);
    const ev = readEvidence(root, it.slug);
    d.item = { others: it.others || 0, slug: shortSlug(root, it.slug), status: it.status, quick: isQuick(it), ac: [s.ac.filter((a) => a.evidence === 'ok').length, s.ac.length],
      checks: ev ? String(ev.verdict || '').toLowerCase() : null, decisions: it.status === 'draft' ? decisionRows(it).length : 0 };
  }
  return d;
}

export function render(d, { theme = 'tenang', max = 120 } = {}) {
  const T = THEMES[theme] === undefined ? THEMES.tenang : THEMES[theme];
  const c = (k, s) => (T && T[k] ? `\x1b[${T[k]}m${s}\x1b[0m` : s);
  const st = (s) => (T ? `\x1b[${T.st[s] || '0'}m● ${s}\x1b[0m` : `● ${s}`);
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const l1 = [`${c('root', `▌${d.root}`)}`];
  const l2 = [];
  if (!d.item && d.topic) l1.push(c('item', `topik: ${cut(d.topic, 36)}`), c('dim', '◆ diskusi · "jadikan item" bila perlu perubahan'));
  else if (!d.item) l1.push(c('dim', 'tidak ada item aktif · ketik permintaanmu'));
  else {
    const i = d.item;
    l1.push(c('item', cut(i.slug, 36)) + (i.others ? c('dim', ` +${i.others}`) : ''), st(i.status) + (i.quick ? c('dim', ' quick') : ''));
    if (i.ac[1]) l1.push(`AC ${i.ac[0]}/${i.ac[1]}`);
    if (i.checks) l1.push(`checks ${i.checks === 'pass' ? c('ok', '✓') : i.checks === 'fail' ? c('bad', '✗') : c('warn', '?')}`);
    if (i.decisions) l2.push(c('warn', `${i.decisions} keputusan`));
  }
  if (d.model) l2.unshift(c('item', d.effort ? `${d.model} · ${d.effort}` : d.model));
  if (d.bidang) l2.unshift(c('root', d.bidang));
  if (d.age !== null && d.age !== undefined) l2.push(c('dim', `umur ${d.age} h`));
  if (d.lessons) l2.push(c('dim', `${d.lessons} pelajaran`));
  if (d.ctx !== null) l2.push(d.ctx >= 80 ? c('bad', `konteks ${d.ctx}%`) : c('dim', `konteks ${d.ctx}%`));
  const fit = (parts, sep) => { let out = ''; for (const p of parts) { const next = out ? out + sep + p : p; if (width(next) > max) break; out = next; } return out; };
  const lines = [fit(l1, '  ')];
  if (l2.length) lines.push(`${c('root', '▌')}${fit(l2, c('dim', ' · '))}`);
  return lines.join('\n');
}

async function main() {
  let payload = {};
  try { const chunks = []; for await (const ch of process.stdin) chunks.push(ch); payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* stdin kosong / bukan JSON */ }
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || (payload.workspace && payload.workspace.project_dir) || payload.cwd || process.cwd());
  try {
    const cfg = loadConfig(root);
    if (cfg.tui.statusline === false) return;
    saveSessionName(root, payload.session_name);
    const theme = process.env.NO_COLOR ? 'mono' : cfg.tui.theme;
    process.stdout.write(`${render(statusData(root, cfg, payload), { theme, max: cfg.tui.max_width })}\n`);
  } catch { process.stdout.write(`▌${path.basename(root)}\n`); }
}
if (isMain(import.meta.url)) main();
