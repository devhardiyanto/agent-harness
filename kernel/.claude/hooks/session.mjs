// SessionStart: suntik ringkasan work item aktif + pengingat inti. Cepat dan kecil.
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeStatusAll, knowledgeCfg } from './knowledge.mjs';
import { readStdinJson, projectRoot, loadConfig, listItems, context, audit } from './lib.mjs';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
audit(root, { event: 'SessionStart', session: payload.session_id, source: payload.source });

const items = listItems(root).filter((i) => i.status !== 'merged');
const lines = [`[harness v${cfg.harness_version}] project: ${cfg.project || path.basename(root)} · root branch: ${cfg.root_branch}`];
if (items.length) {
  lines.push('Work item terbuka:');
  for (const i of items.slice(0, 12)) lines.push(`- ${i.slug} · ${i.type} · ${i.status} · services: ${i.services.join(',') || '-'}`);
  if (items.length > 12) lines.push(`- ... +${items.length - 12} lagi (node .claude/hooks/harness.mjs list)`);
} else lines.push('Belum ada work item terbuka.');
if (!fs.existsSync(path.join(root, 'docs', '_map.md'))) lines.push('PERINGATAN: docs/_map.md belum ada. Jalankan /harness:init.');
// Kedaluwarsa knowledge vs baseline: git lokal saja, nol token, tanpa jaringan. Gagal = diam.
try {
  const rows = knowledgeStatusAll(root, cfg);
  const missing = rows.filter((r) => r.state === 'missing').map((r) => r.service);
  const stale = rows.filter((r) => r.state === 'stale' || r.state === 'behind').sort((a, b) => b.behind - a.behind);
  const bad = rows.filter((r) => r.state === 'unknown-commit').map((r) => r.service);
  const drafts = rows.filter((r) => r.status === 'draft').map((r) => r.service);
  if (missing.length) lines.push(`Knowledge belum ada: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` (+${missing.length - 8})` : ''} → /harness:init`);
  const heavy = stale.filter((r) => r.state === 'stale');
  if (heavy.length) lines.push(`Knowledge tertinggal dari baseline: ${heavy.slice(0, 6).map((r) => `${r.service} (+${r.behind} commit)`).join(', ')}${heavy.length > 6 ? ` (+${heavy.length - 6})` : ''} → /harness:knowledge refresh <svc>`);
  else if (stale.length) lines.push(`Knowledge sedikit tertinggal: ${stale.slice(0, 6).map((r) => `${r.service} (+${r.behind})`).join(', ')} (di bawah ambang ${knowledgeCfg(cfg).stale_warn_commits}).`);
  if (bad.length) lines.push(`Knowledge ${bad.join(', ')}: source_commit tidak dikenal repo → /harness:knowledge refresh.`);
  if (drafts.length) lines.push(`Knowledge berstatus draft (belum diverifikasi manusia): ${drafts.slice(0, 8).join(', ')} → node .claude/hooks/harness.mjs knowledge-sample <svc>, lalu /harness:knowledge verify <svc>.`);
} catch { /* abaikan */ }
lines.push('Aturan: kode di service hanya boleh diedit lewat work item approved. Mulai dari /harness:impact. Balasan chat ≤5 baris + path file.');
if (payload.source === 'compact' || payload.source === 'resume') lines.push('Sesi dilanjutkan: baca progress.md work item in-progress sebelum bertindak.');
context('SessionStart', lines.join('\n'));
