// Sinkron status SATU ARAH: work item lokal (docs/work/<slug>/plan.md) → kartu Plane. Plane tidak pernah mengubah apa pun di lokal.
// Mati bawaan (plane.enabled = false). Token API HANYA dari variabel lingkungan (plane.token_env); tidak pernah dibaca dari berkas, ditulis, atau dicetak.
// Best-effort: kegagalan jaringan/API tidak pernah menggagalkan transisi status; `plane sync` mengulang yang tertinggal (rekonsiliasi: status lokal ≠ status terakhir terkirim).
// Pemanggilan: `harness.mjs plane sync|check`, dan proses latar (planeKick di lib.mjs) setelah status berubah.
import fs from 'node:fs';
import path from 'node:path';
import { STATUSES, listItems, setFmKey, emit, redact, readJson } from './lib.mjs';

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
