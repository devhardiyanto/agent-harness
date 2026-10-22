// PreToolUse (Edit|Write|MultiEdit|NotebookEdit|Read): gerbang 1, gerbang 2 (via transisi plan.md),
// proteksi file harness, schema, dan secret. Exit 2 = blokir.
import fs from 'node:fs';
import path from 'node:path';
import {
  readStdinJson, projectRoot, loadConfig, relPath, matchAny, serviceOf, activeItems, coversService,
  splitFrontmatter, readItem, checkTransition, findSecret, SECRET_FILE, deny, STATUSES,
  isMain,
} from './lib.mjs';
import { proposalStatuses } from './knowledge.mjs';

function incoming(tool, input) {
  if (tool === 'Write') return { full: input.content ?? '' };
  if (tool === 'NotebookEdit') return { snippets: [input.new_source ?? ''] };
  if (tool === 'MultiEdit') return { edits: input.edits || [] };
  return { edits: [{ old_string: input.old_string, new_string: input.new_string, replace_all: input.replace_all }] };
}
function snippetsOf(inc) {
  if (inc.full !== undefined) return [inc.full];
  if (inc.snippets) return inc.snippets;
  return (inc.edits || []).map((e) => e.new_string ?? '');
}
function simulate(current, inc) {
  if (inc.full !== undefined) return inc.full;
  let t = current;
  for (const e of inc.edits || []) {
    if (e.old_string == null) continue;
    t = e.replace_all ? t.split(e.old_string).join(e.new_string ?? '') : t.replace(e.old_string, () => e.new_string ?? '');
  }
  return t;
}
const stripVolatile = (body) => body;
function fmStripped(text) {
  const { raw, body } = splitFrontmatter(text);
  const keep = raw.split(/\r?\n/).filter((l) => !/^(status|pr|updated|approved_at|approved_by|plane_id):/.test(l)).join('\n');
  return keep + '\n--\n' + stripVolatile(body);
}

