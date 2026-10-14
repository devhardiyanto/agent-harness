// UserPromptSubmit: persetujuan plan oleh MANUSIA. Prompt "/harness:approve <slug>" diketik user;
// agent tidak bisa memalsukannya. Hook inilah yang menulis status: approved.
import fs from 'node:fs';
import {
  readStdinJson, projectRoot, loadConfig, resolveSlug, readItem, checkTransition, setFmKey, context, audit,
} from './lib.mjs';
import { spawnSync } from 'node:child_process';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
const m = /^\s*\/(?:harness:)?approve\s+([\w.\-]+)/i.exec(String(payload.prompt || ''));
if (!m) process.exit(0);

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] approve ditolak: ${reason}` }));
  process.exit(0);
};
const slug = resolveSlug(root, m[1]);
if (!slug) block(`work item "${m[1]}" tidak ditemukan / ambigu. Lihat: node .claude/hooks/harness.mjs list`);
const item = readItem(root, slug);
const problems = checkTransition(root, cfg, item, 'approved', { actor: 'human' });
if (problems.length) block(`\n- ${problems.join('\n- ')}`);

const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
let t = fs.readFileSync(item.planPath, 'utf8');
t = setFmKey(t, 'status', 'approved');
t = setFmKey(t, 'approved_at', new Date().toISOString());
t = setFmKey(t, 'approved_by', who);
fs.writeFileSync(item.planPath, t);
audit(root, { event: 'approve', session: payload.session_id, slug, by: who });
context('UserPromptSubmit', `[harness] Plan ${slug} sekarang APPROVED oleh ${who} (ditulis hook, bukan agent). ` +
  'Balas maksimal 2 baris: konfirmasi dan instruksi membuka sesi baru lalu menjalankan "/harness:build ' + slug + '". Jangan mulai implementasi di sesi planning ini.');
