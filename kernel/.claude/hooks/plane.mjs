// Sinkron status SATU ARAH: work item lokal (docs/work/<slug>/plan.md) → kartu Plane. Plane tidak pernah mengubah apa pun di lokal.
// Mati bawaan (plane.enabled = false). Token API HANYA dari variabel lingkungan (plane.token_env); tidak pernah dibaca dari berkas, ditulis, atau dicetak.
// Best-effort: kegagalan jaringan/API tidak pernah menggagalkan transisi status; `plane sync` mengulang yang tertinggal (rekonsiliasi: status lokal ≠ status terakhir terkirim).
// Pemanggilan: `harness.mjs plane sync|check`, dan proses latar (planeKick di lib.mjs) setelah status berubah.
import fs from 'node:fs';
import path from 'node:path';
import { STATUSES, listItems, setFmKey, emit, redact, readJson, splitFrontmatter, parseAcs, summarizeItem, readAlign, decisionRows, cleanTitle } from './lib.mjs';
import { section, bullets, objectiveOf } from './summary.mjs';

const enc = encodeURIComponent;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ledgerPath = (root) => path.join(root, '.harness', 'plane.json');
const lockPath = (root) => path.join(root, '.harness', 'plane.lock');

// Masalah konfigurasi statis (tanpa jaringan). Kosong = siap.
export function planeProblems(cfg, env = process.env) {
  const p = cfg.plane || {}; const out = [];
  if (!p.workspace) out.push('plane.workspace kosong (slug workspace dari URL Plane)');
  if (!p.project_id) out.push('plane.project_id kosong');
  if (!p.token_env) out.push('plane.token_env kosong (nama variabel lingkungan token)');
  else if (!env[p.token_env]) out.push(`variabel lingkungan ${p.token_env} belum diisi (harus ada sebelum Claude Code dijalankan)`);
  try {
    const u = new URL(p.base_url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) out.push('plane.base_url harus https:// (http:// hanya untuk localhost): token tidak boleh lewat jaringan tanpa enkripsi');
  } catch { out.push('plane.base_url bukan URL yang valid'); }
  for (const s of STATUSES) if (!p.states || !p.states[s]) out.push(`plane.states["${s}"] kosong`);
  return out;
}

async function api(cfg, method, route, body) {
  const p = cfg.plane;
  const url = `${p.base_url.replace(/\/+$/, '')}/api/v1/workspaces/${enc(p.workspace)}/projects/${enc(p.project_id)}${route}`;
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: { 'X-API-Key': process.env[p.token_env], 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error', // jangan ikuti redirect: header kunci tidak boleh ikut ke host lain
    });
  } catch (e) { return { ok: false, status: 0, error: redact(String(e && e.message || e)).slice(0, 160) }; }
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* bukan JSON */ }
  return { ok: r.ok, status: r.status, json, error: r.ok ? '' : redact(`HTTP ${r.status}${text ? ' ' + text.slice(0, 120) : ''}`) };
}

// Peta nama state (huruf kecil) → id, mengikuti paginasi kursor.
async function stateIds(cfg) {
  const map = new Map(); let cursor = '';
  for (let i = 0; i < 5; i++) {
    const r = await api(cfg, 'GET', `/states/${cursor ? `?cursor=${enc(cursor)}` : ''}`);
    if (!r.ok) return { ok: false, error: r.error };
    const list = Array.isArray(r.json) ? r.json : (r.json && r.json.results) || [];
    for (const s of list) map.set(String(s.name).toLowerCase(), s.id);
    if (!(r.json && r.json.next_page_results && r.json.next_cursor)) break;
    cursor = r.json.next_cursor;
  }
  return { ok: true, map };
}

const idOf = (cfg, ids, status) => ids.get(String(cfg.plane.states[status]).toLowerCase());
const readLedger = (root) => readJson(ledgerPath(root), {}) || {};
function writeLedger(root, l) { fs.mkdirSync(path.dirname(ledgerPath(root)), { recursive: true }); fs.writeFileSync(ledgerPath(root), JSON.stringify(l, null, 2) + '\n'); }

