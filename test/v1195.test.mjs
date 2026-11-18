// 1.19.5: pesan commit berkutip bukan operasi tulis; cabang dibaca dari git -C / cd; pemilih pelajaran 1 opsi; rekap tidak ganda.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { project, sh } from './helpers.mjs';
import { unquoted, gitDir } from '../kernel/.claude/hooks/guard-bash.mjs';
import { alreadyShown } from '../kernel/.claude/hooks/stop.mjs';

test('unquoted: isi kutip dan heredoc dibuang, operator di luar kutip tetap', () => {
  assert.equal(unquoted('git commit -m "bio > 300 -> galat; rm cache"'), 'git commit -m ""');
  assert.match(unquoted('echo "x" > source-code/api/a.txt'), />/);
  assert.doesNotMatch(unquoted("git commit -F- <<'EOF'\nbio > 300\nEOF"), /bio/);
});

test('gitDir: git -C dan cd di awal perintah', () => {
  assert.equal(gitDir('git -C source-code/api commit -m x', '/r'), path.resolve('/r', 'source-code/api'));
  assert.equal(gitDir('cd /r/source-code/web && git commit -m x', '/r'), path.resolve('/r/source-code/web'));
  assert.equal(gitDir('git commit -m x', '/r'), '/r');
});

test('guard-bash: commit di branch kerja service dengan pesan ber-">" lolos walau item sudah done; commit di main service ditolak', async () => {
  const root = project({ v1: true });
  const api = path.join(root, 'source-code', 'api');
  sh('git', ['add', '-A'], api); sh('git', ['commit', '-qm', 'init'], api);
  sh('git', ['checkout', '-qb', 'feat/x'], api);
  const { evaluate } = await import(pathToFileURL(path.join(root, '.claude/hooks/guard-bash.mjs')).href);
  const { loadConfig } = await import(pathToFileURL(path.join(root, '.claude/hooks/lib.mjs')).href);
  const cfg = loadConfig(root);
  const ev = (command, cwd = root) => evaluate(root, cfg, { tool_input: { command }, cwd });
  assert.equal(ev(`cd ${api} && git add src/a.js && git commit -q -m "feat: bio maks 300 (301 -> galat; > 300 ditolak)"`, api).ok, true);
  assert.equal(ev('git -C source-code/api add src/a.js && git -C source-code/api commit -m "x > y"').ok, true);
  assert.equal(ev('echo hi > source-code/api/a.txt').ok, false, 'tulis sungguhan tanpa item approved tetap ditolak');
  assert.equal(ev('bash -c "echo hi > source-code/api/a.txt"').ok, false, 'sh -c tidak lolos lewat kutip');
  sh('git', ['checkout', '-q', 'main'], api);
  assert.equal(ev('git -C source-code/api commit -m x').ok, false, 'cabang dibaca dari -C, bukan cwd root');
});

test('lessonsAsk: satu pelajaran → opsi kedua "Jangan simpan" yang tidak dipetakan ke id', async () => {
  const { SKIP_LESSON } = await import('../kernel/.claude/hooks/growth.mjs');
  const { saveLessonNaskah } = await import('../kernel/.claude/hooks/ask.mjs');
  const root = project({ v1: true });
  const la = { ids: ['P1'], question: { header: 'Pelajaran', question: 'Simpan pelajaran dari pekerjaan ini?', options: [{ label: 'Tipe bio', description: 'P1' }, { label: SKIP_LESSON, description: 'buang' }], multiSelect: true } };
  saveLessonNaskah(root, 's', la);
  const fs = await import('node:fs');
  const nk = JSON.parse(fs.readFileSync(path.join(root, '.harness/state/ask', 's.json'), 'utf8'));
  assert.deepEqual(Object.values(nk.lessons.map), ['P1']);
});

test('alreadyShown: rekap tidak ditahan bila aksi sudah ada di pesan agent', () => {
  const t = 'Belum selesai (item sesi ini) (1):\n| # | item | jenis | apa | siapa | aksi |\n|---|---|---|---|---|---|\n| 1 | bio | langkah | draft | kamu | tinjau plan.md; bila setuju ketik setuju bio |';
  assert.equal(alreadyShown(t, '| 2026-bio | standard | draft | kamu | tinjau plan.md; bila setuju ketik setuju bio |'), true);
  assert.equal(alreadyShown(t, 'AC sudah ditulis.'), false);
});
