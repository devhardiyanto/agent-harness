// Daftar project yang dipasangi harness (per mesin): ~/.harness/projects.json. Dibaca scripts/update-all.mjs, ditulis install.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = () => path.join(process.env.HARNESS_HOME || path.join(os.homedir(), '.harness'), 'projects.json');
const norm = (p) => path.resolve(p);
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

export function readProjects() {
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(j.projects) ? j.projects : []; } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ projects: list }, null, 2) + '\n');
}
export function addProject(p) {
  const list = readProjects(); const n = norm(p);
  if (list.some((x) => same(x, n))) return false;
  save([...list, n]); return true;
}
export function removeProject(p) {
  const list = readProjects(); const n = norm(p);
  const next = list.filter((x) => !same(x, n));
  if (next.length === list.length) return false;
  save(next); return true;
}
export const registryFile = file;
// Lokasi folder installer (per mesin): dipakai `harness.mjs update` di tiap project untuk menemukan scripts/harness-update.mjs.
const instFile = () => path.join(path.dirname(file()), 'installer.json');
export function setInstaller(dir) {
  fs.mkdirSync(path.dirname(instFile()), { recursive: true });
  fs.writeFileSync(instFile(), JSON.stringify({ path: path.resolve(dir) }, null, 2) + '\n');
}
export function getInstaller() { try { return JSON.parse(fs.readFileSync(instFile(), 'utf8')).path || null; } catch { return null; } }
