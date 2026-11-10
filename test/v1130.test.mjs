// 1.13.0: jembatan ke 2.0 — log pilot + "bukan itu", peringatan slash usang, migrasi align, slug ringkas,
// Plane satu pintu (isi kartu + checklist, tarik komentar ke cermin, komentar agent + @mention, migrasi). Server Plane tiruan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { project, hx, hook, wr, rd, jr, commitAll } from './helpers.mjs';

const ctx = (r) => (r.stdout ? JSON.parse(r.stdout) : {});
const add = (r) => ctx(r).hookSpecificOutput?.additionalContext || '';
const newItem = (root, title, type = 'feature') => { const r = hx(root, 'new', type, title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const log = (root) => { try { return rd(root, '.harness/state/intent-log.jsonl').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
const UID = '8a1ecbc9-0000-4000-8000-000000000001';

test('slug dan judul ringkas: kata pengisi di awal dibuang, slug ≤ 40 karakter tanpa tanda hubung menggantung', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'oke, ada feedback dariku untuk formfield - mengenai jabatan itu harus dimunculkan');
  const s = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  assert.ok(s.length <= 40, s);
  assert.doesNotMatch(s, /^(oke|ada)-|dariku|untuk|--|-$/);
  assert.match(s, /^feedback-formfield/);
  const r = hook(root, 'prompt.mjs', { prompt: 'quick: disini aku ingin kamu update config ultra_voucher' });
  assert.match(add(r), /Item quick 2\d{3}-\d\d-\d\d-update-config-ultra_voucher /);
});

test('pilot: frasa dan slash dicatat lokal; slash usang memberi pengganti; "bukan itu" menandai salah tangkap dan membatalkan "ingat"', () => {
  const root = project({ v1: true });
  hook(root, 'prompt.mjs', { prompt: 'sisa' });
  let r = hook(root, 'prompt.mjs', { prompt: '/harness:next' });
  assert.match(add(r), /\/harness:next akan dihapus di 2\.0[\s\S]*"sisa"/);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat: pakai pnpm, bukan npm' });
  assert.match(add(r), /Memori M1 disimpan/);
  r = hook(root, 'prompt.mjs', { prompt: 'bukan itu' });
  assert.match(add(r), /SALAH TANGKAP[\s\S]*memori M1 dihapus lagi/);
  assert.doesNotMatch(rd(root, 'docs/memory/MEMORY.md'), /pnpm/);
  const l = log(root);
  assert.deepEqual(l.map((x) => x.type), ['intent', 'slash', 'intent', 'misfire']);
  assert.equal(l[0].kind, 'open'); assert.equal(l[1].skill, 'next');
  const p = hx(root, 'pilot').stdout;
  assert.match(p, /\| S1 \| .* \| 2 frasa vs 1 slash \| OK \|/);
  assert.match(p, /\| S2 \| salah tangkap ≤ 0 \| 1 \| BELUM \|/);
  assert.match(p, /Slash yang masih dipakai: \/harness:next 1/);
  assert.match(p, /Belum siap 2\.0/);
  const c = jr(root, 'harness.config.json'); c.pilot = { enabled: false }; wr(root, 'harness.config.json', JSON.stringify(c));
  hook(root, 'prompt.mjs', { prompt: 'sisa' });
  assert.equal(log(root).length, 4, 'pilot mati → tidak ada catatan');
});

test('migrate: align.md format lama dilaporkan, diperbaiki otomatis di awal sesi (hanya menambah bagian); flag non-bawaan dilaporkan', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar lama');
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\nrounds: 1\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n| C1 | a | a.ts:1 | dugaan |\n\n## Debat\n- x\n');
  let m = hx(root, 'migrate').stdout;
  assert.match(m, /\| align\.md format lama \| 1 item \|.*\| BELUM \|/);
  const c = jr(root, 'harness.config.json'); c.align.decision_table = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  assert.match(hx(root, 'migrate').stdout, /\| flag yang dikunci di 2\.0 \| align\.decision_table \|/);
  const s = hook(root, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' });
  assert.match(add(s), /Migrasi: 1 align\.md diberi bagian "Keputusan terbuka"/);
  const t = rd(root, `docs/work/${slug}/align.md`);
  assert.match(t, /\| C1 \| a \| a\.ts:1 \| dugaan \|[\s\S]*## Keputusan terbuka\n\| # \| pertanyaan \| opsi \| jawaban \|[\s\S]*## Debat\n- x/);
  assert.match(hx(root, 'migrate').stdout, /\| align\.md format lama \| tidak ada \|/);
  assert.match(hx(root, 'doctor').stdout, /\| siap 2\.0 \(info, tidak menggagalkan\) \| BELUM \|/);
});

// ---------- Plane satu pintu ----------
function mock() {
  const reqs = []; const items = new Map(); const comments = new Map();
  const srv = http.createServer((q, res) => {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      const body = b ? JSON.parse(b) : null;
      reqs.push({ method: q.method, url: q.url, body });
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const base = '/api/v1/workspaces/ws/projects/pid';
      if (q.method === 'GET' && q.url.startsWith(`${base}/states/`)) return send(200, { results: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'].map((n) => ({ id: `sid-${n}`, name: n })) });
      if (q.method === 'POST' && q.url === `${base}/work-items/`) { const id = `wi-${items.size + 1}`; items.set(id, { ...body }); comments.set(id, []); return send(201, { id }); }
      const m = new RegExp(`^${base}/work-items/([^/]+)/(comments/)?(?:\\?.*)?$`).exec(q.url);
      if (!m || !items.has(m[1])) return send(404, { error: 'tidak ada' });
      if (!m[2] && q.method === 'PATCH') { Object.assign(items.get(m[1]), body); return send(200, { id: m[1] }); }
      if (!m[2] && q.method === 'GET') return send(200, { id: m[1], ...items.get(m[1]) });
      if (m[2] && q.method === 'POST') { const c = { id: `c${comments.get(m[1]).length + 1}`, created_at: `2026-11-10T09:0${comments.get(m[1]).length}:00Z`, ...body }; comments.get(m[1]).push(c); return send(201, c); }
      if (m[2] && q.method === 'GET') return send(200, { results: comments.get(m[1]), next_page_results: false });
      send(404, {});
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ reqs, items, comments, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
const hxa = (root, ...a) => new Promise((ok) => {
  const c = spawn('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, PLANE_API_KEY: 'plane_api_tes_123456' } });
  let out = ''; let err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
  c.on('close', (status) => ok({ status, stdout: out, stderr: err }));
});
function setup(url) {
  const root = project({ v1: true });
  const cfg = jr(root, 'harness.config.json');
  cfg.plane = { ...cfg.plane, enabled: true, base_url: url, workspace: 'ws', project_id: 'pid', mention_user_id: UID };
  wr(root, 'harness.config.json', JSON.stringify(cfg, null, 2)); commitAll(root, 'plane on');
  const slug = newItem(root, 'Email QR seminar');
  wr(root, `docs/work/${slug}/brief.md`, rd(root, `docs/work/${slug}/brief.md`).replace(/<satu-dua kalimat[^>]*>/, 'Pendaftar menerima email berisi QR untuk check-in.'));
  wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace(/^- AC1:.*$/m, '- AC1: email QR terkirim setelah daftar\n- AC2: QR bisa dipindai di gerbang'));
  wr(root, `docs/work/${slug}/progress.md`, rd(root, `docs/work/${slug}/progress.md`).replace(/^- AC1:\s*$/m, '- AC1: test mail.spec.ts lulus (3/3)'));
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\nrounds: 1\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n| C1 | mail service ada | mail.ts:1 | terverifikasi |\n\n## Keputusan terbuka\n| # | pertanyaan | opsi | jawaban |\n|---|---|---|---|\n| D1 | Bahasa email? | a) ID · b) EN | a |\n| D2 | Kirim ulang QR? | a) ya · b) tidak | |\n');
  return { root, slug };
}

test('plane push: kartu berisi Tujuan, Keputusan, Checklist (AC berbukti dicentang); tidak dikirim ulang bila sama', async () => {
  const m = await mock(); const { root, slug } = setup(m.url);
  try {
    let r = await hxa(root, 'plane', 'sync');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const card = m.items.get('wi-1');
    assert.equal(card.name, 'Email QR seminar');
    assert.match(card.description_html, /<h2>Tujuan<\/h2><p>Pendaftar menerima email berisi QR untuk check-in\.<\/p>/);
    assert.match(card.description_html, /<h2>Keputusan<\/h2><ul><li>D1: Bahasa email\? → <b>a<\/b><\/li>/);
    assert.match(card.description_html, /<ul data-type="taskList"><li data-type="taskItem" data-checked="true">[\s\S]*?AC1: email QR terkirim[\s\S]*?data-checked="false">[\s\S]*?AC2: QR bisa dipindai/);
    const n = m.reqs.filter((x) => x.method === 'PATCH').length;
    r = await hxa(root, 'plane', 'push');
    assert.match(r.stdout, /\| isi \| sama \|/);
    assert.equal(m.reqs.filter((x) => x.method === 'PATCH').length, n);
    assert.ok(!fs.readdirSync(root).some((f) => f.includes('plane_api')), 'token tidak tertulis');
  } finally { m.close(); }
});

test('plane pull: cermin lokal + inbox komentar manusia (komentar agent dilewati); hook prompt memunculkan sekali; "tarik" menarik sekarang', async () => {
  const m = await mock(); const { root, slug } = setup(m.url);
  try {
    await hxa(root, 'plane', 'sync');
    m.items.get('wi-1').description_html = m.items.get('wi-1').description_html.replace('data-checked="false"', 'data-checked="true"');
    m.comments.get('wi-1').push({ id: 'h1', created_at: '2026-11-10T10:00:00Z', comment_html: '<p>D2 jawab a, kirim ulang boleh</p>' });
    m.comments.get('wi-1').push({ id: 'a1', created_at: '2026-11-10T10:01:00Z', comment_html: '<p><b>[harness] agent</b></p><p>dicatat</p>' });
    const r = await hxa(root, 'plane', 'pull');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /2 komentar \(1 baru\), 2 dicentang/);
    assert.match(r.stdout, /Komentar baru dari kamu di Plane:\n- .*D2 jawab a/);
    const mir = rd(root, `.harness/plane/${slug}.md`);
    assert.match(mir, /- \[x\] AC2: QR bisa dipindai di gerbang \(dicentang di Plane; bukti lokal belum ada\)/);
    assert.match(mir, /· kamu: D2 jawab a[\s\S]*· agent: \[harness\] agent/);
    const p1 = hook(root, 'prompt.mjs', { prompt: 'lanjutkan kerjanya ya' });
    assert.match(add(p1), /Komentar baru dari user di Plane[\s\S]*D2 jawab a/);
    const p2 = hook(root, 'prompt.mjs', { prompt: 'lanjutkan kerjanya ya' });
    assert.doesNotMatch(add(p2), /Komentar baru/, 'inbox hanya sekali');
    const again = await hxa(root, 'plane', 'pull');
    assert.match(again.stdout, /\(0 baru\)/, 'komentar yang sudah dilihat tidak muncul lagi');
  } finally { m.close(); }
});

test('plane ask --decide: tabel keputusan (dibuat kode) + @mention; comment biasa tanpa mention', async () => {
  const m = await mock(); const { root, slug } = setup(m.url);
  try {
    await hxa(root, 'plane', 'sync');
    let r = await hxa(root, 'plane', 'ask', slug, '--decide');
    assert.equal(r.status, 0, r.stderr);
    const c = m.comments.get('wi-1').at(-1).comment_html;
    assert.match(c, /\[harness\] agent<\/b> <mention-component entity_identifier="8a1ecbc9-0000-4000-8000-000000000001" entity_name="user_mention">/);
    assert.match(c, /<td>D2<\/td><td>keputusan<\/td><td>Kirim ulang QR\?<\/td>/);
    assert.doesNotMatch(c, /<td>D1<\/td>/, 'D1 sudah dijawab');
    r = await hxa(root, 'plane', 'comment', slug, 'AC1', 'sudah', 'lulus');
    assert.equal(r.status, 0, r.stderr);
    const c2 = m.comments.get('wi-1').at(-1).comment_html;
    assert.match(c2, /<p>AC1 sudah lulus<\/p>/); assert.doesNotMatch(c2, /mention-component/);
  } finally { m.close(); }
});

test('plane migrate: dry-run tanpa permintaan tulis; --apply membuat kartu, menempel summary, menandai plane_migrated; --verify COCOK; folder tetap ada', async () => {
  const m = await mock(); const { root, slug } = setup(m.url);
  try {
    wr(root, 'docs/knowledge/api/summary.md', '# api\n');
    let r = await hxa(root, 'plane', 'migrate');
    assert.match(r.stdout, new RegExp(`\\| ${slug} \\| draft \\| buat kartu \\| 2 AC \\| 1 keputusan terbuka \\| - \\| Email QR seminar \\|`));
    assert.match(r.stdout, /Knowledge → Plane Pages \(dikerjakan di 2\.0\): 1 berkas\n- docs\/knowledge\/api\/summary\.md/);
    assert.equal(m.reqs.filter((x) => x.method !== 'GET').length, 0, 'dry-run tidak menulis');
    wr(root, `docs/work/${slug}/summary.md`, '# Ringkasan\n- email QR jalan\n');
    r = await hxa(root, 'plane', 'migrate', '--apply');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(m.comments.get('wi-1').map((c) => c.comment_html).join(), /\[harness\] summary<\/b><\/p><pre># Ringkasan\n- email QR jalan<\/pre>/);
    assert.match(rd(root, `docs/work/${slug}/plan.md`), /^plane_migrated: \d{4}-\d\d-\d\d$/m);
    r = await hxa(root, 'plane', 'migrate', '--verify');
    assert.match(r.stdout, new RegExp(`\\| ${slug} \\| verifikasi \\| COCOK \\|`));
    m.items.get('wi-1').description_html = '<p>diubah</p>';
    r = await hxa(root, 'plane', 'migrate', '--verify');
    assert.equal(r.status, 2); assert.match(r.stdout, /BEDA: AC1, AC2 tidak ada di kartu/);
    assert.ok(fs.existsSync(path.join(root, 'docs/work', slug, 'plan.md')), 'D18: folder tidak dihapus di 1.13');
    await hxa(root, 'plane', 'migrate', '--apply');
    assert.equal(m.comments.get('wi-1').filter((c) => /summary/.test(c.comment_html)).length, 1, 'summary tidak ditempel dua kali');
  } finally { m.close(); }
});

test('Stop: penahanan tabel keputusan dicatat untuk pilot (S3)', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar tahan');
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n| C1 | x | - | dugaan |\n\n## Keputusan terbuka\n| # | pertanyaan | opsi | jawaban |\n|---|---|---|---|\n');
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  const r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 2);
  assert.equal(log(root).filter((x) => x.type === 'stop-hold').length, 1);
  assert.match(hx(root, 'pilot').stdout, /\| S3 \| .* \| 1 penahanan \| OK \|/);
});

test('D20: deskripsi yang diubah di Plane tidak ditimpa (DITAHAN + inbox); centang checklist bukan ubahan; --force menimpa', async () => {
  const m = await mock(); const { root, slug } = setup(m.url);
  try {
    await hxa(root, 'plane', 'sync');
    const card = m.items.get('wi-1');
    card.description_html = card.description_html.replace('data-checked="false"><label><input type="checkbox">', 'data-checked="true"><label><input type="checkbox" checked="">');
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace('- AC2: QR bisa dipindai di gerbang', '- AC2: QR bisa dipindai di gerbang\n- AC3: email ulang tersedia'));
    let r = await hxa(root, 'plane', 'push');
    assert.match(r.stdout, /\| isi \| OK \|/, 'hanya centang yang berubah → tetap dikirim');
    assert.match(m.items.get('wi-1').description_html, /AC3: email ulang tersedia/);
    m.items.get('wi-1').description_html += '<p>catatan dari user di Plane</p>';
    wr(root, `docs/work/${slug}/plan.md`, rd(root, `docs/work/${slug}/plan.md`).replace('- AC3: email ulang tersedia', '- AC3: email ulang tersedia dari halaman status'));
    const patches = m.reqs.filter((x) => x.method === 'PATCH').length;
    r = await hxa(root, 'plane', 'push');
    assert.match(r.stdout, /DITAHAN: deskripsi diubah di Plane/);
    assert.equal(m.reqs.filter((x) => x.method === 'PATCH').length, patches, 'tidak ada PATCH');
    assert.match(m.items.get('wi-1').description_html, /catatan dari user di Plane/);
    assert.match(add(hook(root, 'prompt.mjs', { prompt: 'lanjut kerja' })), /deskripsi kartu diubah di Plane; tidak ditimpa/);
    r = await hxa(root, 'plane', 'push', slug, '--force');
    assert.match(r.stdout, /\| isi \| OK \|/);
    assert.match(m.items.get('wi-1').description_html, /dari halaman status/);
  } finally { m.close(); }
});

test('pilot: jendela bawaan 6 jam; --days dan --hours bisa dipilih', () => {
  const root = project({ v1: true });
  assert.equal(jr(root, 'harness.config.json').pilot.hours, 6);
  wr(root, '.harness/state/intent-log.jsonl', `${JSON.stringify({ ts: new Date(Date.now() - 8 * 3600000).toISOString(), type: 'intent', kind: 'open' })}\n${JSON.stringify({ ts: new Date().toISOString(), type: 'intent', kind: 'open' })}\n`);
  assert.match(hx(root, 'pilot').stdout, /^Pilot 6 jam terakhir \(1 catatan\)/);
  assert.match(hx(root, 'pilot', '--hours', '12').stdout, /^Pilot 12 jam terakhir \(2 catatan\)/);
  assert.match(hx(root, 'pilot', '--days', '2').stdout, /^Pilot 2 hari terakhir \(2 catatan\)/);
});
