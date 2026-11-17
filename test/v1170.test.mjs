// 1.17.0: spesialis per bidang. Bidang dari ucapan / config / tebakan nama service; status line; instruksi eksekusi; enforce opsional.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { project, hx, hook, wr, rd, jr } from './helpers.mjs';
import { guessBidang, bidangFromPrompt, itemBidang, execPlan } from '../kernel/.claude/hooks/bidang.mjs';

const add = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || '' : '');
const cfg0 = { bidang: { enabled: true, map: { 'lm-cms': 'frontend' }, fallback_agent: 'implementer' } };

test('tebakan dan ucapan', () => {
  assert.equal(guessBidang('event-backend'), 'backend'); assert.equal(guessBidang('event-frontend'), 'frontend');
  assert.equal(guessBidang('ce-microservices-go'), 'backend'); assert.equal(guessBidang('infra-k8s'), 'devops'); assert.equal(guessBidang('xyz'), null);
  assert.equal(bidangFromPrompt('backend: tambah endpoint export'), 'backend'); assert.equal(bidangFromPrompt('fe - perbesar tombol'), 'frontend');
  assert.equal(bidangFromPrompt('ini frontend saja'), 'frontend'); assert.equal(bidangFromPrompt('minta DBA cek migrasi'), 'dba');
  assert.equal(bidangFromPrompt('perbaiki backend nanti'), null, 'kata di tengah kalimat bukan penanda');
});

test('itemBidang: frontmatter menang, lalu config, lalu tebakan; execPlan dba lebih dulu untuk schema, cadangan implementer', () => {
  const it = (fm, type = 'feature') => ({ fm, type });
  assert.deepEqual(itemBidang(cfg0, it({ services: ['lm-cms', 'event-backend'] })).map((r) => [r.svc, r.bidang, r.sumber]), [['lm-cms', 'frontend', 'config'], ['event-backend', 'backend', 'tebakan']]);
  assert.deepEqual(itemBidang(cfg0, it({ services: ['xyz'], bidang: ['devops'] })).map((r) => r.bidang), ['devops']);
  assert.deepEqual(execPlan(cfg0, it({ services: ['event-backend', 'xyz'] }, 'schema')).map((x) => x.agent), ['dba', 'backend', 'implementer']);
});

test('ucapan "backend: …" menandai bidang sesi; status line menampilkannya; "kerjakan" menyebut spesialis per service', () => {
  const root = project({ v1: true });
  let t = add(hook(root, 'prompt.mjs', { prompt: 'backend: tambah endpoint export pendaftar' }));
  assert.match(t, /Bidang pekerjaan: backend \(dari ucapan user\)[\s\S]*bidang: \[backend\]/);
  const sl = spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { cwd: root, input: JSON.stringify({ session_id: 's' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, NO_COLOR: '1' } });
  assert.match(sl.stdout, /\n▌backend\n?$/);
  const slug = hx(root, 'new', 'feature', 'Export pendaftar').stdout.trim().split('/').pop();
  const svcs = jr(root, 'harness.config.json').services;
  const p = `docs/work/${slug}/plan.md`;
  wr(root, p, rd(root, p).replace('status: draft', 'status: approved').replace('services: []', `services: [${svcs.join(', ')}]`));
  t = add(hook(root, 'prompt.mjs', { prompt: `kerjakan ${slug}` }));
  assert.match(t, /Eksekusi oleh spesialis/);
  assert.match(t, /agent `backend` untuk api/); assert.match(t, /agent `frontend` untuk web/);
  assert.match(hx(root, 'bidang').stdout, /\| api \| backend \| tebakan \| backend \|/);
});

test('bidang.enforce (bawaan mati): edit sesi utama ditolak hanya bila dinyalakan; subagent (agent_type) diizinkan', () => {
  const root = project({ v1: true });
  const svc = jr(root, 'harness.config.json').services[0];
  const slug = hx(root, 'new', 'feature', 'Ubah api').stdout.trim().split('/').pop();
  const p = `docs/work/${slug}/plan.md`;
  wr(root, p, rd(root, p).replace('status: draft', 'status: approved').replace('services: []', `services: [${svc}]`));
  const f = path.join(root, 'source-code', svc, 'index.js');
  const ed = (extra = {}) => hook(root, 'gate.mjs', { tool_name: 'Write', tool_input: { file_path: f, content: 'x' }, ...extra });
  assert.equal(ed().status, 0, 'bawaan: tidak dipaksakan');
  const c = jr(root, 'harness.config.json'); c.bidang.enforce = true; wr(root, 'harness.config.json', JSON.stringify(c));
  const r = ed(); assert.equal(r.status, 2); assert.match(r.stderr + r.stdout, /Panggil agent `backend`/);
  assert.equal(ed({ agent_type: 'backend' }).status, 0);
});
