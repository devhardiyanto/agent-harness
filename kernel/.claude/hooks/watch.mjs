// TUI papan kerja (Node murni, tanpa dependency): lima kolom dari work item lokal + event terakhir. Segar otomatis; q keluar, r muat ulang.
// Pemetaan state: draft=Backlog, approved=Todo, in-progress=In Progress, in-review=Review, done/merged=Done (sama dengan rencana papan Plane).
import fs from 'node:fs';
import path from 'node:path';
import { listItems, summarizeItem, readEvidence, isQuick, readEvents, eventsPath } from './lib.mjs';

export const COLUMNS = [
  ['Backlog', ['draft']], ['Todo', ['approved']], ['In Progress', ['in-progress']], ['Review', ['in-review']], ['Done', ['done', 'merged']],
];
const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (s, w) => { const t = strip(s); return t.length >= w ? t.slice(0, w) : s + ' '.repeat(w - t.length); };
const trunc = (s, w) => (s.length > w ? s.slice(0, Math.max(0, w - 1)) + '…' : s);

export function boardData(root) {
  const items = listItems(root).map((i) => ({ item: i, sum: summarizeItem(i), ev: readEvidence(root, i.slug) }));
  return COLUMNS.map(([name, sts]) => ({ name, cards: items.filter((x) => sts.includes(x.item.status)).sort((a, b) => b.item.slug.localeCompare(a.item.slug)) }));
}

export function renderFrame(root, { width = 110, color = false, maxDone = 5, eventsN = 5 } = {}) {
  const c = (code, t) => (color ? `\x1b[${code}m${t}\x1b[0m` : t);
  const cols = boardData(root);
  const w = Math.max(14, Math.floor((width - (cols.length - 1) * 2) / cols.length));
  const cardLines = (x) => {
    const ac = x.sum.ac; const ok = ac.filter((a) => a.evidence === 'ok').length;
    return [
      c(1, trunc(x.item.slug.replace(/^\d{4}-\d{2}-\d{2}-/, ''), w)),
      `${isQuick(x.item) ? c(32, 'quick') : c(34, 'std')} ${ac.length ? `AC ${ok}/${ac.length}` : ''}${x.ev ? ` · test ${x.ev.verdict}` : ''}`.trim(),
    ];
  };
  const rows = [];
  const head = cols.map((k) => pad(c(1, `${k.name} (${k.cards.length})`), w)).join('  ');
  rows.push(head, cols.map(() => '─'.repeat(w)).join('  '));
  const lists = cols.map((k) => (k.name === 'Done' ? k.cards.slice(0, maxDone) : k.cards).flatMap((x) => [...cardLines(x), '']));
  const h = Math.max(...lists.map((l) => l.length), 1);
  for (let i = 0; i < h; i++) rows.push(lists.map((l) => pad(l[i] || '', w)).join('  ').trimEnd());
  const ev = readEvents(root, eventsN);
  rows.push('', c(2, `Event terakhir (${eventsPath(root).replace(root, '.')})`));
  if (!ev.length) rows.push(c(2, '(belum ada)'));
  for (const e of ev) rows.push(trunc(`${String(e.ts || '').slice(11, 19)} ${e.event || '-'}${e.slug ? ' ' + e.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '') : ''}${e.from || e.to ? ` ${e.from || ''}→${e.to || ''}` : ''}${e.by ? ' oleh ' + e.by : ''}`, width));
  return rows.join('\n');
}

export function runWatch(root, { intervalMs = 2000 } = {}) {
  const out = process.stdout;
  const draw = () => out.write(`\x1b[H\x1b[2J${renderFrame(root, { width: Math.min(out.columns || 110, 160), color: true })}\n\n\x1b[2mq keluar · r muat ulang · otomatis tiap ${intervalMs / 1000} dtk\x1b[0m\n`);
  out.write('\x1b[?1049h\x1b[?25l');
  const done = () => { out.write('\x1b[?25h\x1b[?1049l'); process.exit(0); };
  draw();
  const t = setInterval(draw, intervalMs);
  try { fs.watch(path.join(root, 'docs', 'work'), { recursive: true }, () => draw()); } catch { /* polling cukup */ }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    process.stdin.on('data', (k) => { if (k === 'q' || k === '\u0003') { clearInterval(t); done(); } else if (k === 'r') draw(); });
  }
  process.on('SIGINT', done);
}
