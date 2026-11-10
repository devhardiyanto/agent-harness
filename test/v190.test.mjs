// 1.9.0: sinkron status satu arah work item → Plane (server Plane tiruan; tanpa jaringan sungguhan).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { project, hx, wr, rd, jr, commitAll } from './helpers.mjs';

const TOKEN = 'plane_api_tokentes_123456';
const STATES = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

function mock({ states = STATES, failPatch = false } = {}) {
  const reqs = []; const items = new Map();
  const srv = http.createServer((q, res) => {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      const body = b ? JSON.parse(b) : null;
      reqs.push({ method: q.method, url: q.url, key: q.headers['x-api-key'], body });
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const base = '/api/v1/workspaces/ws/projects/pid';
      if (q.method === 'GET' && q.url.startsWith(`${base}/states/`)) return send(200, { results: states.map((n) => ({ id: `sid-${n}`, name: n })), next_page_results: false });
      if (q.method === 'POST' && q.url === `${base}/work-items/`) { const id = `wi-${items.size + 1}`; items.set(id, body); return send(201, { id, sequence_id: items.size }); }
      const m = new RegExp(`^${base}/work-items/([^/]+)/(comments/)?$`).exec(q.url);
      if (m && q.method === 'PATCH') { if (failPatch) return send(500, { error: 'boom' }); return send(200, { id: m[1] }); }
      if (m && m[2] && q.method === 'POST') return send(201, { id: 'c1' });
      send(404, { error: 'tidak ada' });
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ reqs, items, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

// hx versi async: server tiruan hidup di proses ini, jadi spawnSync akan buntu.
const hxa = (root, env, ...a) => new Promise((ok) => {
  const c = spawn('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env } });
  let out = ''; let err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
  c.on('close', (status) => ok({ status, stdout: out, stderr: err }));
});

function setup(url, extra = {}) {
  const root = project({ v1: true });
  const cfg = jr(root, 'harness.config.json');
  cfg.plane = { ...cfg.plane, enabled: true, base_url: url, workspace: 'ws', project_id: 'pid', ...extra };
  wr(root, 'harness.config.json', JSON.stringify(cfg, null, 2));
  commitAll(root, 'plane on');
  return root;
}
const newItem = (root, title) => { const r = hx(root, 'new', 'feature', title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const env = { PLANE_API_KEY: TOKEN };

test('kernel baru: blok plane ada, mati bawaan, doctor tidak memeriksa Plane saat mati', () => {
  const root = project({ v1: true });
  const p = jr(root, 'harness.config.json').plane;
  assert.equal(p.enabled, false);
  assert.equal(p.states['in-review'], 'Review');
  assert.doesNotMatch(hx(root, 'doctor').stdout, /Plane/);
});

test('sync: kartu dibuat di Backlog, plane_id masuk plan.md, token hanya di header dan tidak tertulis di berkas mana pun', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const slug = newItem(root, 'fitur satu');
    const r = await hxa(root, env, 'plane', 'sync');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /kartu dibuat di Backlog/);
    assert.match(rd(root, `docs/work/${slug}/plan.md`), /^plane_id: wi-1$/m);
    const post = m.reqs.find((x) => x.method === 'POST' && x.url.endsWith('/work-items/'));
    assert.equal(post.key, TOKEN);
    assert.equal(post.body.state, 'sid-Backlog');
    assert.equal(post.body.external_id, slug);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(root)) assert.equal(fs.readFileSync(f, 'utf8').includes(TOKEN), false, `token bocor di ${f}`);
    // kedua kali: tidak ada yang berubah → tidak ada permintaan baru
    const n = m.reqs.length;
    const r2 = await hxa(root, env, 'plane', 'sync');
    assert.match(r2.stdout, /sudah sama/);
    assert.equal(m.reqs.length, n);
  } finally { m.close(); }
});

test('sync: perubahan status → PATCH state yang benar + komentar bertanda; status tak berubah tidak dikirim ulang', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const slug = newItem(root, 'fitur dua');
    await hxa(root, env, 'plane', 'sync');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: in-review'));
    const r = await hxa(root, env, 'plane', 'sync');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const patch = m.reqs.find((x) => x.method === 'PATCH' && x.body.state); // 1.13: PATCH isi kartu (tanpa state) terpisah
    assert.deepEqual(patch.body, { state: 'sid-Review' });
    const cm = m.reqs.find((x) => x.url.endsWith('/comments/'));
    assert.match(cm.body.comment_html, /\[harness\].*draft.*in-review/);
    assert.equal(jr(root, '.harness/plane.json')[slug], 'in-review');
  } finally { m.close(); }
});