// Item yang perlu dikirim: belum punya kartu, atau status lokal ≠ status terakhir terkirim. Item merged tanpa kartu dilewati kecuali includeMerged.
export function pending(root, { slug = null, includeMerged = false } = {}) {
  const ledger = readLedger(root);
  return listItems(root)
    .filter((i) => !slug || i.slug === slug)
    .filter((i) => i.fm.plane_id || includeMerged || i.status !== 'merged')
    .map((i) => ({ item: i, action: i.fm.plane_id ? (ledger[i.slug] === i.status ? null : 'update') : 'create', from: ledger[i.slug] || null }))
    .filter((x) => x.action);
}

function acquire(root) {
  const f = lockPath(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try { if (Date.now() - fs.statSync(f).mtimeMs > 120000) fs.rmSync(f, { force: true }); } catch { /* belum ada */ }
  try { fs.closeSync(fs.openSync(f, 'wx')); return true; } catch { return false; }
}
const release = (root) => fs.rmSync(lockPath(root), { force: true });

async function applyOne(root, cfg, ids, { item, action, from }, ledger) {
  const p = cfg.plane;
  const sid = idOf(cfg, ids, item.status);
  if (!sid) return { ok: false, note: `state "${p.states[item.status]}" tidak ada di project Plane (periksa plane.states)` };
  if (action === 'create') {
    const title = String(item.fm.title || item.slug).slice(0, 255);
    const r = await api(cfg, 'POST', '/work-items/', {
      name: title, state: sid, external_id: item.slug, external_source: 'harness',
      description_html: `<p>${esc(p.marker)} dibuat otomatis dari work item <code>${esc(item.slug)}</code>.</p><p>Sumber kebenaran: <code>docs/work/${esc(item.slug)}/plan.md</code> (Plane hanya menampilkan statusnya).</p>`,
    });
    const id = r.ok ? r.json && r.json.id : (r.status === 409 && r.json && typeof r.json.id === 'string' ? r.json.id : null);
    if (!id) return { ok: false, note: r.ok ? 'respons tanpa id' : r.status === 409 ? 'kartu dengan external_id ini sudah ada tetapi id tidak dikembalikan; isi plane_id di plan.md secara manual' : r.error };
    fs.writeFileSync(item.planPath, setFmKey(fs.readFileSync(item.planPath, 'utf8'), 'plane_id', id));
    ledger[item.slug] = item.status;
    return { ok: true, note: `kartu dibuat di ${p.states[item.status]}` };
  }
  const id = String(item.fm.plane_id);
  const r = await api(cfg, 'PATCH', `/work-items/${enc(id)}/`, { state: sid });
  if (!r.ok) return { ok: false, note: r.status === 404 ? 'kartu tidak ada di Plane (dihapus?); hapus plane_id dari plan.md bila ingin dibuat ulang' : r.error };
  ledger[item.slug] = item.status;
  const c = await api(cfg, 'POST', `/work-items/${enc(id)}/comments/`, { comment_html: `<p>${esc(p.marker)} ${esc(from || '(awal)')} → <b>${esc(item.status)}</b></p>`, access: 'INTERNAL' });
  return { ok: true, note: `${from || '-'} → ${p.states[item.status]}${c.ok ? '' : ' (komentar gagal, status terkirim)'}` };
}

// Kirim semua yang tertunda. Satu proses sekaligus (kunci berkas); yang berubah selama berjalan diambil pada putaran berikutnya (maks 3).
export async function planeSync(root, cfg, { slug = null, includeMerged = false, dryRun = false } = {}) {
  const rows = []; const problems = planeProblems(cfg);
  if (dryRun) return { ok: true, rows: pending(root, { slug, includeMerged }).map((x) => [x.item.slug, x.action, 'dry-run']), problems: [] };
  if (!cfg.plane.enabled) return { ok: false, rows, problems: ['plane.enabled = false'] };
  if (problems.length) return { ok: false, rows, problems };
  if (!acquire(root)) return { ok: true, rows, problems: [], busy: true };
  let failed = 0;
  try {
    for (let pass = 0; pass < 3; pass++) {
      const todo = pending(root, { slug, includeMerged }).filter((x) => !rows.some((r) => r[0] === x.item.slug && r[3] === x.item.status));
      if (!todo.length) break;
      const ids = await stateIds(cfg);
      if (!ids.ok) { rows.push(['-', 'states', `GAGAL: ${ids.error}`]); failed++; break; }
      const ledger = readLedger(root);
      for (const t of todo) {
        const r = await applyOne(root, cfg, ids.map, t, ledger);
        rows.push([t.item.slug, t.action, `${r.ok ? 'OK' : 'GAGAL'}: ${r.note}`, t.item.status]);
        if (!r.ok) failed++;
        emit(root, { event: 'plane-sync', slug: t.item.slug, to: t.item.status, reason: r.ok ? 'ok' : r.note });
        writeLedger(root, ledger);
        if (!r.ok && /HTTP 429/.test(r.note)) { pass = 3; break; } // batas laju: berhenti, dilanjutkan sync berikutnya
      }
      if (failed) break; // jangan berputar pada kegagalan yang sama
    }
  } finally { release(root); }
  return { ok: failed === 0, rows, problems: [] };
}

// `plane check`: konfigurasi + koneksi + semua nama state di plane.states ada di project.
export async function planeCheck(cfg) {
  const problems = planeProblems(cfg); const rows = [];
  if (problems.length) return { ok: false, rows, problems };
  const ids = await stateIds(cfg);
  if (!ids.ok) return { ok: false, rows, problems: [`koneksi/otorisasi ke Plane gagal: ${ids.error}`] };
  for (const s of STATUSES) { const n = cfg.plane.states[s]; const id = idOf(cfg, ids.map, s); rows.push([s, n, id ? 'OK' : 'TIDAK ADA di project']); }
  return { ok: rows.every((r) => r[2] === 'OK'), rows, problems: [] };
}

// ---------- 1.13.0: isi kartu, komentar, cermin lokal, migrasi (jembatan ke 2.0 "satu pintu") ----------
// Kartu = judul + deskripsi (Tujuan, Konteks, Keputusan, Checklist AC). Diskusi = komentar. Lokal menarik komentar dan centang
// checklist ke cermin .harness/plane/<slug>.md (tidak di-commit, hanya dibaca hook dan agent). Komentar agent ditandai marker.
const contentPath = (root) => path.join(root, '.harness', 'plane-content.json');
export const inboxPath = (root) => path.join(root, '.harness', 'plane-inbox.json');
export const mirrorPath = (root, slug) => path.join(root, '.harness', 'plane', `${slug}.md`);
const readContent = (root) => readJson(contentPath(root), {}) || {};
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); }
const readMd = (it, f) => { const p = path.join(it.dir, f); return fs.existsSync(p) ? splitFrontmatter(fs.readFileSync(p, 'utf8')).body : ''; };
const real = (l) => l && !/^<.*>$/.test(l) && !/^(-|\.{3}|todo|tbd)$/i.test(l);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
export const stripHtml = (h) => String(h || '').replace(/<mention-component[^>]*entity_identifier="([^"]+)"[^>]*>(?:<\/mention-component>)?/g, '@$1')
  .replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
