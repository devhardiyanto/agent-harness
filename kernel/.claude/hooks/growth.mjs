// 1.18.0: pengetahuan yang tumbuh (gaya Hermes, "makin tua makin pintar"), semuanya dihitung kode tanpa token model.
//   autoRecall    prompt baru → maks growth.recall_max rujukan (ringkasan item lama, playbook) yang skornya cukup
//   usage         tiap rujukan yang disuntikkan dihitung (.harness/state/usage.json); yang lama tak terpakai diusulkan dibuang
//   lessonsAsk    pelajaran dari item merged/done ditawarkan lewat pemilih (multiSelect); dipilih = disimpan, sisanya dibuang
//   growthReport  umur root, jumlah pelajaran/playbook (per bidang), item selesai/arsip, rujukan terpakai, kandidat dibuang
import fs from 'node:fs';
import path from 'node:path';
import { listItems, readJson, splitFrontmatter, touchedSlugs, readItem } from './lib.mjs';
import { recall, entries, pending } from './memory.mjs';
import { listPlaybooks } from './playbooks.mjs';

const usagePath = (root) => path.join(root, '.harness', 'state', 'usage.json');
const today = () => new Date().toISOString().slice(0, 10);
export const readUsage = (root) => readJson(usagePath(root), {}) || {};
export function bump(root, keys) {
  if (!keys.length) return;
  const u = readUsage(root);
  for (const k of keys) { const e = u[k] || { n: 0, first: today() }; e.n += 1; e.last = today(); u[k] = e; }
  try { fs.mkdirSync(path.dirname(usagePath(root)), { recursive: true }); fs.writeFileSync(usagePath(root), JSON.stringify(u, null, 2)); } catch { /* abaikan */ }
}

// berkas hasil recall → kunci rujukan yang bisa dipakai user/agent (ref:<slug>, playbook:<nama>, sesi:<nama>)
// Hanya pekerjaan yang sudah selesai: summary.md item, item arsip, playbook, sesi. brief/align item terbuka = pekerjaan
// sekarang (dan teks templat), bukan pelajaran.
function keyOf(file) {
  let m = /^docs\/work\/([^/]+)\/summary\.md$/.exec(file) || /^docs\/work\/_archive\/([^/]+)\//.exec(file); if (m) return { key: `ref:${m[1]}`, slug: m[1] };
  m = /^docs\/memory\/playbooks\/([^/]+)\.md$/.exec(file); if (m) return { key: `playbook:${m[1]}` };
  m = /^docs\/sessions\/([^/]+)\.md$/.exec(file); if (m) return { key: `sesi:${m[1]}` };
  return null;
}

