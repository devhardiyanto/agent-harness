// UserPromptSubmit: persetujuan plan oleh MANUSIA. Prompt "/harness:approve <slug>" diketik user;
// agent tidak bisa memalsukannya. Hook inilah yang menulis status: approved.
import fs from 'node:fs';
import {
  readStdinJson, projectRoot, loadConfig, resolveSlug, readItem, checkTransition, setFmKey, context, audit, contextWarning, createQuick,
} from './lib.mjs';
import { spawnSync } from 'node:child_process';
import { verifyService, approveProposal, formatLint } from './knowledge.mjs';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
const prompt = String(payload.prompt || '');
const m = /^\s*\/(?:harness:)?approve\s+([\w.\-]+)/i.exec(prompt);
// /harness:knowledge verify <svc> dan /harness:knowledge patterns <slug> <ids> (bentuk lama tanpa kata "knowledge" tetap diterima untuk kompatibilitas)
const mv = /^\s*\/(?:harness:)?(?:knowledge\s+)?verify\s+([\w.\-]+)\s*$/i.exec(prompt);
const mp = /^\s*\/(?:harness:)?(?:knowledge\s+)?patterns\s+([\w.\-]+)\s+(all|P\d+(?:\s*,\s*P\d+)*)\s*$/i.exec(prompt);
const mq = /^\s*\/(?:harness:)?quick(?:\s+([\s\S]*))?$/i.exec(prompt);
if (!m && !mv && !mp && !mq) {
  // Peringatan ambang konteks juga di sini (bukan hanya setelah tool): murah, sekali per prompt.
  try { const w = contextWarning(root, cfg, payload); if (w) context('UserPromptSubmit', w); } catch { /* abaikan */ }
  process.exit(0);
}

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] ${mv ? 'verify' : mp ? 'patterns' : mq ? 'quick' : 'approve'} ditolak: ${reason}` }));
  process.exit(0);
};
const who0 = () => spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';

// /harness:quick <permintaan>: ketikan manusia = persetujuan. Hook membuat item lajur quick berstatus approved (satu service, batas file di config).
if (mq) {
  const r = createQuick(root, mq[1], who0());
  if (!r.ok) block(r.reason);
  audit(root, { event: 'quick', session: payload.session_id, slug: r.slug, by: who0() });
  context('UserPromptSubmit', `[harness] Item quick ${r.slug} dibuat dan APPROVED oleh ${who0()} (ditulis hook). Kerjakan di sesi ini: baca knowledge service yang kena, ubah minimal (maks ${cfg.quick.max_files} file, satu service, bukan skema), tulis bukti AC di progress.md, lalu "node .claude/hooks/harness.mjs set-status ${r.slug} done". Melebihi batas → "harness.mjs promote ${r.slug}". Balas ≤3 baris saat selesai: apa berubah dan "/harness:ship ${r.slug}".`);
  process.exit(0);
}
// /harness:knowledge verify <svc>: knowledge draft → verified, hanya bila lint bersih. Ditulis hook, bukan agent.
if (mv) {
  const svc = mv[1];
  if (!(cfg.services || []).includes(svc)) block(`service "${svc}" tidak ada di harness.config.json.`);
  const r = verifyService(root, cfg, svc, who0());
  if (!r.ok) block(`knowledge ${svc} tidak lolos lint (${r.lint.errors} ERROR). Jalankan: node .claude/hooks/harness.mjs lint-knowledge ${svc}\n${formatLint([r.lint], { max: 12 })}`);
  audit(root, { event: 'verify-knowledge', session: payload.session_id, service: svc, by: who0() });
  context('UserPromptSubmit', `[harness] Knowledge ${svc} sekarang VERIFIED oleh ${who0()} (ditulis hook): ${r.changed.join(', ')}. Balas satu baris konfirmasi saja.`);
  process.exit(0);
}
// /harness:knowledge patterns <slug> <P1,P3|all>: menerapkan usulan pola yang disetujui manusia ke patterns.md.
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
