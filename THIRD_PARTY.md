# Komponen pihak ketiga

## antislop

| | |
|---|---|
| sumber | https://github.com/miqdadbadjuber/anti-slop |
| versi | 3.2.30, commit `35b54dc` |
| lisensi | MIT, Copyright (c) 2026 Miqdad Badjuber (antislop). Teks lengkap: `kernel/.claude/skills/antislop/LICENSE` |
| bahan turunan | `skills/antislop-ui` dan `skills/antislop-human` memuat bahan dari "web-quality-skills", MIT, Copyright (c) 2026 Addy Osmani. Teks lengkap: `LICENSE-web-quality-skills` di folder masing-masing |
| lokasi salinan | `kernel/.claude/skills/antislop*/` (terpasang ke `.claude/skills/` tiap root) |
| cara pakai | keputusan D30 b: teks aturan disalin, bukan plugin hulu. Pembaruan hulu disalin ulang hanya atas permintaan, setelah diperiksa ulang |

Pemeriksaan keamanan pada 3.2.30 (sebelum disalin): tidak ada panggilan jaringan, telemetri, hook, atau skrip pasang otomatis di repo hulu; teks skill tidak menyuruh mengirim data.

Yang diubah pada salinan:

| berkas | perubahan |
|---|---|
| `antislop/SKILL.md` | bagian "Already installed, and the user asks how to update" (petunjuk installer hulu) dihapus; bagian "Two Usage Modes" tidak lagi membaca berkas preferensi di luar project, mode dari `antislop.mode` di `harness.config.json`; deskripsi "Load always" diganti agar tidak dimuat di tiap sesi |
| `antislop-human/SKILL.md` | `Bash(python *)` dibuang dari `allowed-tools`; paragraf skrip pemeriksa kontras diganti catatan (rumus dan tabel tetap) |
| `antislop-human/contrast-check.py`, `contrast-mcp.py` | tidak disalin |
| semua `SKILL.md` | satu baris catatan asal salinan di bawah judul |
| tidak disalin | `cli/`, `.claude-plugin/` (termasuk server MCP), folder plugin agent lain, `rules/`, `scripts/` |

`node scripts/check-repo.mjs` menolak salinan yang memuat perintah unduh/pasang, `Bash(...)` di `allowed-tools`, URL di luar host rujukan, atau tanpa lisensi.