export const mention = (uid) => (uid ? `<mention-component entity_identifier="${esc(uid)}" entity_name="user_mention"></mention-component> ` : '');

export function renderCard(root, cfg, item, checked = []) {
  const brief = readMd(item, 'brief.md');
  const goal = objectiveOf(item);
  const ctx = bullets(section(brief, /^##\s+(Context|Konteks|Success criteria)/i)).map((l) => l.replace(/^[-*]\s*/, '')).filter(real).slice(0, 6);
  const a = readAlign(item);
  const dec = [];
  if (a) {
    for (const d of a.decisions.filter((x) => real(x.answer))) dec.push(`${d.id}: ${d.question} → <b>${inline(d.answer)}</b>`);
    for (const c of a.claimRows.filter((x) => /dikoreksi|diterima/.test(x.status))) dec.push(`${c.id}: ${inline(c.claim)} (${inline(c.status)})`);
  }
  for (const l of bullets(section(readMd(item, 'progress.md'), /^##\s+Decision log/i)).map((x) => x.replace(/^[-*]\s*/, '')).filter(real).slice(0, 8)) dec.push(inline(l));
  const ev = new Map(summarizeItem(item).ac.map((x) => [x.id, x.evidence === 'ok']));
  const acs = parseAcs(item.body);
  const li = (txt) => `<li>${txt.startsWith('<') ? txt : inline(txt)}</li>`;
  const html = [
    `<h2>Tujuan</h2><p>${inline(goal)}</p>`,
    ctx.length ? `<h2>Konteks</h2><ul>${ctx.map(li).join('')}</ul>` : '',
    dec.length ? `<h2>Keputusan</h2><ul>${dec.map((d) => `<li>${d}</li>`).join('')}</ul>` : '',
    acs.length ? `<h2>Checklist</h2><ul data-type="taskList">${acs.map((x) => { const on = ev.get(x.id) || checked.includes(x.id); return `<li data-type="taskItem" data-checked="${on}"><label><input type="checkbox"${on ? ' checked=""' : ''}><span></span></label><div><p>${x.id}: ${inline(x.text)}</p></div></li>`; }).join('')}</ul>` : '',
    `<p>${esc(cfg.plane.marker)} <code>${esc(item.slug)}</code> · ${esc(item.status)}</p>`,
  ].filter(Boolean).join('');
  return { name: cleanTitle(item.fm.title || item.slug, 120).slice(0, 255), description_html: html };
}

const cardItems = (root, slug) => listItems(root).filter((i) => (!slug || i.slug === slug) && i.fm.plane_id);

// Tulis isi kartu (judul + deskripsi). Hanya bila berubah sejak kiriman terakhir (hash di .harness/plane-content.json).
export async function planePush(root, cfg, { slug = null, dryRun = false, force = false } = {}) {
  const problems = planeProblems(cfg);
  if (!dryRun && !cfg.plane.enabled) return { ok: false, rows: [], problems: ['plane.enabled = false'] };
  if (!dryRun && problems.length) return { ok: false, rows: [], problems };
  if (!dryRun) await planeSync(root, cfg, { slug, includeMerged: !!slug }); // kartu yang belum ada dibuat dulu
  const content = readContent(root); const rows = []; let failed = 0;
  for (const it of (dryRun ? listItems(root).filter((i) => !slug || i.slug === slug) : cardItems(root, slug))) {
    const c = content[it.slug] || {};
    const card = renderCard(root, cfg, it, c.checked || []);
    const h = hash(card.name + card.description_html);
    if (!force && c.hash === h) { rows.push([it.slug, 'isi', 'sama']); continue; }
    if (dryRun) { rows.push([it.slug, it.fm.plane_id ? 'perbarui isi' : 'buat kartu + isi', `${card.description_html.length} karakter`]); continue; }
    const r = await api(cfg, 'PATCH', `/work-items/${enc(String(it.fm.plane_id))}/`, card);
    if (r.ok) { content[it.slug] = { ...c, hash: h }; rows.push([it.slug, 'isi', 'OK']); } else { failed++; rows.push([it.slug, 'isi', `GAGAL: ${r.error}`]); }
    if (!r.ok && r.status === 429) break;
  }
  if (!dryRun) writeJson(contentPath(root), content);
  return { ok: failed === 0, rows, problems: [] };
}

async function listAll(cfg, route) {
  const out = []; let cursor = '';
  for (let i = 0; i < 10; i++) {
    const r = await api(cfg, 'GET', `${route}${cursor ? `?cursor=${enc(cursor)}` : ''}`);
    if (!r.ok) return { ok: false, error: r.error };
    const list = Array.isArray(r.json) ? r.json : (r.json && r.json.results) || [];
    out.push(...list);
    if (!(r.json && r.json.next_page_results && r.json.next_cursor)) break;
    cursor = r.json.next_cursor;
  }
  return { ok: true, list: out };
}

// Tarik kartu + komentar ke cermin lokal. Komentar manusia baru (tanpa marker) masuk inbox, dimunculkan sekali oleh hook prompt.
export async function planePull(root, cfg, { slug = null } = {}) {
  const problems = planeProblems(cfg);
  if (!cfg.plane.enabled || problems.length) return { ok: false, rows: [], fresh: [], problems: cfg.plane.enabled ? problems : ['plane.enabled = false'] };
  const content = readContent(root); const inbox = readJson(inboxPath(root), []) || []; const rows = []; const fresh = []; let failed = 0;
  for (const it of cardItems(root, slug).filter((i) => slug || i.status !== 'merged')) {
    const id = enc(String(it.fm.plane_id));
    const w = await api(cfg, 'GET', `/work-items/${id}/`);
    if (!w.ok) { failed++; rows.push([it.slug, 'tarik', `GAGAL: ${w.error}`]); if (w.status === 429) break; continue; }
    const cm = cfg.plane.pull_comments ? await listAll(cfg, `/work-items/${id}/comments/`) : { ok: true, list: [] };
    const c = content[it.slug] || {}; const seen = new Set(c.seen || []);
    const desc = String((w.json && w.json.description_html) || '');
    const checked = [...desc.matchAll(/<li[^>]*data-checked="true"[^>]*>[\s\S]*?(AC\d+)/g)].map((m) => m[1]);
    const comments = (cm.list || []).map((x) => ({ id: x.id, at: String(x.created_at || '').slice(0, 16).replace('T', ' '), text: stripHtml(x.comment_html), agent: String(x.comment_html || '').includes(cfg.plane.marker) }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const news = comments.filter((x) => !x.agent && !seen.has(x.id));
    for (const n of news) { fresh.push({ slug: it.slug, at: n.at, text: n.text.slice(0, 400) }); inbox.push({ slug: it.slug, id: n.id, at: n.at, text: n.text.slice(0, 400) }); }
    content[it.slug] = { ...c, seen: comments.map((x) => x.id), checked, pulled_at: new Date().toISOString() };
    const ev = new Map(summarizeItem(it).ac.map((x) => [x.id, x.evidence === 'ok']));
    const md = [`# ${(w.json && w.json.name) || it.slug}`, `<!-- cermin Plane, ditulis harness.mjs plane pull; JANGAN diedit. Sumber: kartu ${it.fm.plane_id} -->`, '',
      '## Deskripsi', stripHtml(desc.replace(/<h2>Checklist<\/h2>[\s\S]*?<\/ul>/, '')) || '-', '',
      '## Checklist', ...(parseAcs(it.body).map((a) => `- [${checked.includes(a.id) ? 'x' : ' '}] ${a.id}: ${a.text}${checked.includes(a.id) && !ev.get(a.id) ? ' (dicentang di Plane; bukti lokal belum ada)' : ''}`)), '',
      '## Komentar', ...(comments.length ? comments.map((x) => `- ${x.at} · ${x.agent ? 'agent' : 'kamu'}: ${x.text.replace(/\n+/g, ' / ')}`) : ['-'])];
    fs.mkdirSync(path.dirname(mirrorPath(root, it.slug)), { recursive: true });
    fs.writeFileSync(mirrorPath(root, it.slug), md.join('\n') + '\n');
    rows.push([it.slug, 'tarik', `OK: ${comments.length} komentar (${news.length} baru), ${checked.length} dicentang`]);
  }
  writeJson(contentPath(root), content); writeJson(inboxPath(root), inbox.slice(-50));
  return { ok: failed === 0, rows, fresh, problems: [] };
}

// Inbox dibaca SEKALI oleh hook prompt (lalu dikosongkan): komentar manusia baru dari Plane menjadi konteks agent.
export function takeInbox(root) {
  const inbox = readJson(inboxPath(root), []) || [];
  if (!inbox.length) return [];
  try { fs.writeFileSync(inboxPath(root), '[]\n'); } catch { /* abaikan */ }
  return inbox;
}

// Komentar agent ke kartu. decide = tabel keputusan align (dibuat kode) + @mention (D19: hanya bila menahan pekerjaan).
export async function planeAsk(root, cfg, item, { text = '', decide = false, mentionUser = false } = {}) {
  const problems = planeProblems(cfg);
  if (!cfg.plane.enabled || problems.length) return { ok: false, error: cfg.plane.enabled ? problems[0] : 'plane.enabled = false' };
  if (!item.fm.plane_id) return { ok: false, error: `item ${item.slug} belum punya kartu (plane push ${item.slug})` };
  let body = text ? `<p>${inline(text)}</p>` : '';
  if (decide) {
    const rows = decisionRows(item);
    if (!rows.length) return { ok: false, error: 'tidak ada keputusan terbuka' };
    body += `<p>Perlu keputusanmu (${rows.length}). Balas di komentar, mis. "${rows[0].id}: a".</p><table><tbody><tr><th>#</th><th>jenis</th><th>yang perlu kamu putuskan</th><th>opsi</th></tr>${rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.kind)}</td><td>${inline(r.ask)}</td><td>${inline(r.options)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (!body) return { ok: false, error: 'teks komentar kosong' };
  const who = (decide || mentionUser) ? mention(cfg.plane.mention_user_id) : '';
  const r = await api(cfg, 'POST', `/work-items/${enc(String(item.fm.plane_id))}/comments/`, { comment_html: `<p><b>${esc(cfg.plane.marker)} agent</b> ${who}</p>${body}`, access: 'INTERNAL' });
  emit(root, { event: 'plane-comment', slug: item.slug, reason: r.ok ? (decide ? 'decide' : 'comment') : r.error });
  return r.ok ? { ok: true, id: r.json && r.json.id } : { ok: false, error: r.error };
}

const knowledgeFiles = (root) => {
  const kd = path.join(root, 'docs', 'knowledge');
  if (!fs.existsSync(kd)) return [];
  return fs.readdirSync(kd, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(kd, d.name)).filter((f) => f.endsWith('.md')).map((f) => `docs/knowledge/${d.name}/${f}`));
};

// Migrasi (D18: folder lokal TIDAK dihapus di 1.13). dry-run = laporan; tanpa dry-run = buat/perbarui kartu, tempel summary
// sebagai komentar penutup, tandai plane_migrated. verify = baca balik: judul dan tiap AC harus ada di kartu.
export async function planeMigrate(root, cfg, { dryRun = true, verify = false } = {}) {
  const items = listItems(root); const rows = [];
  if (dryRun) {
    for (const it of items) {
      const a = readAlign(it); const sum = fs.existsSync(path.join(it.dir, 'summary.md'));
      rows.push([it.slug, it.status, it.fm.plane_id ? 'perbarui kartu' : 'buat kartu', `${parseAcs(it.body).length} AC`, `${a ? decisionRows(it).length : 0} keputusan terbuka`, sum ? 'summary → komentar' : '-', cleanTitle(it.fm.title || it.slug, 60)]);
    }
    const kf = knowledgeFiles(root);
    return { ok: true, rows, knowledge: kf, problems: cfg.plane.enabled ? planeProblems(cfg) : ['plane.enabled = false'] };
  }
  const problems = planeProblems(cfg);
  if (!cfg.plane.enabled || problems.length) return { ok: false, rows, knowledge: [], problems: cfg.plane.enabled ? problems : ['plane.enabled = false'] };
  if (verify) {
    for (const it of items.filter((i) => i.fm.plane_id)) {
      const w = await api(cfg, 'GET', `/work-items/${enc(String(it.fm.plane_id))}/`);
      if (!w.ok) { rows.push([it.slug, 'verifikasi', `GAGAL: ${w.error}`]); continue; }
      const d = stripHtml(w.json && w.json.description_html);
      const miss = parseAcs(it.body).filter((x) => !d.includes(`${x.id}:`)).map((x) => x.id);
      rows.push([it.slug, 'verifikasi', miss.length ? `BEDA: ${miss.join(', ')} tidak ada di kartu` : 'COCOK']);
    }
    for (const it of items.filter((i) => !i.fm.plane_id)) rows.push([it.slug, 'verifikasi', 'BEDA: belum punya kartu']);
    return { ok: rows.every((r) => r[2] === 'COCOK'), rows, knowledge: [], problems: [] };
  }
  await planeSync(root, cfg, { includeMerged: true });
  const pushed = await planePush(root, cfg, { force: true });
  rows.push(...pushed.rows);
  const content = readContent(root);
  for (const it of listItems(root).filter((i) => i.fm.plane_id)) {
    const c = content[it.slug] || {};
    const sp = path.join(it.dir, 'summary.md');
    if (fs.existsSync(sp) && !c.summary_posted) {
      const txt = splitFrontmatter(fs.readFileSync(sp, 'utf8')).body.trim().slice(0, 6000);
      const r = await api(cfg, 'POST', `/work-items/${enc(String(it.fm.plane_id))}/comments/`, { comment_html: `<p><b>${esc(cfg.plane.marker)} summary</b></p><pre>${esc(txt)}</pre>`, access: 'INTERNAL' });
      rows.push([it.slug, 'summary', r.ok ? 'OK' : `GAGAL: ${r.error}`]);
      if (r.ok) content[it.slug] = { ...c, summary_posted: true };
    }
    if (!it.fm.plane_migrated) fs.writeFileSync(it.planPath, setFmKey(fs.readFileSync(it.planPath, 'utf8'), 'plane_migrated', new Date().toISOString().slice(0, 10)));
  }
  writeJson(contentPath(root), content);
  return { ok: rows.every((r) => !/GAGAL/.test(r[2])), rows, knowledge: [], problems: [] };
}
