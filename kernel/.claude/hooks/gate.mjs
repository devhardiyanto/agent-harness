// PreToolUse (Edit|Write|MultiEdit|NotebookEdit|Read): gerbang 1, gerbang 2 (via transisi plan.md),
// proteksi file harness, schema, dan secret. Exit 2 = blokir.
import fs from 'node:fs';
import path from 'node:path';
import {
  isSingle, frozenPart, sectionOf,
  readStdinJson, projectRoot, loadConfig, relPath, matchAny, serviceOf, activeItems, coversService,
  splitFrontmatter, readItem, checkTransition, findSecret, SECRET_FILE, deny, STATUSES,
  isMain, isQuick, asList, setFmKey,
  parseAcs, alignProblems, alignExempt, formatDecision,
} from './lib.mjs';
import { proposalStatuses } from './knowledge.mjs';
import { bidangOfService } from './bidang.mjs';

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
    // 1.16.0: bentuk tunggal membawa align di frontmatter plan.md; aturannya sama dengan align.md (4a)
    const curFm = splitFrontmatter(current).fm;
    if (String(nextFm.bentuk || curFm.bentuk || '') === 'tunggal') {
      const cv = String(curFm.align || 'open').toLowerCase(); const nv = String(nextFm.align || 'open').toLowerCase();
      if (nv === 'aligned' && cv !== 'aligned') return fail(`"align: aligned" hanya oleh manusia: ketik align ok ${slug}. Tulis "align: open".`);
      for (const k of ['aligned_at', 'aligned_by']) if (String(nextFm[k] || '') !== String(curFm[k] || '') && nv === 'aligned') return fail(`${k} hanya ditulis hook.`);
      const s3 = (t) => sectionOf(splitFrontmatter(t).body, /^3\.?\s*Dampak/i);
      if (cv === 'aligned' && nv === 'aligned' && s3(current) !== s3(next)) return fail(`item ${slug} sudah aligned (disetujui manusia). Mengubah bagian 3 = turunkan ke "align: open" dalam edit yang sama; user menutup lagi dengan align ok ${slug}.`);
      const rn = Number(nextFm.align_rounds || 0);
      if (rn > cfg.align.max_rounds) return fail(`debat align dibatasi ${cfg.align.max_rounds} ronde (diminta ${rn}). Berhenti: tanyakan titik beda ke user lewat pemilih (AskUserQuestion).`);
      if (rn < Number(curFm.align_rounds || 0)) return fail('align_rounds tidak boleh diturunkan.');
    }
    // 1.12.0 (F2): AC di plan.md (tambah/ubah) hanya setelah objective aligned (urutan impact → align → plan tidak bisa dilompati)
    if (cfg.align.block_plan_before_aligned && parseAcs(splitFrontmatter(next).body).length && JSON.stringify(parseAcs(splitFrontmatter(next).body)) !== JSON.stringify(parseAcs(splitFrontmatter(current).body))) {
      const pseudo = { slug, dir: path.dirname(abs), type: nextFm.type || 'feature', fm: { ...nextFm, align: curFm.align || 'open', align_rounds: curFm.align_rounds || 0 }, status: toStatus, body: splitFrontmatter(next).body, text: next };
      if (!alignExempt(pseudo, cfg) && alignProblems(pseudo, cfg).length) {
        let table = ''; try { table = `\n${formatDecision(root, pseudo)}`; } catch { /* abaikan */ }
        return fail(`plan ${slug} belum boleh diisi AC: objective belum aligned. Tampilkan tabel keputusan ini ke user apa adanya dan berhenti; jangan menulis plan dulu.${table}`);
      }
    }
    if (!STATUSES.includes(toStatus)) return fail(`status "${toStatus}" tidak dikenal.`);
    if (!exists) {
      if (toStatus !== 'draft') return fail('plan.md baru harus berstatus draft.');
      return { ok: true };
    }
    const item = readItem(root, slug);
    const changed = item && isSingle(item) ? frozenPart(current) !== frozenPart(next) || fmStripped(current).split('\n--\n')[0] !== fmStripped(next).split('\n--\n')[0] : fmStripped(current) !== fmStripped(next);
    if (item && item.status !== 'draft' && toStatus === item.status && changed) {
      return fail(`plan ${slug} sudah ${item.status}; isinya beku. Untuk merevisi: "node .claude/hooks/harness.mjs reopen ${slug}" (status kembali draft, perlu setuju <slug> lagi).`);
    }
    if (item && toStatus !== item.status) {
      if (item.status !== 'draft' && changed) return fail('ubah status dan isi plan dalam edit terpisah.');
      const problems = checkTransition(root, cfg, { ...item, status: item.status, body: item.body }, toStatus, { actor: 'agent' });
      if (problems.length) return fail(`transisi ${item.status} → ${toStatus} ditolak:\n- ${problems.join('\n- ')}`);
    }
    return { ok: true };
  }

  // 4a. align.md: verdict "aligned" hanya oleh manusia; debat dibatasi max_rounds; isi aligned tidak diubah diam-diam
  const am = /^docs\/work\/([^/]+)\/align\.md$/.exec(rel);
  if (am) {
    const abs = path.resolve(root, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const c = splitFrontmatter(current); const n = splitFrontmatter(simulate(current, inc));
    const cv = String(c.fm.verdict || 'open').toLowerCase(); const nv = String(n.fm.verdict || 'open').toLowerCase();
    if (nv === 'aligned' && cv !== 'aligned') return fail(`verdict "aligned" hanya oleh manusia: ketik align ok ${am[1]}. Tulis "verdict: open".`);
    if (cv === 'aligned' && nv === 'aligned' && c.body !== n.body) return fail(`align ${am[1]} sudah aligned (disetujui manusia). Mengubah isinya = turunkan ke "verdict: open" dalam edit yang sama; user menutup lagi dengan align ok ${am[1]}.`);
    const rn = Number(n.fm.rounds || 0);
    if (rn > cfg.align.max_rounds) return fail(`debat align dibatasi ${cfg.align.max_rounds} ronde (diminta ${rn}). Berhenti: ringkas titik beda lewat AskUserQuestion dan biarkan user memutuskan.`);
    if (rn < Number(c.fm.rounds || 0)) return fail('rounds tidak boleh diturunkan.');
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
    if (ns === 'verified' && cs !== 'verified') return fail(`status "verified" hanya oleh manusia: ketik verifikasi knowledge ${km[1]} (atau "! node .claude/hooks/harness.mjs verify-knowledge ${km[1]}"). Tulis sebagai draft.`);
    if (cs === 'verified' && ns === 'verified' && (c.body !== n.body || c.fm.source_commit !== n.fm.source_commit)) {
      return fail(`${rel} berstatus verified (diverifikasi manusia). Perubahan oleh agent harus menurunkan status ke draft dalam edit yang sama; verifikasi ulang dengan verifikasi knowledge ${km[1]}.`);
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
      if (st !== 'proposed' && before[id] !== st) return fail(`${id}: status "${st}" hanya boleh ditulis hook saat manusia mengetik terapkan pola ${pp[1]} ${id}. Agent hanya menulis "Status: proposed".`);
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
    const standard = items.filter((i) => !isQuick(i) && (coversService(i, svc) || svc === '*'));
    // item quick yang belum terikat ke service mana pun akan terikat pada edit pertama (satu service saja)
    const quick = items.filter((i) => isQuick(i) && (!i.services.length || coversService(i, svc) || svc === '*'));
    if (!standard.length && !quick.length) {
      const bound = items.filter((i) => isQuick(i) && i.services.length);
      return fail(`tidak ada work item berstatus approved/in-progress yang mencakup service "${svc}". Alurnya: skill impact → skill plan → user ketik setuju <slug> → sesi baru kerjakan <slug>; perubahan kecil: user ketik quick: <permintaan>.` +
        (items.length ? ` Item aktif saat ini: ${items.map((i) => `${i.slug}[${i.services.join(',') || '-'}]`).join('; ')}.` : '') +
        (bound.length ? ` Lajur quick hanya 1 service (${bound.map((i) => `${i.slug} → ${i.services.join(',')}`).join('; ')}); untuk menambah service: "node .claude/hooks/harness.mjs promote <slug>" lalu plan + approve.` : ''));
    }
    if (matchAny(cfg.schema_paths, rel) && !standard.some((i) => i.type === 'schema' || String(i.fm.schema_change) === 'true')) {
      return fail(quick.length && !standard.length
        ? `${rel} adalah perubahan skema; lajur quick tidak boleh menyentuh skema. "node .claude/hooks/harness.mjs promote ${quick[0].slug}", lalu plan bertipe "schema" dan approve.`
        : `${rel} adalah perubahan skema. Work item harus bertipe "schema" (atau schema_change: true) dan melewati agent dba.`);
    }
    // 1.17.0 (opsional, bidang.enforce): item standard dikerjakan spesialis. Hanya berlaku bila payload hook menyebut agent
    // (uji M0 nomor 2). Nyalakan hanya bila uji itu menunjukkan subagent membawa agent_type; bila tidak, semua edit ditolak.
    if (cfg.bidang.enabled && cfg.bidang.enforce && standard.length) {
      const who = payload.agent_type || payload.agent_name || payload.subagent_type || null;
      const b = bidangOfService(cfg, svc);
      if (b && !who) return fail(`${rel}: service "${svc}" berbidang ${b.bidang}. Panggil agent \`${b.bidang}\` (tool Agent) untuk mengedit kode ini; sesi utama merangkum dan menulis bukti.`);
    }
    // batas lajur quick hanya berlaku bila tidak ada item standard yang mencakup edit ini
    if (!standard.length) {
      const q = quick[0];
      const files = asList(q.fm.files);
      if (!files.includes(rel) && files.length >= cfg.quick.max_files) {
        return fail(`lajur quick dibatasi ${cfg.quick.max_files} file (sudah: ${files.join(', ')}). "node .claude/hooks/harness.mjs promote ${q.slug}" lalu skill plan ${q.slug} dan setuju ${q.slug}.`);
      }
      let t = q.text;
      if (!q.services.length) t = setFmKey(t, 'services', `[${svc}]`);
      if (!files.includes(rel)) t = setFmKey(t, 'files', `[${[...files, rel].join(', ')}]`);
      if (t !== q.text) fs.writeFileSync(q.planPath, t);
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
