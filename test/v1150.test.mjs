// 1.15.0 (M1): status line harness, gaya keluaran proyek, saran tanpa /harness:, tiga kalimat pendek baru, skrip uji M0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { project, hx, hook, wr, rd, jr } from './helpers.mjs';
import { render, saveSessionName } from '../kernel/.claude/hooks/statusline.mjs';

const add = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || '' : '');
const newItem = (root, title, type = 'feature') => { const r = hx(root, 'new', type, title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const sline = (root, payload, env = {}) => spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { cwd: root, input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env } });
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

test('render: tanpa item satu baris; dengan item dua baris; mono tanpa ANSI; dipotong sesuai lebar', () => {
  assert.equal(render({ root: 'event', item: null, inbox: 0, lessons: 0, ctx: null }, { theme: 'mono' }), '▌event  tidak ada item aktif · ketik permintaanmu');
  const d = { root: 'event', item: { slug: 'pub-01', status: 'in-progress', quick: false, ac: [3, 5], checks: 'pass', decisions: 1 }, inbox: 2, lessons: 14, ctx: 41 };
  assert.equal(render(d, { theme: 'mono' }), '▌event  pub-01  ● in-progress  AC 3/5  checks ✓\n▌1 keputusan · 14 pelajaran · konteks 41%');
  const col = render(d, { theme: 'tenang' });
  assert.match(col, /\x1b\[/); assert.equal(plain(col), render(d, { theme: 'mono' }));
  assert.equal(plain(render(d, { theme: 'tidak-ada' })), render(d, { theme: 'mono' }), 'tema tak dikenal = tenang');
  for (const l of render(d, { theme: 'mono', max: 30 }).split('\n')) assert.ok([...l].length <= 31, l);
});

test('statusline.mjs: membaca item yang disentuh sesi, menyimpan nama sesi, NO_COLOR dan tui.statusline:false dihormati, galat tidak mencetak stack', () => {
  const root = project({ v1: true });
  let r = sline(root, { session_id: 's', workspace: { project_dir: root }, context_window: { used_percentage: 12.7 } }, { NO_COLOR: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `▌${path.basename(root)}  tidak ada item aktif · ketik permintaanmu\n▌konteks 12%\n`);
  const slug = newItem(root, 'Filter kota di listing');
  wr(root, `.harness/state/touched-s.json`, JSON.stringify({ slugs: [slug] }));
  r = sline(root, { session_id: 's', session_name: 'Loving Dirac zepqcu!', workspace: { project_dir: root } }, { NO_COLOR: '1' });
  assert.match(r.stdout, /filter-kota-di-listing {2}● draft/);
  assert.doesNotMatch(r.stdout, /\x1b\[/);
  assert.equal(rd(root, '.harness/state/session-name').trim(), 'loving-dirac-zepqcu');
  assert.equal(hx(root, 'session-name').stdout.trim(), 'loving-dirac-zepqcu');
  assert.match(sline(root, { session_id: 's' }).stdout, /\x1b\[/, 'bawaan berwarna');
  const cfg = jr(root, 'harness.config.json'); cfg.tui.statusline = false; wr(root, 'harness.config.json', JSON.stringify(cfg));
  assert.equal(sline(root, { session_id: 's' }).stdout, '');
  wr(root, 'harness.config.json', '{ rusak');
  r = sline(root, { session_id: 's' });
  assert.equal(r.status, 0); assert.doesNotMatch(r.stdout + r.stderr, /at .*\.mjs/);
});

test('saveSessionName: nama terlalu pendek atau kosong tidak ditulis', () => {
  const root = project({ v1: true });
  assert.equal(saveSessionName(root, ''), null); assert.equal(saveSessionName(root, '!'), null);
  assert.equal(fs.existsSync(path.join(root, '.harness/state/session-name')), false);
});

test('pasang: settings.json memuat statusLine dan outputStyle; gaya keluaran dan config tui ikut terpasang', () => {
  const root = project({ v1: true });
  const st = jr(root, '.claude/settings.json');
  assert.deepEqual(st.statusLine, { type: 'command', command: 'node .claude/hooks/statusline.mjs', padding: 0, refreshInterval: 5 });
  assert.equal(st.outputStyle, 'harness');
  assert.match(rd(root, '.claude/output-styles/harness.md'), /^---\nname: harness\n[\s\S]*keep-coding-instructions: true/);
  assert.deepEqual(jr(root, 'harness.config.json').tui, { statusline: true, theme: 'tenang', max_width: 120, ask: true, menu: true });
});

test('keluaran kode tidak menyarankan /harness: selain init dan update (sumber + keluaran next/open/decide)', () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'kernel', '.claude', 'hooks');
  // Yang boleh: perintah internal hasil intent, pengurai slash, laporan pilot tentang slash yang dipakai user.
  const ALLOW = { 'intent.mjs': /command: `\/harness:/, 'prompt.mjs': /\/harness:\(\[\\w-\]\+\)|akan dihapus di 2\.0|replace\('\/harness:'/, 'pilot.mjs': /./ };
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
      const code = l.replace(/^\s*\/\/.*$/, '').split(' // ')[0];
      for (const m of code.matchAll(/\/harness:([a-z-]+)/g)) {
        if (['init', 'update', 'allow-secret'].includes(m[1])) continue;
        if (ALLOW[f] && ALLOW[f].test(code)) continue;
        bad.push(`${f}:${i + 1} ${m[0]}`);
      }
    });
  }
  assert.deepEqual(bad, []);
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Exporters');
  for (const c of [['next'], ['open'], ['decide', slug]]) assert.doesNotMatch(hx(root, ...c).stdout, /\/harness:(?!init|update)/, c.join(' '));
});

test('kalimat pendek baru: "kerjakan <slug>" memicu skill build; "verifikasi knowledge <svc>" dan "terapkan pola" dipetakan ke gerbang yang sama', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Exporters');
  const short = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  assert.match(add(hook(root, 'prompt.mjs', { prompt: `kerjakan ${short}` })), new RegExp(`skill harness:build untuk ${slug}`));
  assert.equal(add(hook(root, 'prompt.mjs', { prompt: 'kerjakan sesuatu-yang-tidak-ada' })), '', 'slug tak dikenal = prompt biasa');
  const svc = jr(root, 'harness.config.json').services[0];
  const a = hook(root, 'prompt.mjs', { prompt: `verifikasi knowledge ${svc}` }).stdout;
  const b = hook(root, 'prompt.mjs', { prompt: `/harness:knowledge verify ${svc}` }).stdout;
  assert.ok(a.length > 0); assert.equal(JSON.parse(a).decision, JSON.parse(b).decision, 'hasil sama dengan bentuk slash');
  assert.equal(add(hook(root, 'prompt.mjs', { prompt: 'verifikasi knowledge bukan-service' })), '');
});

test('spike.mjs (uji M0): on mencadangkan settings.local.json, log tidak menyimpan isi tool_input, off mengembalikan semuanya', () => {
  const root = project({ v1: true });
  const sp = (args, input) => spawnSync('node', [path.join(root, '.claude/hooks/spike.mjs'), ...args], { cwd: root, input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  wr(root, '.claude/settings.local.json', '{"permissions":{"allow":["Bash(ls)"]}}');
  assert.equal(sp(['on']).status, 0);
  const loc = jr(root, '.claude/settings.local.json');
  assert.equal(loc.permissions.allow[0], 'Bash(ls)'); assert.equal(loc.hooks.PostToolUse[0].matcher, 'AskUserQuestion'); assert.match(loc.statusLine.command, /spike\.mjs statusline/);
  assert.equal(sp(['on']).status, 1, 'tidak menimpa cadangan');
  sp(['log', 'post-ask'], JSON.stringify({ tool_name: 'AskUserQuestion', tool_response: { answers: { 'Warna?': 'Biru' } } }));
  sp(['log', 'pre-edit'], JSON.stringify({ tool_name: 'Edit', tool_input: { content: 'RAHASIA-ISI' }, agent_type: 'general-purpose' }));
  assert.match(sp(['statusline'], JSON.stringify({ session_name: 'loving-dirac' })).stdout, /status line proyek tampil · nama sesi: loving-dirac/);
  assert.doesNotMatch(rd(root, '.harness/state/spike/log.jsonl'), /RAHASIA-ISI/);
  const rep = sp(['report']).stdout;
  assert.match(rep, /\| 1 \| hook menerima jawaban pemilih \| YA \|[^\n]*Biru/); assert.match(rep, /agent_type/); assert.match(rep, /\| 3b \|[^\n]*\| YA \| loving-dirac/);
  assert.equal(sp(['off']).status, 0);
  assert.deepEqual(jr(root, '.claude/settings.local.json'), { permissions: { allow: ['Bash(ls)'] } });
  assert.equal(fs.existsSync(path.join(root, '.claude/skills/uji-tersembunyi')), false);
});
