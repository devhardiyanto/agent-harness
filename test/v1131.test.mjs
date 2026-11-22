// 1.13.1: rekap Stop sebagai tabel Markdown, slug pendek.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { project, hx, hook, wr, jr, commitAll } from './helpers.mjs';

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
