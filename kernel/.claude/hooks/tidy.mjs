// 1.15.2: merapikan work item. Tiga bagian, semuanya dihitung kode:
//   checkStructure  item yang tidak sesuai struktur versi sekarang (berkas wajib, frontmatter, status, slug dari kalimat prompt)
//   staleItems      item usang (D36): belum dikerjakan / done tanpa PR selama >= stale_days, atau merged >= merged_days
//   mergeGroups     item terbuka yang disentuh satu sesi digabung jadi satu (D37 b); item utama = yang paling jauh statusnya
// Rencana (dry-run) bisa dijalankan siapa pun; --apply hanya manusia (guard-bash). Arsip = dipindah ke docs/work/_archive,
// tidak dihapus, dan dicatat satu baris di docs/memory/ARCHIVE.md agar tetap bisa dicari (recall, ref:). Plane tidak disentuh (D38).
import fs from 'node:fs';
import path from 'node:path';
import { listItems, readItem, workDir, splitFrontmatter, setFmKey, asList, parseAcs, STATUSES, isQuick, readJson, audit } from './lib.mjs';

export const archiveDir = (root) => path.join(workDir(root), '_archive');
export const archiveIndex = (root) => path.join(root, 'docs', 'memory', 'ARCHIVE.md');
const REQUIRED = ['brief.md', 'plan.md', 'progress.md'];
const PROMPTISH = /^(?:\d{4}-\d{2}-\d{2}-)?(?:kerjakan|tolong|disini|oke|aku|saya|coba|ini|update|bikin|buatkan|please)-/;
const RANK = { 'in-progress': 5, 'in-review': 4, done: 3, approved: 2, draft: 1, merged: 0 };
const day = (s) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || '')); return m ? Date.parse(`${m[1]}T00:00:00Z`) : NaN; };

export function ageDays(it, now = Date.now()) {
  const t = [it.fm.updated, it.fm.created, it.slug].map(day).find((x) => !Number.isNaN(x));
  return t === undefined ? 0 : Math.floor((now - t) / 86400000);
}
const objectiveOf = (it) => {
  try { const t = fs.readFileSync(path.join(it.dir, 'brief.md'), 'utf8'); const m = /##\s*Objective\s*\n+([^\n#][^\n]*)/i.exec(t); if (m) return m[1].trim(); } catch { /* abaikan */ }
  return String(it.fm.title || it.slug);
};

// ref:<slug> untuk item arsip (slug penuh atau potongan unik). Perintah lain sengaja tidak melihat arsip.
export function resolveArchived(root, q) {
  let names = []; try { names = fs.readdirSync(archiveDir(root)); } catch { return null; }
  if (names.includes(q)) return q;
  const hits = names.filter((n) => n.includes(q));
  return hits.length === 1 ? hits[0] : null;
}

export function checkStructure(root, cfg) {
  const rows = [];
  const svcs = new Set(cfg.services || []);
  for (const it of listItems(root)) {
    const p = [];
    for (const f of REQUIRED) if (!fs.existsSync(path.join(it.dir, f))) p.push(`${f} tidak ada`);
    if (!STATUSES.includes(it.status)) p.push(`status "${it.status}" tidak dikenal`);
    for (const k of ['title', 'type', 'created']) if (!it.fm[k]) p.push(`frontmatter ${k} kosong`);
    if (!asList(it.fm.services).length && it.type !== 'analysis') p.push('services kosong');
    for (const s of asList(it.fm.services)) if (svcs.size && !svcs.has(s)) p.push(`service "${s}" tidak ada di config`);
    if (!/^\d{4}-\d{2}-\d{2}-/.test(it.slug)) p.push('slug tanpa tanggal');
    if (PROMPTISH.test(it.slug)) p.push('slug dari kalimat prompt');
    if (p.length) rows.push({ slug: it.slug, status: it.status, problems: p });
  }
  return rows;
}

export function staleItems(root, cfg, now = Date.now()) {
  const t = cfg.tidy;
  const out = [];
  for (const it of listItems(root)) {
    const age = ageDays(it, now);
    const pr = asList(it.fm.pr).length > 0;
    let why = null;
    if (['draft', 'approved'].includes(it.status) && age >= t.stale_days) why = `${it.status}${isQuick(it) ? ' (quick)' : ''} tidak disentuh ${age} hari`;
    else if (it.status === 'done' && !pr && age >= t.stale_days) why = `done tanpa PR ${age} hari`;
    else if (it.status === 'merged' && age >= t.merged_days) why = `merged ${age} hari lalu`;
    if (why) out.push({ slug: it.slug, status: it.status, age, why });
  }
  return out;
}

// Grup dari berkas touched-<sesi>.json; grup yang beririsan disatukan. Item usang tidak ikut (diarsipkan saja).
export function mergeGroups(root, cfg, now = Date.now()) {
  const stale = new Set(staleItems(root, cfg, now).map((x) => x.slug));
  const open = new Map(listItems(root).filter((it) => it.status !== 'merged' && !stale.has(it.slug)).map((it) => [it.slug, it]));
  const dir = path.join(root, '.harness', 'state');
  const sets = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /^touched-.+\.json$/.test(x))) {
      const s = [...new Set((readJson(path.join(dir, f), { slugs: [] }).slugs || []).filter((x) => open.has(x)))];
      if (s.length >= 2) sets.push(new Set(s));
    }
  } catch { /* belum ada state */ }
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    if ([...sets[j]].some((x) => sets[i].has(x))) { for (const x of sets[j]) sets[i].add(x); sets.splice(j, 1); j = i; }
  }
  return sets.map((s) => {
    const items = [...s].map((x) => open.get(x)).sort((a, b) => (RANK[b.status] - RANK[a.status]) || a.slug.localeCompare(b.slug));
    return { target: items[0].slug, others: items.slice(1).map((x) => x.slug) };
  });
}

