// UserPromptSubmit: persetujuan plan oleh MANUSIA. Prompt "/harness:approve <slug>" diketik user;
// agent tidak bisa memalsukannya. Hook inilah yang menulis status: approved.
import fs from 'node:fs';
import {
  readStdinJson, projectRoot, loadConfig, resolveSlug, readItem, checkTransition, setFmKey, context, audit, contextWarning,
} from './lib.mjs';
import { spawnSync } from 'node:child_process';
import { verifyService, approveProposal, formatLint } from './knowledge.mjs';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
const prompt = String(payload.prompt || '');
const m = /^\s*\/(?:harness:)?approve\s+([\w.\-]+)/i.exec(prompt);
const mv = /^\s*\/(?:harness:)?verify\s+([\w.\-]+)\s*$/i.exec(prompt);
const mp = /^\s*\/(?:harness:)?patterns\s+([\w.\-]+)\s+(all|P\d+(?:\s*,\s*P\d+)*)\s*$/i.exec(prompt);
if (!m && !mv && !mp) {
  // Peringatan ambang konteks juga di sini (bukan hanya setelah tool): murah, sekali per prompt.
  try { const w = contextWarning(root, cfg, payload); if (w) context('UserPromptSubmit', w); } catch { /* abaikan */ }
  process.exit(0);
}

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] ${mv ? 'verify' : mp ? 'patterns' : 'approve'} ditolak: ${reason}` }));
  process.exit(0);
};
const who0 = () => spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';

// /harness:verify <svc>: knowledge draft → verified, hanya bila lint bersih. Ditulis hook, bukan agent.
if (mv) {
  const svc = mv[1];
  if (!(cfg.services || []).includes(svc)) block(`service "${svc}" tidak ada di harness.config.json.`);
  const r = verifyService(root, cfg, svc, who0());
  if (!r.ok) block(`knowledge ${svc} tidak lolos lint (${r.lint.errors} ERROR). Jalankan: node .claude/hooks/harness.mjs lint-knowledge ${svc}\n${formatLint([r.lint], { max: 12 })}`);
  audit(root, { event: 'verify-knowledge', session: payload.session_id, service: svc, by: who0() });
  context('UserPromptSubmit', `[harness] Knowledge ${svc} sekarang VERIFIED oleh ${who0()} (ditulis hook): ${r.changed.join(', ')}. Balas satu baris konfirmasi saja.`);
  process.exit(0);
}
// /harness:patterns <slug> <P1,P3|all>: menerapkan usulan pola yang disetujui manusia ke patterns.md.
if (mp) {
  const ps = resolveSlug(root, mp[1]);
  if (!ps) block(`work item "${mp[1]}" tidak ditemukan / ambigu.`);
  const ids = mp[2].toLowerCase() === 'all' ? 'all' : mp[2].split(',').map((x) => x.trim().toUpperCase());
  const r = approveProposal(root, cfg, ps, ids, who0());
  if (!r.ok) block(`\n- ${r.problems.join('\n- ')}`);
  audit(root, { event: 'patterns-approve', session: payload.session_id, slug: ps, by: who0(), applied: r.applied.join(',') });
  context('UserPromptSubmit', `[harness] Usulan pola disetujui ${who0()} dan DITERAPKAN oleh hook ke patterns.md: ${r.applied.join(', ')}. Balas satu baris konfirmasi; jangan mengedit patterns.md lagi untuk ini.`);
  process.exit(0);
}

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
