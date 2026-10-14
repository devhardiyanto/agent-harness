// SessionStart: suntik ringkasan work item aktif + pengingat inti. Cepat dan kecil.
import fs from 'node:fs';
import path from 'node:path';
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
if (!fs.existsSync(path.join(root, 'docs', '_map.md'))) lines.push('PERINGATAN: docs/_map.md belum ada. Jalankan /harness:onboard.');
lines.push('Aturan: kode di service hanya boleh diedit lewat work item approved. Mulai dari /harness:impact. Balasan chat ≤5 baris + path file.');
if (payload.source === 'compact' || payload.source === 'resume') lines.push('Sesi dilanjutkan: baca progress.md work item in-progress sebelum bertindak.');
context('SessionStart', lines.join('\n'));