function logArchive(root, it, reason) {
  const f = archiveIndex(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, '# Arsip work item\n\nItem yang diarsipkan `harness.mjs tidy --apply`. Berkasnya utuh di `docs/work/_archive/<slug>/`; `ref:<slug>` dan `recall` tetap menemukannya.\n\n');
  const line = `- ${new Date().toISOString().slice(0, 10)} · ${it.slug} · ${it.status} · ${reason} · ${objectiveOf(it).replace(/\s+/g, ' ').slice(0, 140)}\n`;
  fs.appendFileSync(f, line);
}

export function archiveItem(root, slug, reason) {
  const it = readItem(root, slug); if (!it) return false;
  let text = setFmKey(it.text, 'archived', new Date().toISOString().slice(0, 10));
  text = setFmKey(text, 'archived_reason', JSON.stringify(reason));
  fs.writeFileSync(it.planPath, text);
  fs.mkdirSync(archiveDir(root), { recursive: true });
  let dest = path.join(archiveDir(root), slug); let n = 2;
  while (fs.existsSync(dest)) dest = path.join(archiveDir(root), `${slug}-${n++}`);
  fs.renameSync(it.dir, dest);
  logArchive(root, it, reason);
  return true;
}

// AC item lain dilanjutkan nomornya di plan.md item utama; bukti di progress.md ikut dengan nomor baru.
export function mergeInto(root, targetSlug, otherSlugs) {
  const t = readItem(root, targetSlug); if (!t) return { ok: false, reason: `${targetSlug} tidak ditemukan` };
  let next = parseAcs(t.body).reduce((m, a) => Math.max(m, Number(a.id.slice(2))), 0) + 1;
  let plan = t.text.replace(/\s*$/, '\n');
  let prog = ''; try { prog = fs.readFileSync(path.join(t.dir, 'progress.md'), 'utf8').replace(/\s*$/, '\n'); } catch { prog = '# Progress\n\n## Verifikasi\n'; }
  const services = new Set(asList(t.fm.services));
  const merged = [];
  for (const sl of otherSlugs) {
    const o = readItem(root, sl); if (!o) continue;
    const map = {};
    const acs = parseAcs(o.body).map((a) => { map[a.id] = `AC${next}`; return `- AC${next++}: ${a.text}`; });
    plan += `\n## Digabung dari ${sl} (${o.status})\n${objectiveOf(o)}\n\n${acs.join('\n') || '(tanpa AC)'}\n`;
    let ev = ''; try { ev = fs.readFileSync(path.join(o.dir, 'progress.md'), 'utf8'); } catch { /* tidak ada */ }
    const evl = ev.split(/\r?\n/).map((l) => { const m = /^\s*[-*]\s*\**(AC\d+)\**\s*[:.–-]\s*(.+)$/.exec(l); return m && map[m[1]] ? `- ${map[m[1]]}: ${m[2].trim()}` : null; }).filter(Boolean);
    if (evl.length) prog += `\n## Bukti dari ${sl}\n${evl.join('\n')}\n`;
    for (const s of asList(o.fm.services)) services.add(s);
    archiveItem(root, sl, `digabung ke ${targetSlug}`);
    merged.push(sl);
  }
  plan = setFmKey(plan, 'services', JSON.stringify([...services]));
  plan = setFmKey(plan, 'updated', new Date().toISOString().slice(0, 10));
  fs.writeFileSync(t.planPath, plan);
  fs.writeFileSync(path.join(t.dir, 'progress.md'), prog);
  return { ok: true, merged };
}

