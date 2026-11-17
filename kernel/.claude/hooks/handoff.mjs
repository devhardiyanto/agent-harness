// PreCompact / SessionEnd: tulis .harness/handoff.md (keadaan kerja terkini). SessionStart (session.mjs) menyuntiknya ke sesi berikutnya.
// Tidak pernah memblokir. Tanpa model: murni dari file work item.
import fs from 'node:fs';
import path from 'node:path';
import { readPart, readStdinJson, projectRoot, loadConfig, listItems, summarizeItem, readEvidence, nextStep, isQuick, audit, isMain } from './lib.mjs';

export const handoffPath = (root) => path.join(root, '.harness', 'handoff.md');

function statusTerkini(item, maxLines = 18) {
  const raw = readPart(item, 'progress.md');
  if (raw === null) return [];
  const t = raw.split(/\r?\n/);
  const i = t.findIndex((l) => /^##\s+Status terkini/i.test(l));
  if (i < 0) return [];
  const out = [];
  for (const l of t.slice(i + 1)) { if (/^##\s/.test(l)) break; if (l.trim()) out.push(l); if (out.length >= maxLines) break; }
  return out;
}

export function buildHandoff(root, cfg, payload = {}) {
  const items = listItems(root).filter((i) => i.status !== 'merged');
  const L = [`# Handoff otomatis`, `ditulis: ${new Date().toISOString()} · event: ${payload.hook_event_name || '-'}${payload.trigger ? ` (${payload.trigger})` : ''}${payload.reason ? ` (${payload.reason})` : ''} · sesi: ${String(payload.session_id || '-').slice(0, 8)}`];
  if (!items.length) { L.push('', 'Tidak ada work item terbuka.'); return L.join('\n') + '\n'; }
  L.push('', '## Work item terbuka', '| slug | lajur | status | AC berbukti | bukti test | siapa | berikutnya |', '|---|---|---|---|---|---|---|');
  for (const i of items) {
    const s = summarizeItem(i); const ev = readEvidence(root, i.slug); const n = nextStep(i, cfg);
    L.push(`| ${i.slug} | ${isQuick(i) ? 'quick' : 'standard'} | ${i.status} | ${s.ac.filter((a) => a.evidence === 'ok').length}/${s.ac.length} | ${ev ? ev.verdict : '-'} | ${n.who} | ${n.cmd} |`);
  }
  for (const i of items.filter((x) => x.status === 'in-progress' || x.status === 'in-review')) {
    const st = statusTerkini(i);
    if (st.length) L.push('', `## ${i.slug} — status terkini (progress.md)`, ...st);
  }
  L.push('', 'Lanjutkan dari tabel di atas; sumber kebenaran tetap docs/work/<slug>/.');
  return L.join('\n') + '\n';
}

export function writeHandoff(root, cfg, payload) {
  const p = handoffPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buildHandoff(root, cfg, payload).slice(0, 20000));
  return p;
}

// Untuk SessionStart: isi handoff yang dipotong, dengan usia.
export function readHandoff(root, cfg) {
  const p = handoffPath(root);
  if (!fs.existsSync(p)) return null;
  const ageMin = Math.max(0, Math.round((Date.now() - fs.statSync(p).mtimeMs) / 60000));
  const body = fs.readFileSync(p, 'utf8').trim();
  const max = cfg.handoff.max_chars || 6000;
  return `[harness] Handoff sesi sebelumnya (${ageMin} menit lalu):\n${body.length > max ? body.slice(0, max) + '\n… (dipotong; lihat .harness/handoff.md)' : body}`;
}

if (isMain(import.meta.url)) {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  try { writeHandoff(root, loadConfig(root), payload); audit(root, { event: payload.hook_event_name, session: payload.session_id, handoff: true }); } catch { /* handoff tidak boleh menjatuhkan sesi */ }
  process.exit(0);
}
