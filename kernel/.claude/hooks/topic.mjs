// 1.21.0: topik = wadah diskusi, analisa, audit, dan pertanyaan SEBELUM ada keputusan membuat work item.
// Berkas: docs/topics/<tanggal-slug>.md (status open | promoted | closed). Satu sesi = satu topik atau satu item aktif.
// Topik menjadi item hanya bila user mengetik "jadikan item" (tiket sekali pakai, sama dengan "item baru"): harness.mjs topic promote.
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, setFmKey, readJson, slugify } from './lib.mjs';

export const topicsDir = (root) => path.join(root, 'docs', 'topics');
const today = () => new Date().toISOString().slice(0, 10);
const statePath = (root, sid) => path.join(root, '.harness', 'state', `topics-${String(sid || 'x').replace(/\W/g, '')}.json`);

export function readTopic(root, slug) {
  const p = path.join(topicsDir(root), `${slug}.md`);
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const { fm, body } = splitFrontmatter(text);
  return { slug, path: p, text, fm, body, status: fm.status || 'open', title: fm.title || slug, item: fm.item && fm.item !== 'null' ? fm.item : null };
}
export function listTopics(root) {
  try { return fs.readdirSync(topicsDir(root)).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => readTopic(root, f.slice(0, -3))).filter(Boolean); } catch { return []; }
}
export function resolveTopic(root, q) {
  if (!q) return null;
  const all = listTopics(root);
  const exact = all.find((t) => t.slug === q);
  if (exact) return exact;
  const hit = all.filter((t) => t.slug.includes(q));
  return hit.length === 1 ? hit[0] : null;
}

export const TEMPLATE = (title, slug) => `---
title: ${title}
status: open
created: ${today()}
updated: ${today()}
item: null
---
# ${title}

## Pertanyaan
<!-- apa yang sedang dibahas/dianalisa/diaudit, satu sampai tiga kalimat. -->

## Temuan
| # | temuan | bukti (path:baris / sumber) | jenis |
|---|---|---|---|
<!-- jenis: fakta | dugaan | rekomendasi -->

## Keputusan
<!-- hanya versi terakhir yang disepakati; yang dibatalkan tidak dicatat. -->

## Lanjutan
<!-- langkah berikutnya. Perlu perubahan kode → user mengetik "jadikan item ${slug}". -->
`;

export function createTopic(root, title) {
  const slug = `${today()}-${slugify(title)}`;
  const p = path.join(topicsDir(root), `${slug}.md`);
  if (fs.existsSync(p)) return { ok: false, reason: `sudah ada: docs/topics/${slug}.md`, slug };
  fs.mkdirSync(topicsDir(root), { recursive: true });
  fs.writeFileSync(p, TEMPLATE(title, slug));
  return { ok: true, slug, rel: `docs/topics/${slug}.md` };
}
export function setTopicStatus(root, slug, status, extra = {}) {
  const t = readTopic(root, slug);
  if (!t) return false;
  let x = setFmKey(t.text, 'status', status); x = setFmKey(x, 'updated', today());
  for (const [k, v] of Object.entries(extra)) x = setFmKey(x, k, v);
  fs.writeFileSync(t.path, x);
  return true;
}

// sesi → topik yang disentuh (urutan terjaga); aktif = terakhir yang masih open
export const touchedTopics = (root, sid) => readJson(statePath(root, sid), { slugs: [] }).slugs || [];
export function markTopic(root, sid, slug) {
  const have = touchedTopics(root, sid).filter((x) => x !== slug);
  fs.mkdirSync(path.dirname(statePath(root, sid)), { recursive: true });
  fs.writeFileSync(statePath(root, sid), JSON.stringify({ slugs: [...have, slug] }));
}
export function activeSessionTopic(root, sid) {
  for (const sl of [...touchedTopics(root, sid)].reverse()) { const t = readTopic(root, sl); if (t && t.status === 'open') return t; }
  return null;
}