export function planTidy(root, cfg, now = Date.now()) {
  return { structure: checkStructure(root, cfg), stale: staleItems(root, cfg, now), merge: mergeGroups(root, cfg, now) };
}

export function applyTidy(root, cfg, plan, who = 'manusia') {
  let archived = 0; let mergedN = 0;
  for (const s of plan.stale) if (archiveItem(root, s.slug, s.why)) archived++;
  for (const g of plan.merge) { const r = mergeInto(root, g.target, g.others); if (r.ok) mergedN += r.merged.length; }
  audit(root, { event: 'tidy', archived, merged: mergedN, by: who });
  return { archived: archived + mergedN, merged: mergedN };
}

export function formatTidy(p, applied = null) {
  const cell = (s) => String(s).replace(/\|/g, '/');
  const out = [];
  out.push(`Struktur (${p.structure.length} item tidak sesuai):`);
  out.push(p.structure.length ? ['| item | status | masalah |', '|---|---|---|', ...p.structure.map((r) => `| ${r.slug} | ${r.status} | ${cell(r.problems.join('; '))} |`)].join('\n') : '(semua sesuai)');
  out.push('', `Usang → diarsipkan (${p.stale.length}):`);
  out.push(p.stale.length ? ['| item | status | alasan |', '|---|---|---|', ...p.stale.map((r) => `| ${r.slug} | ${r.status} | ${cell(r.why)} |`)].join('\n') : '(tidak ada)');
  out.push('', `Digabung (${p.merge.length} grup, dari item yang disentuh satu sesi):`);
  out.push(p.merge.length ? ['| item utama | digabung ke dalamnya |', '|---|---|', ...p.merge.map((g) => `| ${g.target} | ${g.others.join(', ')} |`)].join('\n') : '(tidak ada)');
  out.push('');
  if (applied) out.push(`Selesai: ${applied.archived} item diarsipkan (termasuk yang digabung), ${applied.merged} item digabung. Arsip: docs/work/_archive/, daftar: docs/memory/ARCHIVE.md.`);
  else if (p.stale.length || p.merge.length) out.push('Rencana saja. Terapkan: ! node .claude/hooks/harness.mjs tidy --apply (hanya manusia). Masalah struktur tidak diubah otomatis.');
  return out.join('\n');
}
