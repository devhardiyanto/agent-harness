// Memori project (docs/memory/MEMORY.md) dan profil user (~/.harness/USER.md): satu fakta per baris "- ".
// Format 1.x (entri dipisah baris "§", header komentar) dirapikan lewat `harness.mjs memori --rapikan`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HEADER = {
  project: '# Memori project\n\nFakta awet project (konvensi, jebakan, keputusan lintas topik). Satu baris per fakta, diawali "- ". Ditulis agent lewat skill `belajar` ("ingat: …", "lupakan …"); batas 3.000 karakter.\n\n',
  user: '# Profil user\n\nCara kerja dan preferensi user (bahasa, gaya jawab, format). Satu baris per fakta, diawali "- ". Ditulis agent lewat skill `belajar` ("ingat user: …"); batas 1.500 karakter.\n\n',
};

export const userMdPath = (env = process.env) => path.join(env.HARNESS_HOME || path.join(os.homedir(), '.harness'), 'USER.md');
export const projectMdPath = (root) => path.join(root, 'docs', 'memory', 'MEMORY.md');

export const isLegacy = (text) => /^\s*§\s*$/m.test(text || '');

// Entri: baris "- " (2.x) atau blok di antara baris "§" (1.x). Judul, komentar, dan paragraf pengantar bukan fakta.
export function entries(text) {
  const t = String(text || '').replace(/<!--[\s\S]*?-->/g, '');
  if (isLegacy(t)) {
    return t.split(/^\s*§\s*$/m)
      .map((b) => b.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^#{1,6}\s/.test(l)).map((l) => l.replace(/^[-*]\s+/, '')).join(' ').trim())
      .filter(Boolean);
  }
  return t.split(/\r?\n/).filter((l) => /^-\s/.test(l)).map((l) => l.replace(/^-\s+/, '').trim()).filter(Boolean);
}

export function tidy(text, kind) {
  const list = entries(text);
  return { list, text: HEADER[kind] + list.map((e) => `- ${e}`).join('\n') + (list.length ? '\n' : '') };
}

// Rencana/terapkan untuk kedua berkas. Cadangan: ~/.harness/USER.md.bak dan .claude/state/MEMORY.md.bak.
export function plan(root, cfg, env = process.env) {
  const rows = [];
  for (const [kind, file, limit] of [['project', projectMdPath(root), cfg.learn.memory_chars], ['user', userMdPath(env), cfg.learn.user_chars]]) {
    let cur; try { cur = fs.readFileSync(file, 'utf8'); } catch { rows.push({ kind, file, state: 'tidak ada' }); continue; }
    const legacy = isLegacy(cur);
    const next = tidy(cur, kind);
    rows.push({ kind, file, state: legacy ? 'format 1.x (§)' : 'format 2.x', entries: next.list.length, before: cur.length, after: next.text.length, limit, legacy, next: next.text });
  }
  return rows;
}

export function apply(rows) {
  const done = [];
  for (const r of rows) {
    if (!r.legacy) continue;
    // Cadangan: USER.md di sebelahnya; MEMORY.md di .claude/state/ (tidak di-commit, tidak dimuat sesi).
    const bak = r.kind === 'user' ? `${r.file}.bak` : path.join(path.dirname(r.file), '..', '..', '.claude', 'state', 'MEMORY.md.bak');
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(r.file, bak);
    fs.writeFileSync(r.file, r.next);
    done.push(r.file);
  }
  return done;
}
