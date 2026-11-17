// 1.17.0: persona = spesialis per bidang (D29, D29b a). Bidang diketahui sejak diskusi (ucapan user atau service), spesialis
// baru dipanggil saat eksekusi. Urutan menang: frontmatter item `bidang:` → ucapan sesi ini → bidang.map di config → tebakan
// dari nama service. Tidak ada mode yang berganti; tahap tetap dibaca dari status item.
import fs from 'node:fs';
import path from 'node:path';
import { asList, readJson } from './lib.mjs';

export const BIDANG = ['backend', 'frontend', 'devops', 'dba'];
const GUESS = [
  ['frontend', /(^|[-_])(fe|frontend|front|web|ui|admin|dashboard-fe|cms-fe|portal|app-web|nuxt|next|react|vue)([-_]|$)/i],
  ['devops', /(^|[-_])(infra|devops|deploy|ops|ci|k8s|helm|terraform|gitops)([-_]|$)/i],
  ['dba', /(^|[-_])(migration|migrations|db|database|schema)([-_]|$)/i],
  ['backend', /(^|[-_])(be|backend|api|service|svc|server|go|laravel|microservice|microservices|worker|core)([-_]|$)/i],
];
export function guessBidang(svc) { for (const [b, re] of GUESS) if (re.test(svc)) return b; return null; }
export function bidangOfService(cfg, svc) {
  const m = (cfg.bidang && cfg.bidang.map) || {};
  if (BIDANG.includes(m[svc])) return { bidang: m[svc], sumber: 'config' };
  const g = guessBidang(svc);
  return g ? { bidang: g, sumber: 'tebakan' } : null;
}

// "backend: …", "frontend - …", "minta DBA …", "ini frontend", "bidang devops"
export function bidangFromPrompt(text) {
  const t = String(text || '').trim();
  let m = /^(backend|frontend|devops|dba|be|fe)\s*[:\-–]\s*\S/i.exec(t);
  if (m) return norm(m[1]);
  m = /^(?:ini|bidang(?:nya)?|pakai|minta|panggil)\s+(backend|frontend|devops|dba|be|fe)\b/i.exec(t);
  return m ? norm(m[1]) : null;
}
const norm = (b) => ({ be: 'backend', fe: 'frontend' }[b.toLowerCase()] || b.toLowerCase());

const sessPath = (root, sid) => path.join(root, '.harness', 'state', `bidang-${String(sid || 'x').replace(/\W/g, '')}.json`);
export function setSessionBidang(root, sid, b) { try { fs.mkdirSync(path.dirname(sessPath(root, sid)), { recursive: true }); fs.writeFileSync(sessPath(root, sid), JSON.stringify({ bidang: b, at: new Date().toISOString() })); } catch { /* abaikan */ } }
export const sessionBidang = (root, sid) => (readJson(sessPath(root, sid), {}) || {}).bidang || null;

// Bidang item: frontmatter menang; selain itu dari service tercakup. Hasil: [{ svc, bidang, sumber }]
export function itemBidang(cfg, item, sessB = null) {
  const fmB = asList(item.fm && item.fm.bidang).map((x) => String(x).toLowerCase()).filter((x) => BIDANG.includes(x));
  const svcs = asList(item.fm && item.fm.services);
  if (!svcs.length) return (fmB.length ? fmB : sessB ? [sessB] : []).map((b) => ({ svc: null, bidang: b, sumber: fmB.length ? 'item' : 'ucapan' }));
  return svcs.map((svc) => {
    const s = bidangOfService(cfg, svc);
    if (fmB.length === 1) return { svc, bidang: fmB[0], sumber: 'item' };
    if (fmB.length > 1 && s && fmB.includes(s.bidang)) return { svc, ...s, sumber: 'item' };
    if (sessB && !s) return { svc, bidang: sessB, sumber: 'ucapan' };
    return { svc, bidang: s ? s.bidang : null, sumber: s ? s.sumber : null };
  });
}
export const bidangLabel = (rows) => [...new Set(rows.map((r) => r.bidang).filter(Boolean))].join(' + ');

// Instruksi eksekusi: satu spesialis per pasangan service–bidang; dba lebih dulu bila item bertipe schema.
export function execPlan(cfg, item) {
  const rows = itemBidang(cfg, item);
  const fb = (cfg.bidang && cfg.bidang.fallback_agent) || 'implementer';
  const list = rows.map((r) => ({ svc: r.svc, agent: r.bidang || fb, bidang: r.bidang }));
  if (item.type === 'schema' && !list.some((x) => x.agent === 'dba')) list.unshift({ svc: list[0] && list[0].svc, agent: 'dba', bidang: 'dba' });
  return list.sort((a, b) => (a.agent === 'dba' ? -1 : b.agent === 'dba' ? 1 : 0));
}
// 1.18.0 (D5): playbook berlabel bidang (frontmatter `bidang:`) disebut per spesialis; playbook tanpa label = umum.
export function playbooksFor(root, b) {
  const d = path.join(root, 'docs', 'memory', 'playbooks');
  let names = []; try { names = fs.readdirSync(d).filter((f) => f.endsWith('.md') && !f.startsWith('_')); } catch { return []; }
  return names.filter((f) => { try { const m = /^bidang:\s*\[?\s*([\w, -]+?)\s*\]?\s*$/m.exec(fs.readFileSync(path.join(d, f), 'utf8').split(/\n---/)[0]); return m && m[1].split(/\s*,\s*/).includes(b); } catch { return false; } }).map((f) => f.replace(/\.md$/, ''));
}
export function execText(cfg, item, root = null) {
  const l = execPlan(cfg, item);
  if (!l.length) return '';
  const pb = (b) => { if (!root || !b) return ''; const p = playbooksFor(root, b); return p.length ? ` (playbook ${b}: ${p.slice(0, 5).join(', ')})` : ''; };
  return `Eksekusi oleh spesialis (panggil tool Agent, satu per baris, berurutan): ${l.map((x) => `agent \`${x.agent}\`${x.svc ? ` untuk ${x.svc}` : ''}${pb(x.bidang)}`).join('; ')}. Sesi utama tidak mengedit kode service itu sendiri; ia merangkum hasil dan menulis bukti.`;
}