test('sync: nama state dari config dipakai (astra: In Review); nama yang tidak ada di Plane → GAGAL dan tidak ada permintaan tulis', async () => {
  const m = await mock({ states: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'] });
  const root = setup(m.url, { states: { 'in-review': 'In Review' } });
  try {
    const slug = newItem(root, 'fitur tiga');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: in-review'));
    const r = await hxa(root, env, 'plane', 'sync');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(m.reqs.find((x) => x.method === 'POST').body.state, 'sid-In Review');
  } finally { m.close(); }
  const m2 = await mock({ states: ['Backlog', 'Todo', 'In Progress', 'Done'] }); // tanpa "Review"
  const root2 = setup(m2.url);
  try {
    const slug = newItem(root2, 'fitur empat');
    wr(root2, `docs/work/${slug}/plan.md`, rd(root2, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: in-review'));
    const r = await hxa(root2, env, 'plane', 'sync');
    assert.equal(r.status, 2);
    assert.match(r.stdout, /state "Review" tidak ada/);
    assert.equal(m2.reqs.filter((x) => x.method !== 'GET').length, 0);
  } finally { m2.close(); }
});

test('sync: item merged tanpa kartu dilewati; --include-merged membuatnya', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const slug = newItem(root, 'lama');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: merged'));
    const a = await hxa(root, env, 'plane', 'sync');
    assert.match(a.stdout, /sudah sama/);
    const b = await hxa(root, env, 'plane', 'sync', '--include-merged');
    assert.match(b.stdout, /kartu dibuat di Done/);
  } finally { m.close(); }
});

test('kegagalan API tidak mengubah status lokal dan diulang pada sync berikutnya', async () => {
  const m = await mock({ failPatch: true }); const root = setup(m.url);
  try {
    const slug = newItem(root, 'fitur lima');
    await hxa(root, env, 'plane', 'sync');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: approved'));
    const r = await hxa(root, env, 'plane', 'sync');
    assert.equal(r.status, 2);
    assert.match(r.stdout, /GAGAL: HTTP 500/);
    assert.equal(jr(root, '.harness/plane.json')[slug], 'draft'); // belum dianggap terkirim
    assert.match(rd(root, `docs/work/${slug}/plan.md`), /^status: approved$/m);
  } finally { m.close(); }
});

test('token tidak ada di lingkungan → sync menolak dengan pesan jelas, tanpa permintaan jaringan; set-status tetap jalan', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const slug = newItem(root, 'fitur enam');
    const r = await hxa(root, { PLANE_API_KEY: '' }, 'plane', 'sync');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /PLANE_API_KEY belum diisi/);
    assert.equal(m.reqs.length, 0);
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: approved'));
    const s = hx(root, 'set-status', slug, 'in-progress'); // lingkungan hx tanpa token Plane dan plane enabled
    assert.equal(s.status, 0, s.stderr + s.stdout);
    assert.match(rd(root, `docs/work/${slug}/plan.md`), /^status: in-progress$/m);
  } finally { m.close(); }
});

test('base_url http:// ke host non-lokal ditolak (token tidak boleh lewat tanpa enkripsi)', async () => {
  const root = setup('http://plane.example.com');
  const r = await hxa(root, env, 'plane', 'check');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /https/);
});

test('plane check: tabel pemetaan; dry-run tidak butuh token atau jaringan; doctor GAGAL bila enabled tanpa token', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const c = await hxa(root, env, 'plane', 'check');
    assert.equal(c.status, 0, c.stderr + c.stdout);
    assert.match(c.stdout, /\| in-review \| Review \| OK \|/);
    newItem(root, 'fitur tujuh');
    const n = m.reqs.length;
    const d = await hxa(root, { PLANE_API_KEY: '' }, 'plane', 'sync', '--dry-run');
    assert.equal(d.status, 0);
    assert.match(d.stdout, /create/);
    assert.equal(m.reqs.length, n);
    const doc = await hxa(root, { PLANE_API_KEY: '' }, 'doctor');
    assert.match(doc.stdout, /Plane: konfigurasi lengkap[^\n]*GAGAL/);
  } finally { m.close(); }
});

test('status berubah lewat hook/CLI memicu sinkron di latar (planeKick)', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    const slug = newItem(root, 'fitur delapan');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^status: .*$/m, 'status: approved'));
    await hxa(root, env, 'plane', 'sync'); // kartu dibuat di Todo
    const n = m.reqs.length;
    const q = await hxa(root, { PLANE_API_KEY: TOKEN }, 'reopen', slug); // reopen = write() → audit('status') → planeKick
    assert.equal(q.status, 0, q.stderr);
    assert.ok(m.reqs.length >= n);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !m.reqs.some((x) => x.method === 'PATCH' && x.body.state)) await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(m.reqs.some((x) => x.method === 'PATCH' && x.body.state === 'sid-Backlog'), 'sinkron latar tidak terjadi');
  } finally { m.close(); }
});
