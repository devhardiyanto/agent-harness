// 1.18.0: rujukan otomatis (hanya pekerjaan selesai), hitungan pemakaian, pelajaran lewat pemilih, laporan growth, playbook per bidang.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { project, hx, hook, wr, rd, jr } from './helpers.mjs';

const add = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || '' : '');
const PB = (name, b) => `---\nname: ${name}\ndescription: Menyembunyikan entitas dari listing publik lewat scope.\n${b ? `bidang: ${b}\n` : ''}---\n## Langkah\n- pakai scope listedPublicly\n## Verifikasi\n- test listing\n`;

test('rujukan otomatis: summary item selesai dan playbook muncul (maks 2), brief item terbuka tidak; pemakaian dihitung', () => {
  const root = project({ v1: true });
  wr(root, 'docs/work/2026-10-01-sembunyikan-org/summary.md', '# Ringkasan\nStatistik karcix membaca view statistik, bukan tabel event. Sembunyikan event organisasi lewat scope listedPublicly.\n');
  wr(root, 'docs/work/2026-10-01-sembunyikan-org/plan.md', '---\nstatus: merged\n---\n');
  wr(root, 'docs/memory/playbooks/sembunyikan-listing.md', PB('sembunyikan-listing', 'backend'));
  const t = add(hook(root, 'prompt.mjs', { prompt: 'tolong sembunyikan event draft dari statistik dan listing' }));
  assert.match(t, /Rujukan dari pekerjaan lama/);
  assert.match(t, /ref:2026-10-01-sembunyikan-org/);
  assert.ok((t.match(/^- /gm) || []).length <= 2);
  const u = jr(root, '.harness/state/usage.json');
  assert.equal(u['ref:2026-10-01-sembunyikan-org'].n, 1);
  assert.equal(add(hook(root, 'prompt.mjs', { prompt: 'sisa' })).includes('Rujukan dari pekerjaan lama'), false, 'perintah pendek tidak memicu rujukan');
});

test('growth: laporan umur, pelajaran, playbook per bidang; status line menampilkan umur', () => {
  const root = project({ v1: true });
  wr(root, 'docs/work/2026-10-01-a/plan.md', '---\nstatus: merged\n---\n');
  wr(root, 'docs/memory/playbooks/sembunyikan-listing.md', PB('sembunyikan-listing', 'backend'));
  wr(root, 'docs/memory/playbooks/umum-satu.md', PB('umum-satu'));
  const j = JSON.parse(hx(root, 'growth', '--json').stdout);
  assert.ok(j.age >= 40); assert.deepEqual(j.byBidang, { backend: 1, umum: 1 }); assert.equal(j.merged, 1);
  assert.match(hx(root, 'growth').stdout, /umur root/);
  const sl = spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { cwd: root, input: JSON.stringify({ session_id: 's' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, NO_COLOR: '1' } });
  assert.match(sl.stdout, /umur \d+ h/);
});

test('pelajaran lewat pemilih: item done mengantre usulan berlabel bidang; Stop memberi naskah multiSelect; pilihan disimpan, sisanya dibuang', () => {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'Sembunyikan event').stdout.trim().split('/').pop();
  wr(root, `docs/work/${slug}/progress.md`, '# P\n\n## Decision log\n- statistik membaca view, bukan tabel event\n- scope listedPublicly dipakai di tiga tempat\n');
  const p = `docs/work/${slug}/plan.md`;
  wr(root, p, rd(root, p).replace('---\ntitle', '---\nbidang: [backend]\ntitle'));
  // jalankan lewat CLI yang sama dengan transisi done: set-status memicu learnFrom; di sini cukup memanggil modul
  const u = (f) => pathToFileURL(path.join(root, '.claude/hooks', f)).href; // Windows: import() butuh URL file://, bukan C:\\...
  const r0 = spawnSync('node', ['-e', `import('${u('memory.mjs')}').then(async (m) => { const l = await import('${u('lib.mjs')}'); const cfg = l.loadConfig(process.argv[1]); const it = l.readItem(process.argv[1], process.argv[2]); console.log(JSON.stringify(m.learnFrom(process.argv[1], cfg, it, ['- statistik membaca view, bukan tabel event', '- scope listedPublicly dipakai di tiga tempat']))); })`, root, slug], { encoding: 'utf8' });
  assert.equal(r0.status, 0, r0.stderr);
  assert.match(rd(root, 'docs/memory/pending.md'), /\[backend\] statistik membaca view/);
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  const st = hook(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'Belum selesai (1)' });
  assert.equal(st.status, 2); assert.match(st.stderr, /"multiSelect":true/);
  const js = JSON.parse(st.stderr.slice(st.stderr.indexOf('{"questions"')).split('\n')[0]);
  const first = js.questions[0].options[0].label;
  const r = hook(root, 'ask.mjs', { hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: js, tool_response: { answers: { [js.questions[0].question]: first } } });
  assert.match(add(r), /pelajaran disimpan: P1[\s\S]*pelajaran dibuang: P2/);
  assert.match(rd(root, 'docs/memory/MEMORY.md'), /\[backend\] statistik membaca view/);
  assert.doesNotMatch(rd(root, 'docs/memory/pending.md'), /^- P2/m);
  assert.notEqual(hook(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'Belum selesai (1)' }).stderr.includes('"multiSelect":true'), true, 'tidak ditanya ulang');
});

test('kerjakan: playbook berlabel bidang disebut untuk spesialisnya', () => {
  const root = project({ v1: true });
  wr(root, 'docs/memory/playbooks/sembunyikan-listing.md', PB('sembunyikan-listing', 'backend'));
  const slug = hx(root, 'new', 'feature', 'Ubah api').stdout.trim().split('/').pop();
  const p = `docs/work/${slug}/plan.md`;
  wr(root, p, rd(root, p).replace('status: draft', 'status: approved').replace('services: []', 'services: [api]'));
  assert.match(add(hook(root, 'prompt.mjs', { prompt: `kerjakan ${slug}` })), /agent `backend` untuk api \(playbook backend: sembunyikan-listing\)/);
});