export function evaluate(root, cfg, payload) {
  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const file = input.file_path || input.notebook_path || '';
  const rel = relPath(root, file);
  const fail = (reason) => ({ ok: false, reason });
  if (!rel) return { ok: true };

  // 1. baca file rahasia
  if (tool === 'Read') {
    if (SECRET_FILE.test(rel)) return fail(`membaca ${rel} dilarang (file rahasia). Minta user menyebutkan nama variabel, bukan nilainya.`);
    return { ok: true };
  }

  // 2. file harness dilindungi
  if (!process.env.HARNESS_ADMIN && matchAny(cfg.protected_paths, rel)) {
    return fail(`${rel} adalah file harness yang dilindungi. Ubah manual di luar sesi agent (atau set HARNESS_ADMIN=1 saat menjalankan claude).`);
  }
  if (SECRET_FILE.test(rel) && !/\.(example|sample|template)$/.test(rel)) return fail(`menulis ${rel} dilarang (file rahasia).`);

  // 3. secret literal di konten
  const inc = incoming(tool, input);
  for (const s of snippetsOf(inc)) {
    const hit = findSecret(s);
    if (hit) return fail(`konten terdeteksi memuat ${hit}. Pakai variabel lingkungan / secret manager. (Tambahkan "harness:allow-secret" di baris itu hanya bila itu data uji palsu.)`);
  }

  // 4. plan.md: transisi status + beku setelah approved
  const pm = /^docs\/work\/([^/]+)\/plan\.md$/.exec(rel);
  if (pm) {
    const slug = pm[1];
    const abs = path.resolve(root, rel);
    const exists = fs.existsSync(abs);
    const current = exists ? fs.readFileSync(abs, 'utf8') : '';
    const next = simulate(current, inc);
    const nextFm = splitFrontmatter(next).fm;
    const toStatus = nextFm.status || 'draft';
    if (!STATUSES.includes(toStatus)) return fail(`status "${toStatus}" tidak dikenal.`);
    if (!exists) {
      if (toStatus !== 'draft') return fail('plan.md baru harus berstatus draft.');
      return { ok: true };
    }
    const item = readItem(root, slug);
    if (item && item.status !== 'draft' && toStatus === item.status && fmStripped(current) !== fmStripped(next)) {
      return fail(`plan ${slug} sudah ${item.status}; isinya beku. Untuk merevisi: "node .claude/hooks/harness.mjs reopen ${slug}" (status kembali draft, perlu /harness:approve lagi).`);
    }
    if (item && toStatus !== item.status) {
      if (item.status !== 'draft' && fmStripped(current) !== fmStripped(next)) return fail('ubah status dan isi plan dalam edit terpisah.');
      const problems = checkTransition(root, cfg, { ...item, status: item.status, body: item.body }, toStatus, { actor: 'agent' });
      if (problems.length) return fail(`transisi ${item.status} → ${toStatus} ditolak:\n- ${problems.join('\n- ')}`);
    }
    return { ok: true };
  }

  // 4b. knowledge: status verified hanya oleh manusia; isi verified tidak diubah agent tanpa turun ke draft
  const km = /^docs\/knowledge\/([^/]+)\/(summary|patterns)\.md$/.exec(rel);
  if (km) {
    const abs = path.resolve(root, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const next = simulate(current, inc);
    const c = splitFrontmatter(current); const n = splitFrontmatter(next);
    const cs = c.fm.status || null; const ns = n.fm.status || 'draft';
    if (ns === 'verified' && cs !== 'verified') return fail(`status "verified" hanya oleh manusia: ketik /harness:verify ${km[1]} (atau "! node .claude/hooks/harness.mjs verify-knowledge ${km[1]}"). Tulis sebagai draft.`);
    if (cs === 'verified' && ns === 'verified' && (c.body !== n.body || c.fm.source_commit !== n.fm.source_commit)) {
      return fail(`${rel} berstatus verified (diverifikasi manusia). Perubahan oleh agent harus menurunkan status ke draft dalam edit yang sama; verifikasi ulang dengan /harness:verify ${km[1]}.`);
    }
    return { ok: true };
  }
  // 4c. usulan pola: agent hanya boleh menulis "proposed"; approved/applied ditulis hook saat manusia menyetujui
  const pp = /^docs\/work\/([^/]+)\/patterns-proposal\.md$/.exec(rel);
  if (pp) {
    const abs = path.resolve(root, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const before = proposalStatuses(current); const after = proposalStatuses(simulate(current, inc));
    for (const [id, st] of Object.entries(after)) {
      if (st !== 'proposed' && before[id] !== st) return fail(`${id}: status "${st}" hanya boleh ditulis hook saat manusia mengetik /harness:patterns ${pp[1]} ${id}. Agent hanya menulis "Status: proposed".`);
    }
    for (const [id, st] of Object.entries(before)) {
      if (st !== 'proposed' && after[id] !== st) return fail(`${id}: item yang sudah ${st} tidak boleh diubah atau dihapus.`);
    }
    return { ok: true };
  }

  // 5. gerbang 1: kode di service butuh work item approved yang mencakup service itu
  const svc = serviceOf(cfg, rel);
  if (svc) {
    const items = activeItems(root);
    const covering = items.filter((i) => coversService(i, svc) || svc === '*');
    if (!covering.length) {
      return fail(`tidak ada work item berstatus approved/in-progress yang mencakup service "${svc}". Alurnya: /harness:impact → /harness:plan → user ketik /harness:approve <slug> → sesi baru /harness:build <slug>.` +
        (items.length ? ` Item aktif saat ini: ${items.map((i) => `${i.slug}[${i.services.join(',')}]`).join('; ')}.` : ''));
    }
    if (matchAny(cfg.schema_paths, rel) && !covering.some((i) => i.type === 'schema' || String(i.fm.schema_change) === 'true')) {
      return fail(`${rel} adalah perubahan skema. Work item harus bertipe "schema" (atau schema_change: true) dan melewati agent dba.`);
    }
  }
  return { ok: true };
}

if (isMain(import.meta.url)) {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  const cfg = loadConfig(root);
  const r = evaluate(root, cfg, payload);
  if (!r.ok) deny(root, payload, r.reason);
  process.exit(0);
}
