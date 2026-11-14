import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const K = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kernel');

test('D27: tidak ada agent yang memakai isolation: worktree di frontmatter (reviewer harus melihat diff yang belum di-commit)', () => {
  const dir = path.join(K, '.claude', 'agents');
  for (const f of fs.readdirSync(dir)) {
    const fm = fs.readFileSync(path.join(dir, f), 'utf8').split('---')[1] || '';
    assert.doesNotMatch(fm, /^isolation:/m, f);
  }
});

test('D26: advisor hanya panduan opt-in; kernel tidak menyalakannya lewat settings', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(K, '.claude', 'settings.json'), 'utf8'), /advisor/i);
  assert.match(fs.readFileSync(path.join(K, 'AGENTS.md'), 'utf8'), /Advisor \(1\.14\.0, opsional/);
});
