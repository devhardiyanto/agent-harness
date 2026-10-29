# Atribusi & lisensi pihak ketiga

| sumber | lisensi | yang dipakai | cara |
|---|---|---|---|
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | MIT | gagasan "tangga minimalis" (perlu ada? sudah ada? stdlib? native? dependency terpasang? satu baris?) | **ditulis ulang** sebagai rule `minimalis` (`kernel/.claude/rules/minimalis.md`); tidak ada teks/kode yang disalin. Isi hook ponytail tidak dibaca. |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | kode MIT; teks non-kode CC BY 4.0; skill pihak ketiga membawa lisensi upstream (ada GPL/AGPL) | tidak ada | hanya dipakai sebagai referensi pola. Tidak ada skill yang disalin. |
| Graphify (PyPI `graphifyy`) | lihat paketnya | dipanggil sebagai alat eksternal (`graphify update`, `explain`, `merge-graphs`) | **tidak dibundel**. Versi dipin di `harness.config.json`; `graphify install` (hook/skill global) sengaja tidak dijalankan. |

Bila menambah skill dari luar: periksa lisensi per skill, adaptasi (jangan salin), catat di sini.
