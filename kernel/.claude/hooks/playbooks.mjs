// Playbook (1.11.0): prosedur yang dipelajari agent, padanan "skill dari pengalaman" Hermes Agent.
// docs/memory/playbooks/<nama>.md dengan frontmatter `name` (= nama berkas) dan `description` (kapan dipakai, satu kalimat).
// Progressive disclosure: awal sesi hanya daftar nama + deskripsi; isi dibaca agent saat tugasnya cocok.
// Disimpan di repo (bisa di-review di PR), ditulis agent langsung seperti Hermes. Berkas rusak/terlalu besar tidak didaftarkan.
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, findSecret } from './lib.mjs';

export const pbDir = (root) => path.join(root, 'docs', 'memory', 'playbooks');
const NAME = /^[a-z0-9][a-z0-9-]{1,47}$/;

export function lintPlaybook(file, cfg) {
  const name = path.basename(file, '.md');
  const text = fs.readFileSync(file, 'utf8');
  const { fm, body } = splitFrontmatter(text);
  const errors = []; const warnings = [];
  if (!NAME.test(name)) errors.push('nama berkas harus huruf kecil, angka, dan "-" (2–48 karakter)');
  if (String(fm.name || '') !== name) errors.push(`frontmatter name "${fm.name || ''}" harus sama dengan nama berkas "${name}"`);
  const desc = String(fm.description || '').trim();
  if (desc.length < 12) errors.push('description wajib (satu kalimat: kapan playbook ini dipakai)');
  if (desc.length > 200) errors.push(`description terlalu panjang (${desc.length} > 200)`);
  if (text.length > cfg.playbooks.max_chars) errors.push(`terlalu besar (${text.length} > ${cfg.playbooks.max_chars} karakter): pecah atau ringkas`);
  if (findSecret(text)) errors.push('memuat pola secret');
  if (!/^##\s+Langkah/im.test(body)) warnings.push('tidak ada bagian "## Langkah"');
  if (!/^##\s+Verifikasi/im.test(body)) warnings.push('tidak ada bagian "## Verifikasi"');
  if ((body.match(/#\d+|pull\/\d+/g) || []).length > 8) warnings.push('banyak nomor PR/issue: playbook adalah prosedur, bukan log kejadian');
  return { name, file, description: desc, chars: text.length, errors, warnings, ok: errors.length === 0 };
}

export function listPlaybooks(root, cfg) {
  const d = pbDir(root);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md')
    .sort().map((f) => lintPlaybook(path.join(d, f), cfg));
}

// Daftar untuk SessionStart (level 0). Hanya yang lolos lint; yang rusak disebut jumlahnya saja.
export function playbookIndex(root, cfg) {
  if (!cfg.playbooks.enabled) return '';
  const all = listPlaybooks(root, cfg);
  if (!all.length) return '';
  const ok = all.filter((p) => p.ok);
  const L = [`PLAYBOOK (prosedur yang sudah dipelajari; baca isinya HANYA bila tugasmu cocok: docs/memory/playbooks/<nama>.md):`];
  for (const p of ok.slice(0, cfg.playbooks.index_max)) L.push(`- ${p.name}: ${p.description}`);
  if (ok.length > cfg.playbooks.index_max) L.push(`- ... +${ok.length - cfg.playbooks.index_max} lagi (harness.mjs playbook list)`);
  if (all.length > ok.length) L.push(`(${all.length - ok.length} playbook tidak didaftarkan karena gagal lint: harness.mjs playbook lint)`);
  return L.join('\n');
}
