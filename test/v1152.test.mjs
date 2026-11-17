// 1.15.2: tidy (struktur, arsip item usang, gabung item satu sesi), --apply hanya manusia, arsip tetap bisa dicari, status line +N.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { project, hx, hook, wr, rd, jr } from './helpers.mjs';

const newItem = (root, title) => { const r = hx(root, 'new', 'feature', title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const setFm = (root, slug, k, v) => { const p = `docs/work/${slug}/plan.md`; const t = rd(root, p); wr(root, p, t.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`)); };
const old = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const exists = (root, p) => fs.existsSync(path.join(root, p));

function setup() {
  const root = project({ v1: true });
  const svc = jr(root, 'harness.config.json').services[0];
  const a = newItem(root, 'Cache toggle MD01');
  const b = newItem(root, 'Hapus key Redis');
  const c = newItem(root, 'Draf lama tak tersentuh');
  const d = newItem(root, 'Sudah merged lama');
  for (const s of [a, b, c, d]) setFm(root, s, 'services', `[${svc}]`);
  setFm(root, a, 'status', 'in-progress');
  wr(root, `docs/work/${a}/plan.md`, rd(root, `docs/work/${a}/plan.md`).replace(/\s*$/, '\n\n- AC1: toggle di-cache 5 menit\n'));
  wr(root, `docs/work/${b}/plan.md`, rd(root, `docs/work/${b}/plan.md`).replace(/\s*$/, '\n\n- AC1: key integration_to_dms dihapus\n- AC2: katalog Go = Laravel\n'));
  wr(root, `docs/work/${b}/progress.md`, '# Progress\n\n## Verifikasi\n- AC1: redis-cli DEL dijalankan, hasil 1\n');
  setFm(root, c, 'updated', old(20)); setFm(root, c, 'created', old(20));
  setFm(root, d, 'status', 'merged'); setFm(root, d, 'updated', old(40));
  wr(root, '.harness/state/touched-sesi1.json', JSON.stringify({ slugs: [b, a] }));
  return { root, a, b, c, d };
}

test('tidy (rencana): item usang, grup gabung dari satu sesi, item utama = status paling jauh; tidak mengubah apa pun', () => {
  const { root, a, b, c, d } = setup();
  const j = JSON.parse(hx(root, 'tidy', '--json').stdout);
  assert.deepEqual(j.stale.map((x) => x.slug).sort(), [c, d].sort());
  assert.deepEqual(j.merge, [{ target: a, others: [b] }]);
  const out = hx(root, 'tidy').stdout;
  assert.match(out, /Rencana saja\. Terapkan: ! node \.claude\/hooks\/harness\.mjs tidy --apply/);
  for (const s of [a, b, c, d]) assert.ok(exists(root, `docs/work/${s}/plan.md`));
});

test('tidy --apply: arsip ke _archive + ARCHIVE.md; gabung memindahkan AC dan bukti dengan nomor baru; recall dan ref: tetap menemukan', () => {
  const { root, a, b, c, d } = setup();
  const r = hx(root, 'tidy', '--apply');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Selesai: 3 item diarsipkan/);
  for (const s of [b, c, d]) { assert.ok(!exists(root, `docs/work/${s}`)); assert.ok(exists(root, `docs/work/_archive/${s}/plan.md`)); }
  const plan = rd(root, `docs/work/${a}/plan.md`);
  assert.match(plan, /- AC1: toggle di-cache 5 menit/);
  assert.match(plan, new RegExp(`## Digabung dari ${b}`)); assert.match(plan, /- AC2: key integration_to_dms dihapus/); assert.match(plan, /- AC3: katalog Go = Laravel/);
  assert.match(rd(root, `docs/work/${a}/progress.md`), /- AC2: redis-cli DEL dijalankan, hasil 1/);
  assert.match(rd(root, `docs/work/_archive/${b}/plan.md`), new RegExp(`archived_reason: "digabung ke ${a}"`));
  const idx = rd(root, 'docs/memory/ARCHIVE.md');
  assert.match(idx, new RegExp(`${c} · draft · draft tidak disentuh 2\\d hari`)); assert.match(idx, new RegExp(`${d} · merged · merged 4\\d hari lalu`));
  assert.doesNotMatch(hx(root, 'open').stdout, new RegExp(c));
  const add = JSON.parse(hook(root, 'prompt.mjs', { prompt: `lihat ref:${c}` }).stdout || '{}').hookSpecificOutput?.additionalContext || '';
  assert.match(add, new RegExp(`\\[ref:${c}\\] docs/work/_archive/${c}/brief\\.md`));
  assert.match(hx(root, 'recall', 'Draf lama tak tersentuh').stdout, /_archive/);
  assert.match(hx(root, 'tidy').stdout, /Usang → diarsipkan \(0\)/);
});

test('tidy --apply dari agent ditolak guard-bash; tanpa --apply boleh', () => {
  const { root } = setup();
  const g = (cmd) => hook(root, 'guard-bash.mjs', { tool_name: 'Bash', tool_input: { command: cmd } });
  assert.equal(g('node .claude/hooks/harness.mjs tidy --apply').status, 2);
  assert.equal(g('node .claude/hooks/harness.mjs tidy').status, 0);
});

test('struktur: berkas wajib hilang, slug dari kalimat prompt, service tak dikenal dilaporkan', () => {
  const { root, a } = setup();
  fs.rmSync(path.join(root, `docs/work/${a}/progress.md`));
  const s = newItem(root, 'kerjakan resolve ini agar orang');
  setFm(root, s, 'services', '[tidak-ada]');
  const j = JSON.parse(hx(root, 'tidy', '--json').stdout).structure;
  const by = Object.fromEntries(j.map((x) => [x.slug, x.problems.join('; ')]));
  assert.match(by[a], /progress\.md tidak ada/);
  assert.match(by[s], /slug dari kalimat prompt/); assert.match(by[s], /service "tidak-ada" tidak ada di config/);
});

test('status line: "+N" untuk item terbuka lain yang disentuh sesi ini', () => {
  const { root, a } = setup();
  const r = spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { cwd: root, input: JSON.stringify({ session_id: 'sesi1' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, NO_COLOR: '1' } });
  assert.match(r.stdout, new RegExp(`${a.replace(/^\d{4}-\d{2}-\d{2}-/, '')} \\+1 {2}● in-progress`));
});
