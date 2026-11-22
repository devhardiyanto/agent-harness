// 1.23.0 (R1, D37): Plane dicabut. Semua dikendalikan mesin lokal.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook, jr, wr } from './helpers.mjs';

test('kernel tanpa Plane: config, hook plane.mjs, dan perintah "plane" tidak ada lagi', () => {
  const root = project({ v1: true });
  assert.equal(jr(root, 'harness.config.json').plane, undefined);
  assert.equal(fs.existsSync(path.join(root, '.claude/hooks/plane.mjs')), false);
  const r = hx(root, 'plane', 'sync');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Plane dicabut di 1\.23\.0/);
});

test('kunci plane lama di config diabaikan; doctor dan migrate hanya memberi info', () => {
  const root = project({ v1: true });
  const c = jr(root, 'harness.config.json'); c.plane = { enabled: true, project_id: 'p1' };
  wr(root, 'harness.config.json', JSON.stringify(c, null, 2));
  assert.match(hx(root, 'doctor').stdout, /kunci "plane" di harness\.config\.json \| INFO/);
  assert.match(hx(root, 'migrate').stdout, /kunci "plane" di harness\.config\.json/);
  // status line tidak lagi menampilkan hitungan Plane walau inbox lama masih ada
  fs.mkdirSync(path.join(root, '.harness'), { recursive: true });
  fs.writeFileSync(path.join(root, '.harness/plane-inbox.json'), JSON.stringify([{ slug: 'x', text: 'y' }]));
  const s = hook(root, 'statusline.mjs', { session_id: 's' });
  assert.doesNotMatch(s.stdout, /Plane/);
});

test('"tarik" bukan lagi intent Plane', async () => {
  const { parseIntent } = await import('../kernel/.claude/hooks/intent.mjs');
  const cfg = { intent: { enabled: true, max_chars: 200 } };
  assert.equal(parseIntent('tarik', cfg, () => null).kind, undefined);
  assert.equal(parseIntent('tarik plane', cfg, () => null).kind, undefined);
});
