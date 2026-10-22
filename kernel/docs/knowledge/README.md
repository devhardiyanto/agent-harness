# Knowledge

```
knowledge/
├─ <service>/summary.md    L2 ringkasan (≤80 baris), sitasi path:baris
├─ <service>/patterns.md   L3 pola + contoh emas (≤150 baris)
└─ graph/                  L1 graph struktural (Graphify), OPSIONAL, di-gitignore
```
Dibangun `/harness:init` (atau `/harness:onboard <svc>`) dari commit **baseline** (origin/HEAD → production → main → master), dirawat `/harness:refresh`.
Lint tanpa token: `node .claude/hooks/harness.mjs lint-knowledge [svc|all]`. Kedaluwarsa: `knowledge-status`. Verifikasi manusia: `knowledge-sample <svc>` lalu `/harness:verify <svc>`.
Format: lihat `.claude/rules/knowledge.md`.
