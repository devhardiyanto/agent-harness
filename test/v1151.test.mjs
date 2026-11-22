// 1.15.1: model dan effort di status line; laporan uji M0 dengan log kosong tidak menyebut "TIDAK".
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { project } from './helpers.mjs';
import { render } from '../kernel/.claude/hooks/statusline.mjs';

const sline = (root, payload) => spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { cwd: root, input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, NO_COLOR: '1' } });

test('render: model dan effort di awal baris kedua; tanpa effort hanya model', () => {
  const base = { root: 'event', item: null, inbox: 2, lessons: 0, ctx: 41 };
  assert.equal(render({ ...base, model: 'Sonnet 5.5', effort: 'high' }, { theme: 'mono' }), '▌event  tidak ada item aktif · ketik permintaanmu\n▌Sonnet 5.5 · high · konteks 41%');
  assert.equal(render({ ...base, model: 'Haiku 5.5', effort: null }, { theme: 'mono' }).split('\n')[1], '▌Haiku 5.5 · konteks 41%');
});

test('statusline.mjs membaca model.display_name dan effort.level dari JSON sesi', () => {
  const root = project({ v1: true });
  const r = sline(root, { session_id: 's', model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' }, effort: { level: 'high' } });
  assert.match(r.stdout, /\n▌Sonnet 5\.5 · high\n$/);
  assert.match(sline(root, { session_id: 's', model: { id: 'claude-x' } }).stdout, /▌claude-x\n$/);
});

test('spike report: log kosong = pesan "Log kosong", bukan tabel TIDAK', () => {
  const root = project({ v1: true });
  const r = spawnSync('node', [path.join(root, '.claude/hooks/spike.mjs'), 'report'], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  assert.match(r.stdout, /^Log kosong/); assert.doesNotMatch(r.stdout, /\| TIDAK \|/);
});
