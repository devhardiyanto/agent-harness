// 1.19.2: perbaikan dari pilot yhpa: stop tidak menahan tanpa keputusan terbuka atau saat menunggu agent latar belakang,
// teks recap menyesuaikan bentuk item, sel tabel dipotong di batas kata, audit mencatat agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hook } from './helpers.mjs';
import { cell } from '../kernel/.claude/hooks/recap.mjs';
import { WAITING } from '../kernel/.claude/hooks/stop.mjs';

test('cell: dipotong di batas kata dengan …', () => {
  const s = 'lanjut kerjakan profileform-admin-save-nonaktif-sampai; semua AC berbukti → set-status profileform-admin-save-nonaktif-sampai in-review';
  const c = cell(s);
  assert.ok(c.length <= 110, c);
  assert.match(c, /…$/);
  assert.doesNotMatch(c, /save-…$/);
  assert.equal(cell('pendek'), 'pendek');
});

test('WAITING: pesan menunggu agent latar belakang dikenali; penutup biasa tidak', () => {
  assert.match('Agen frontend sedang mengerjakan 3 file. Hasilnya belum ada. Saya lanjut setelah laporannya masuk.', WAITING);
  assert.doesNotMatch('Semua AC berbukti; status in-review. Berikutnya: push PR + merge.', WAITING);
});

test('stop: pesan menunggu agent → tidak ditahan', () => {
  const root = project({ v1: true });
  const r = hook(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'Agen frontend sedang mengerjakan; hasilnya belum ada.' });
  assert.equal(r.status, 0, r.stderr);
});

test('post: audit mencatat agent_type subagent', () => {
  const root = project({ v1: true });
  hook(root, 'post.mjs', { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'x.txt') }, agent_type: 'frontend', agent_id: 'a1' });
  const dir = path.join(root, '.claude', 'audit');
  const all = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  assert.match(all, /"agent":"frontend"/);
  assert.match(all, /"agent_id":"a1"/);
});
