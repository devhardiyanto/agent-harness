// Ringkasan lokal saat Done/Merged: dirangkum dari file work item (tanpa model, deterministik) ke docs/work/<slug>/summary.md.
// Isi: objective, hasil per AC, keputusan (decision log + debat align), review, gate/bukti test, PR, parking lot.
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, summarizeItem, readEvidence, readAlign, readGate, asList, isQuick, audit } from './lib.mjs';

export const section = (text, re) => {
  const L = text.split(/\r?\n/); const i = L.findIndex((l) => re.test(l));
  if (i < 0) return [];
  const out = [];
  for (const l of L.slice(i + 1)) { if (/^##\s/.test(l)) break; out.push(l); }
  return out;
};
// butir bermakna: tanpa komentar HTML, tanpa baris placeholder kosong ("-")
export const bullets = (lines) => lines.map((l) => l.replace(/<!--.*?-->/g, '').trim()).filter((l) => l && !/^[-*]$/.test(l) && !/^<!--/.test(l));
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

export function buildSummary(root, cfg, item) {
  const s = summarizeItem(item);
  const brief = splitFrontmatter(read(path.join(item.dir, 'brief.md'))).body;
  const objective = bullets(section(brief, /^##\s+Objective/i)).filter((l) => !/^<.*>$/.test(l)).join(' ') || '(brief.md tidak memuat objective)';
  const progress = read(path.join(item.dir, 'progress.md'));
  const decisions = bullets(section(progress, /^##\s+Decision log/i));
  const align = readAlign(item);
  const debate = align ? bullets(section(align.body, /^##\s+Debat/i)) : [];
  const parking = align ? bullets(section(align.body, /^##\s+Parking lot/i)) : [];
  const prs = asList(item.fm.pr).filter((x) => x && x !== 'null');
  const gate = readGate(item); const ev = readEvidence(root, item.slug);
  const acText = Object.fromEntries((item.body.match(/^\s*[-*]\s*\**AC\d+\**\s*[:.–-]\s*.+$/gm) || []).map((l) => { const m = /(AC\d+)\**\s*[:.–-]\s*(.+)$/.exec(l); return [m[1], m[2].trim()]; }));
  const L = [
    '---', `slug: ${item.slug}`, `status: ${item.status}`, `lane: ${isQuick(item) ? 'quick' : 'standard'}`, `generated: ${new Date().toISOString()}`, '---',
    `# Ringkasan — ${item.fm.title || item.slug}`, '',
    '## Objective', objective, '',
    '## Hasil per AC', '| AC | kriteria | bukti |', '|---|---|---|', ...(s.ac.length ? s.ac.map((a) => `| ${a.id} | ${(acText[a.id] || '').replace(/\|/g, '/')} | ${a.evidence === 'ok' ? 'ada' : 'BELUM'} |`) : ['| - | - | - |']), '',
    '## Keputusan', ...(decisions.length || debate.length ? [...decisions, ...debate.map((d) => `- (align) ${d.replace(/^[-*]\s*/, '')}`)].map((d) => (d.startsWith('-') ? d : `- ${d}`)) : ['- (tidak ada yang dicatat)']), '',
    '## Review', s.review ? `verdict: ${s.review.verdict} · blocker: ${s.review.blockers_done} selesai, ${s.review.blockers_open} terbuka` : (isQuick(item) ? 'lajur quick: tanpa review' : 'belum ada review'), '',
    '## Gate dan bukti test', `gate: ${gate ? gate.fm.verdict : 'belum dijalankan'}${gate && gate.fm.unchecked ? ` (${gate.fm.unchecked} TIDAK DIPERIKSA)` : ''} · bukti test: ${ev ? `${ev.verdict} (${(ev.generated || '').slice(0, 10)})` : 'tidak ada'}`, '',
    '## PR', ...(prs.length ? prs.map((u) => `- ${u}`) : ['- (belum ada)']), '',
    '## Parking lot', ...(parking.length ? parking : ['- (kosong)']), '',
  ];
  return L.join('\n');
}

export function writeSummary(root, cfg, item) {
  const p = path.join(item.dir, 'summary.md');
  fs.writeFileSync(p, buildSummary(root, cfg, item));
  audit(root, { event: 'summary', slug: item.slug, to: item.status });
  return p;
}
