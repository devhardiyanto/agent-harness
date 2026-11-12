// Tabel "belum selesai" (1.10.0): satu tempat untuk semua yang masih menggantung, supaya tidak lupa dan tidak perlu
// membaca narasi panjang. Sumber: status item (nextStep), "Open questions" di brief.md, klaim dugaan/bertentangan di align.md
// yang belum aligned, AC tanpa bukti, blocker review terbuka, usulan memori yang menunggu. Deterministik, nol token.
import fs from 'node:fs';
import path from 'node:path';
import { listItems, nextStep, summarizeItem, splitFrontmatter, isQuick, decisionRows, shortSlug } from './lib.mjs';
import { section, bullets } from './summary.mjs';
import { pending } from './memory.mjs';

const cell = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, 110);
const PH = /^(-|\.{3}|<.*>|todo|tbd|n\/a|tidak ada|belum ada|kosong)$/i;

export function openRows(root, cfg, { slugs = null } = {}) {
  const rows = [];
  for (const it of listItems(root)) {
    if (it.status === 'merged') continue;
    if (slugs && !slugs.has(it.slug)) continue;
    const label = shortSlug(root, it.slug);
    const n = nextStep(it, cfg);
    rows.push({ item: it.slug, label, jenis: 'langkah', apa: `${it.status}${isQuick(it) ? ' (quick)' : ''}`, siapa: n.who, aksi: n.cmd });
    const bp = path.join(it.dir, 'brief.md');
    if (fs.existsSync(bp) && ['draft'].includes(it.status)) {
      const qs = bullets(section(splitFrontmatter(fs.readFileSync(bp, 'utf8')).body, /^##\s+Open questions/i)).map((q) => q.replace(/^[-*]\s*/, '')).filter((q) => q && !PH.test(q));
      for (const q of qs.slice(0, 3)) rows.push({ item: it.slug, label, jenis: 'pertanyaan', apa: q, siapa: 'kamu', aksi: 'jawab di chat; agent mencatat di brief.md' });
    }
    // 1.12.0: sumber yang sama dengan tabel keputusan (klaim bertentangan/dugaan + keputusan D terbuka)
    for (const d of decisionRows(it).slice(0, 6)) rows.push({ item: it.slug, label, jenis: d.kind === 'keputusan' ? 'keputusan' : `klaim ${d.kind}`, apa: `${d.id}: ${d.ask}`, siapa: 'kamu', aksi: d.answer });
    if (['in-progress', 'in-review'].includes(it.status)) {
      const s = summarizeItem(it);
      const miss = s.ac.filter((x) => x.evidence !== 'ok').map((x) => x.id);
      if (miss.length) rows.push({ item: it.slug, label, jenis: 'AC tanpa bukti', apa: miss.join(', '), siapa: 'agent', aksi: 'isi bukti di progress.md' });
      if (s.review && s.review.blockers_open) rows.push({ item: it.slug, label, jenis: 'blocker review', apa: `${s.review.blockers_open} terbuka`, siapa: 'agent', aksi: 'perbaiki, centang di review.md' });
    }
  }
  if (cfg.memory.enabled) {
    const p = pending(root);
    if (p.length) rows.push({ item: '-', jenis: 'usulan memori', apa: p.slice(0, 3).map((x) => `${x.id}: ${x.text}`).join(' ; '), siapa: 'kamu', aksi: `"ingat ${p[0].id}" / "ingat semua"` });
  }
  return rows;
}

export function formatOpen(rows, max = 12, title = 'Belum selesai') {
  if (!rows.length) return `${title}: (kosong) — tidak ada yang menggantung.`;
  const shown = rows.slice(0, max);
  return [`${title} (${rows.length}):`, '| # | item | jenis | apa | siapa | aksi |', '|---|---|---|---|---|---|',
    ...shown.map((r, i) => `| ${i + 1} | ${cell(r.label || r.item)} | ${cell(r.jenis)} | ${cell(r.apa)} | ${cell(r.siapa)} | ${cell(r.aksi)} |`),
    ...(rows.length > max ? [`(+${rows.length - max} lagi: node .claude/hooks/harness.mjs open)`] : [])].join('\n');
}