export function autoRecall(root, cfg, prompt, sid) {
  const g = cfg.growth;
  if (!g.recall || String(prompt || '').trim().length < 15 || /^\s*\//.test(prompt)) return [];
  const mine = touchedSlugs(root, sid);
  const seen = new Set(); const out = [];
  for (const h of recall(root, prompt, 12)) {
    if (h.score < g.recall_min_score) continue;
    const k = keyOf(h.file); if (!k || seen.has(k.key) || (k.slug && mine.has(k.slug))) continue;
    seen.add(k.key);
    out.push({ key: k.key, line: h.line.replace(/^[#>\-*\s|]+/, '').replace(/\|/g, '/').slice(0, 120) });
    if (out.length >= g.recall_max) break;
  }
  bump(root, out.map((x) => x.key));
  return out;
}
export const recallText = (refs) => (refs.length ? `[harness] Rujukan dari pekerjaan lama (dicari kode; baca hanya bila relevan, muat dengan "ref:<slug>" atau baca berkas playbook):\n${refs.map((r) => `- ${r.key} — ${r.line}`).join('\n')}` : '');

// Umur root: tanggal paling awal di slug item (aktif + arsip).
export function rootAge(root) {
  let first = null;
  for (const d of [path.join(root, 'docs', 'work'), path.join(root, 'docs', 'work', '_archive')]) {
    try { for (const n of fs.readdirSync(d)) { const m = /^(\d{4}-\d{2}-\d{2})-/.exec(n); if (m && (!first || m[1] < first)) first = m[1]; } } catch { /* tidak ada */ }
  }
  return first ? Math.max(0, Math.floor((Date.now() - Date.parse(`${first}T00:00:00Z`)) / 86400000)) : null;
}

export function growthReport(root, cfg) {
  const u = readUsage(root);
  const pbs = listPlaybooks(root, cfg).filter((p) => p.ok);
  const byB = {};
  for (const p of pbs) { let b = 'umum'; try { b = String(splitFrontmatter(fs.readFileSync(p.file, 'utf8')).fm.bidang || 'umum'); } catch { /* abaikan */ } byB[b] = (byB[b] || 0) + 1; }
  const items = listItems(root);
  let archived = 0; try { archived = fs.readdirSync(path.join(root, 'docs', 'work', '_archive')).length; } catch { /* tidak ada */ }
  const since = Date.now() - 30 * 86400000;
  const used30 = Object.entries(u).filter(([, v]) => Date.parse(v.last) >= since);
  const old = Date.now() - cfg.growth.prune_days * 86400000;
  const stale = pbs.filter((p) => { const v = u[`playbook:${p.name}`]; return v ? Date.parse(v.last) < old : false; }).map((p) => `playbook:${p.name}`);
  return {
    age: rootAge(root), lessons: entries(root).length, pending: pending(root).length, playbooks: pbs.length, byBidang: byB,
    merged: items.filter((i) => i.status === 'merged').length, open: items.filter((i) => i.status !== 'merged').length, archived,
    used30: used30.length, top: used30.sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, v]) => `${k} (${v.n}×)`), stale,
  };
}
export function formatGrowth(r) {
  return ['| ukuran | nilai |', '|---|---|',
    `| umur root | ${r.age === null ? '-' : `${r.age} hari`} |`, `| pelajaran (MEMORY.md) | ${r.lessons} (+${r.pending} usulan menunggu) |`,
    `| playbook | ${r.playbooks}${Object.keys(r.byBidang).length ? ` (${Object.entries(r.byBidang).map(([b, n]) => `${b} ${n}`).join(', ')})` : ''} |`,
    `| item | ${r.open} terbuka, ${r.merged} merged, ${r.archived} diarsipkan |`,
    `| rujukan terpakai 30 hari | ${r.used30}${r.top.length ? `: ${r.top.join(', ')}` : ''} |`,
    `| kandidat dibuang (tak terpakai lama) | ${r.stale.length ? r.stale.join(', ') : '-'} |`].join('\n');
}

// Pelajaran yang menunggu dari item yang disentuh sesi ini → naskah pemilih (sekali per set usulan).
export const SKIP_LESSON = 'Jangan simpan';
export function lessonsAsk(root, cfg, sid) {
  if (!cfg.tui.ask) return null;
  const mine = touchedSlugs(root, sid);
  const list = pending(root).filter((p) => [...mine].some((s) => p.source.includes(s)));
  if (!list.length) return null;
  const mark = path.join(root, '.harness', 'state', `lessons-${String(sid || 'x').replace(/\W/g, '')}.json`);
  const key = list.map((p) => p.id).join(',');
  if ((readJson(mark, {}) || {}).key === key) return null;
  try { fs.mkdirSync(path.dirname(mark), { recursive: true }); fs.writeFileSync(mark, JSON.stringify({ key })); } catch { /* abaikan */ }
  const opts = list.slice(0, 4).map((p) => ({ label: p.text.length > 60 ? `${p.text.slice(0, 59)}…` : p.text, description: `${p.id} · ${p.source}` }));
  // 1.19.5: AskUserQuestion butuh minimal 2 opsi; satu pelajaran → tambah opsi "Jangan simpan" (tidak dipetakan ke id: dibuang)
  if (opts.length < 2) opts.push({ label: SKIP_LESSON, description: 'buang usulan pelajaran ini' });
  return { ids: list.slice(0, 4).map((p) => p.id), question: { header: 'Pelajaran', question: 'Simpan pelajaran dari pekerjaan ini?', options: opts, multiSelect: true } };
}
