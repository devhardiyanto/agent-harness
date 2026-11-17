---
name: approve
description: Persetujuan plan oleh manusia. Hook UserPromptSubmit memproses perintah ini dan menulis status approved; agent tidak boleh meng-approve sendiri.
argument-hint: "<slug>"
disable-model-invocation: true
---
# /harness:approve

Perintah ini diproses oleh hook sebelum sampai ke kamu. Yang berubah: `plan.md` → `status: approved` (ditulis hook, dicatat `approved_by`).

Tugasmu hanya:
1. Jalankan `node .claude/hooks/harness.mjs show $ARGUMENTS`.
2. Bila `status: approved`: balas ≤2 baris — konfirmasi dan "buka sesi baru, jalankan "kerjakan $ARGUMENTS"".
3. Bila belum approved: hook tidak aktif atau menolak. Sampaikan alasan dari pesan hook. Minta user menjalankan sendiri: `! node .claude/hooks/harness.mjs approve $ARGUMENTS` (awalan `!` = dijalankan user, bukan agent).

Jangan pernah mengubah status ke approved dengan cara lain.
