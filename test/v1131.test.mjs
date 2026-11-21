// 1.13.1: token Plane dibersihkan (CRLF/spasi/kutip), token_env harus nama variabel, rekap Stop sebagai tabel Markdown, slug pendek.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { project, hx, hook, wr, jr, commitAll } from './helpers.mjs';

const TOKEN = 'plane_api_tes1234567890abcdef';
function mock() {
  const keys = [];
  const srv = http.createServer((q, res) => {
    keys.push(q.headers['x-api-key']);
    res.writeHead(q.headers['x-api-key'] === TOKEN ? 200 : 403, { 'content-type': 'application/json' });
    res.end(JSON.stringify(q.headers['x-api-key'] === TOKEN ? { results: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'].map((n) => ({ id: n, name: n })) } : { detail: 'Given API token is not valid' }));
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ keys, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
const hxa = (root, env, ...a) => new Promise((ok) => {
  const c = spawn('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env } });
  let out = ''; let err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
  c.on('close', (status) => ok({ status, stdout: out, stderr: err }));
});
const setup = (url, extra = {}) => {
  const root = project({ v1: true });
  const c = jr(root, 'harness.config.json');
  c.plane = { ...c.plane, enabled: true, base_url: url, workspace: 'ws', project_id: 'pid', ...extra };
  wr(root, 'harness.config.json', JSON.stringify(c, null, 2)); commitAll(root);
  return root;
};

test('token ber-CRLF / spasi / kutip dibersihkan: plane check OK + info tanpa isi token', async () => {
  const m = await mock(); const root = setup(m.url);
  try {
    for (const v of [`${TOKEN}\r`, `  ${TOKEN}\n`, `"${TOKEN}"`]) {
      const r = await hxa(root, { PLANE_API_KEY: v }, 'plane', 'check');
      assert.equal(r.status, 0, r.stderr + r.stdout);
      assert.match(r.stdout, /\| in-review \| Review \| OK \|/);
      assert.match(r.stdout, /Info:\n- token PLANE_API_KEY (berisi CR|berisi spasi|dibungkus tanda kutip)/);
      assert.doesNotMatch(r.stdout + r.stderr, /tes1234567890/);
    }
    assert.ok(m.keys.every((k) => k === TOKEN), 'header selalu token bersih');
    const ok = await hxa(root, { PLANE_API_KEY: TOKEN }, 'plane', 'check');
    assert.doesNotMatch(ok.stdout, /Info:/);
  } finally { m.close(); }
});

test('token_env berisi token (bukan nama variabel) ditolak oleh plane check dan doctor, tanpa mencetak token', async () => {
  const m = await mock(); const root = setup(m.url, { token_env: TOKEN });
  try {
    const r = await hxa(root, {}, 'plane', 'check');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /plane\.token_env harus NAMA variabel lingkungan/);
    assert.doesNotMatch(r.stderr, /tes1234567890/);
    assert.equal(m.keys.length, 0, 'tanpa permintaan jaringan');
    assert.match(hx(root, 'doctor').stdout, /Plane: konfigurasi lengkap .* \| GAGAL \| plane\.token_env harus NAMA/);
    const c = jr(root, 'harness.config.json'); c.plane.token_env = 'PLANE_TOKEN_EVENT'; wr(root, 'harness.config.json', JSON.stringify(c));
    const r2 = await hxa(root, { PLANE_TOKEN_EVENT: TOKEN }, 'plane', 'check');
    assert.equal(r2.status, 0, r2.stderr);
  } finally { m.close(); }
});

test('rekap Stop: agent diminta menutup dengan tabel Markdown (slug pendek); tidak ditahan bila sudah tampil; render "system" = perilaku lama', () => {
  const root = project({ v1: true });
  const r0 = hx(root, 'new', 'feature', 'Dukung datakey banner'); const slug = r0.stdout.trim().split('/').pop();
  const short = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  let r = hook(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'selesai mengedit.' });
  assert.equal(r.status, 2);
  // 1.22.3: pesan hook hanya menunjuk perintah; slug pendek diperiksa di keluaran open --md
  assert.match(r.stderr, /open --mine --md/);
  const op = hx(root, 'open', '--md').stdout;
  assert.match(op, new RegExp(`\\|\\s*1\\s*\\|\\s*${short}\\s*\\|\\s*langkah\\s*\\|`));
  assert.doesNotMatch(op, new RegExp(`\\|\\s*\\d{4}-\\d{2}-\\d{2}-${short}\\s*\\|`));
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop', stop_hook_active: true });
  assert.equal(r.status, 0, 'lanjutan setelah ditahan tidak ditahan lagi');
  const root2 = project({ v1: true });
  const s2 = hx(root2, 'new', 'feature', 'Item dua').stdout.trim().split('/').pop();
  wr(root2, '.harness/state/touched-s.json', JSON.stringify({ slugs: [s2] }));
  r = hook(root2, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: '...\nBelum selesai (item sesi ini) (1):\n| # | item |' });
  assert.equal(r.status, 0, 'tabel sudah ada di pesan terakhir');
  const root3 = project({ v1: true });
  const c = jr(root3, 'harness.config.json'); c.recap.render = 'system'; wr(root3, 'harness.config.json', JSON.stringify(c));
  const s3 = hx(root3, 'new', 'feature', 'Item tiga').stdout.trim().split('/').pop();
  wr(root3, '.harness/state/touched-s.json', JSON.stringify({ slugs: [s3] }));
  r = hook(root3, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /Belum selesai \(item sesi ini\)/);
  assert.ok(fs.existsSync(path.join(root3, 'harness.config.json')));
});
