#!/usr/bin/env python3
"""scripts/executor/executor.py — logika bersama executor kit (Planner Claude Code + Executor agy).

Subcommand (dipanggil oleh wrapper bash, jarang dipanggil langsung):
  gate                         hook PreToolUse agy: baca payload JSON dari stdin, balas keputusan JSON
  gate-selftest                uji internal gate dengan payload tiruan
  prepare <work> <task> <svc>  periksa plan.md (approved/in-progress, mencakup svc), lalu tulis .agents/active-task.json
                               (Scope dari brief + perintah cek service)
  envelope <work> <task>       validasi envelope agy, tulis T<n>.result.json
  audit <work> <task> <svc>    audit diff vs Scope (+ transcript sebagai bukti tambahan)
  preflight                    cek lingkungan (agy, settings.json, trust, hooks.json, gate)
  settings-merge               tambah allowlist command() ke settings.json agy (dengan backup)
  hooks-gen                    tulis .agents/hooks.json dengan path absolut ke gate
  checks <svc>                 perintah cek service + apakah agy boleh menjalankannya (checks.<svc>.agent_runs)
  cfg <key> [default]          baca harness.config.json -> executor.<key>

Fakta yang dipakai (terverifikasi di agy 1.4.2, Windows 11 26300, Git Bash):
  - payload hook: toolCall.name / toolCall.args (Path, CommandLine, ...), workspacePaths[], conversationId
  - keputusan hook: {"decision":"allow"} | {"decision":"deny","reason":"..."}; hook gagal = tool diblokir
  - penolakan izin headless: status tetap SUCCESS, exit 0, hanya terlihat di denied_actions
  - direktori kerja hook tidak stabil -> semua path di sini absolut / dihitung dari lokasi berkas ini
"""
import datetime
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------- path helpers
def norm(p):
    """Normalisasi path ke bentuk 'C:/a/b' atau '/a/b' (slash maju, tanpa '..')."""
    p = str(p).replace("\\", "/")
    if os.environ.get("MSYSTEM"):
        m = re.match(r"^/([A-Za-z])/(.*)$", p)
        if m:
            p = "%s:/%s" % (m.group(1).upper(), m.group(2))
    m = re.match(r"^([A-Za-z]):(.*)$", p)
    if m:
        p = "%s:%s" % (m.group(1).upper(), m.group(2))
    return posixpath.normpath(p) if p else p


ROOT = norm(Path(__file__).resolve().parents[2])
IS_WIN = bool(re.match(r"^[A-Za-z]:/", ROOT))
ACTIVE = ROOT + "/.agents/active-task.json"
MANIFESTS = {"package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "composer.json",
             "composer.lock", "go.mod", "go.sum", "requirements.txt", "pyproject.toml", "poetry.lock"}
# Tidak pernah boleh ditulis executor, apa pun isi Scope.
PROTECTED = ["**/.git/**", ".agents/**", ".claude/**", "scripts/**", "harness.config.json", "docs/work/**"]
WRITE_NAME = re.compile(r"(write|edit|replace|delete|remove|move|rename|create|patch)", re.I)
NET_NAME = re.compile(r"(search_web|read_url|web_search|fetch|browser|http)", re.I)  # executor tidak boleh menyentuh jaringan
READ_TOOLS = {"read_file", "list_dir", "list_directory", "view_file", "grep_search", "find_by_name", "search"}
DEFAULTS = {"command": "agy", "min_version": "1.1.12", "print_timeout": "10m", "model": "", "effort": "",
            "allowed_commands": ["git status", "git diff"], "protected_branches": ["main", "master", "develop", "dev"],
            "ttl_minutes": 120, "path_prepend": [], "sandbox": True, "require_approved_plan": True,
            "agent_runs_checks": False}


def rel(path, root=ROOT):
    """Path -> relatif terhadap root, atau None bila di luar root."""
    p = norm(path)
    if not re.match(r"^([A-Za-z]:)?/", p):
        p = norm(root + "/" + p)
    a, b = (p.lower(), root.lower()) if IS_WIN else (p, root)
    if a == b:
        return ""
    if a.startswith(b + "/"):
        return p[len(root) + 1:]
    return None


def glob_re(g):
    g = re.sub(r"^\./", "", g.strip().replace("\\", "/"))
    if g.endswith("/"):
        g += "**"
    out, i = "", 0
    while i < len(g):
        if g[i:i + 3] == "**/":
            out += "(?:.*/)?"
            i += 3
            continue
        if g[i:i + 2] == "**":
            out += ".*"
            i += 2
            continue
        c = g[i]
        out += "[^/]*" if c == "*" else "[^/]" if c == "?" else re.escape(c)
        i += 1
    return re.compile("^" + out + "$", re.I if IS_WIN else 0)


def matches(relpath, globs):
    return any(glob_re(g).match(relpath) for g in globs)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def load_json(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def cfg_all():
    d = dict(DEFAULTS)
    try:
        d.update(load_json(ROOT + "/harness.config.json").get("executor", {}))
    except Exception:
        pass
    return d


def _truthy(v):
    return v is True or str(v).strip().lower() in ("true", "1", "yes", "ya")


def check_entries():
    """[(service, perintah, agent_runs)] dari harness.config.json -> checks.<svc>.{lint,test,agent_runs};
    cadangan projects.<svc>.{lint_command,test_command} (skema lama). agent_runs = apakah agy BOLEH menjalankan perintah
    itu: checks.<svc>.agent_runs bila ada, selain itu executor.agent_runs_checks (bawaan false).
    Nilai null / kosong / placeholder {{...}} / <...> dilewati."""
    try:
        conf = load_json(ROOT + "/harness.config.json")
    except Exception:
        conf = {}
    default = _truthy((conf.get("executor") or {}).get("agent_runs_checks", False))
    sources = []
    for name, p in (conf.get("checks") or {}).items():
        p = p or {}
        sources.append((name, [p.get("lint"), p.get("test")], _truthy(p["agent_runs"]) if "agent_runs" in p else default))
    for name, p in (conf.get("projects") or {}).items():
        p = p or {}
        sources.append((name, [p.get("lint_command"), p.get("test_command")], default))
    out = []
    for name, vals, flag in sources:
        for v in vals:
            if isinstance(v, str) and v.strip() and "{{" not in v and "<" not in v:
                out.append((name, v.strip(), flag))
    return out


def service_checks(service=None):
    """Semua perintah cek (untuk verifikasi Claude), terlepas dari izin agy."""
    return list(dict.fromkeys(c for n, c, f in check_entries() if not service or n == service))


def agent_checks(service=None):
    """Perintah cek yang BOLEH dijalankan agy (masuk allowlist)."""
    return list(dict.fromkeys(c for n, c, f in check_entries() if f and (not service or n == service)))


def cmd_checks(service):
    ents = [e for e in check_entries() if e[0] == service]
    emit({"service": service, "agent_runs": bool(ents) and all(e[2] for e in ents),
          "commands": list(dict.fromkeys(e[1] for e in ents)),
          "agent_commands": list(dict.fromkeys(e[1] for e in ents if e[2]))})
    return 0


def settings_path():
    return norm(os.environ.get("AGY_SETTINGS") or (Path.home() / ".gemini" / "antigravity-cli" / "settings.json"))


def task_dir(work):
    return "%s/docs/work/%s/tasks" % (ROOT, work)


def git(args, cwd):
    r = subprocess.run(["git", "-C", cwd] + args, capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stdout


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------- scope / brief
def parse_scope(brief_path):
    text = Path(brief_path).read_text(encoding="utf-8-sig")
    m = re.search(r"^##\s+Scope\s*$(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    items = []
    for line in (m.group(1) if m else "").splitlines():
        mm = re.match(r"^\s*[-*]\s+(.*)$", line)
        if not mm:
            continue
        body = mm.group(1).strip()
        bt = re.search(r"`([^`]+)`", body)
        val = (bt.group(1) if bt else body).strip()
        if val and not val.startswith(("(", "<")):
            items.append(val.replace("\\", "/"))
    return items


def validate_scope(scope, service):
    prefix = "source-code/%s/" % service
    for g in scope:
        if g.startswith("/") or re.match(r"^[A-Za-z]:", g) or ".." in g.split("/"):
            return "Scope tidak boleh absolut atau memakai '..': %s" % g
        if not g.startswith(prefix):
            return "Scope harus berada di %s : %s" % (prefix, g)
        if matches(g.rstrip("/") + "/x" if g.endswith("/") else g, PROTECTED):
            return "Scope menyentuh path terlindung: %s" % g
    return ""


# ---------------------------------------------------------------- gate
def decide(payload, active):
    """Murni: kembalikan (decision, reason, info)."""
    call = (payload or {}).get("toolCall") or {}
    tool, args = call.get("name", ""), call.get("args") or {}
    scope = active.get("scope", [])
    if tool == "run_command":
        cmd = str(args.get("CommandLine", "")).strip()
        if cmd in active.get("allowed_commands", []):
            return "allow", "", {"tool": tool, "cmd": cmd}
        return "deny", "perintah tidak ada di allowlist executor: %s" % cmd[:120], {"tool": tool, "cmd": cmd}
    if NET_NAME.search(tool or ""):
        return "deny", "tool jaringan tidak diizinkan untuk executor: %s" % tool, {"tool": tool, "args": json.dumps(args, ensure_ascii=False)[:160]}
    is_write = tool in ("write_file", "edit_file") or (tool not in READ_TOOLS and WRITE_NAME.search(tool or ""))
    if is_write:
        p = args.get("Path") or args.get("TargetFile") or args.get("TargetPath") or ""
        info = {"tool": tool, "path": p}
        if not p:
            return "deny", "tool penulisan tanpa Path: %s" % tool, info
        r = rel(p)
        if r is None:
            return "deny", "path di luar root workspace: %s" % p, info
        if matches(r, PROTECTED):
            return "deny", "path terlindung (harness/git): %s" % r, info
        if not matches(r, scope):
            return "deny", "di luar Scope: %s" % r, info
        return "allow", "", info
    brief = json.dumps(args, ensure_ascii=False)[:160]  # untuk diagnosis: apa yang dibaca/dipanggil agy
    if tool in READ_TOOLS or tool == "finish":
        return "allow", "", {"tool": tool, "args": brief}
    return "allow", "tool tidak dikenal (diizinkan, dicatat): %s" % tool, {"tool": tool, "unknown": True, "args": brief}


def load_active():
    if not os.path.exists(ACTIVE):
        return None
    a = load_json(ACTIVE)
    started = datetime.datetime.fromisoformat(a["started"])
    age = (datetime.datetime.now(datetime.timezone.utc) - started).total_seconds() / 60
    return None if age > int(a.get("ttl_minutes", 120)) else a


def cmd_gate():
    raw = sys.stdin.read()
    active = load_active()
    if not active:  # tidak ada task aktif: pemakaian interaktif biasa, gate nonaktif
        emit({"decision": "allow"})
        return 0
    try:
        payload = json.loads(raw)
    except Exception:
        emit({"decision": "deny", "reason": "payload hook tidak valid"})
        return 0
    decision, reason, info = decide(payload, active)
    try:
        with open(active["gate_log"], "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(info, ts=now(), decision=decision, reason=reason), ensure_ascii=False) + "\n")
    except Exception:
        pass
    emit({"decision": "deny", "reason": reason} if decision == "deny" else {"decision": "allow"})
    return 0


def cmd_gate_selftest():
    a = {"scope": ["source-code/svc/src/**", "source-code/svc/package.json"], "allowed_commands": ["git status"]}
    w = lambda n, p, **k: {"toolCall": {"name": n, "args": dict({"Path": p}, **k)}}
    cases = [
        (w("write_file", ROOT + "/source-code/svc/src/a.txt"), "allow"),
        (w("edit_file", (ROOT + "/source-code/svc/src/a.txt").replace("/", "\\")), "allow"),
        (w("write_file", ROOT + "/source-code/svc/other/a.txt"), "deny"),
        (w("write_file", ROOT + "/scripts/executor/executor.py"), "deny"),
        (w("write_file", ROOT + "/source-code/svc/.git/config"), "deny"),
        (w("write_file", "/etc/passwd"), "deny"),
        (w("delete_file", ROOT + "/source-code/svc/other/b.txt"), "deny"),
        (w("read_file", "/etc/passwd"), "allow"),
        ({"toolCall": {"name": "search_web", "args": {"query": "x"}}}, "deny"),
        ({"toolCall": {"name": "read_url_content", "args": {"Url": "http://x"}}}, "deny"),
        ({"toolCall": {"name": "view_file", "args": {"AbsolutePath": ROOT + "/a"}}}, "allow"),
        ({"toolCall": {"name": "finish", "args": {}}}, "allow"),
        ({"toolCall": {"name": "run_command", "args": {"CommandLine": "git status"}}}, "allow"),
        ({"toolCall": {"name": "run_command", "args": {"CommandLine": "git push"}}}, "deny"),
    ]
    bad = [(c[0]["toolCall"]["name"], c[1]) for c in cases if decide(c[0], a)[0] != c[1]]
    if bad:
        sys.stderr.write("gate-selftest GAGAL: %s\n" % bad)
        return 1
    return 0


# ---------------------------------------------------------------- prepare / envelope
def plan_frontmatter(work):
    """status + services dari docs/work/<work>/plan.md (frontmatter sederhana ala harness v1). None bila tidak ada."""
    p = "%s/docs/work/%s/plan.md" % (ROOT, work)
    if not os.path.exists(p):
        return None
    text = Path(p).read_text(encoding="utf-8-sig")
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    fm = {}
    for line in (m.group(1) if m else "").splitlines():
        mm = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if mm:
            fm[mm.group(1)] = mm.group(2).strip()
    services = fm.get("services", "")
    if services.startswith("[") and services.endswith("]"):
        services = [x.strip().strip("\"'") for x in services[1:-1].split(",") if x.strip()]
    else:
        services = [services.strip("\"'")] if services else []
    return {"status": fm.get("status", "draft").strip("\"'"), "services": services}


def plan_gate(work, service):
    """Gerbang 1 harness untuk jalur executor: agy menulis kode di luar hook Claude, jadi plan diperiksa di sini.
    Kembalikan pesan galat, atau '' bila lolos."""
    if str(cfg_all().get("require_approved_plan", True)).lower() in ("false", "0", "no"):
        return ""
    fm = plan_frontmatter(work)
    if fm is None:
        return "plan.md tidak ada untuk work item '%s' (docs/work/%s/plan.md)" % (work, work)
    if fm["status"] not in ("approved", "in-progress"):
        return "plan '%s' berstatus '%s'; executor hanya jalan untuk approved/in-progress" % (work, fm["status"])
    if "*" not in fm["services"] and service not in fm["services"]:
        return "plan '%s' tidak mencakup service '%s' (services: %s)" % (work, service, ", ".join(fm["services"]) or "-")
    return ""


def cmd_prepare(work, task, service):
    err = plan_gate(work, service)
    if err:
        sys.stderr.write(err + "\n")
        return 11
    brief = "%s/%s.brief.md" % (task_dir(work), task)
    scope = parse_scope(brief)
    if not scope:
        sys.stderr.write("Scope kosong di %s\n" % brief)
        return 11
    err = validate_scope(scope, service)
    if err:
        sys.stderr.write(err + "\n")
        return 11
    c = cfg_all()
    os.makedirs(ROOT + "/.agents", exist_ok=True)
    with open(ACTIVE, "w", encoding="utf-8") as f:
        json.dump({"work_id": work, "task_id": task, "service": service, "scope": scope,
                   "allowed_commands": list(c["allowed_commands"]) + agent_checks(service), "gate_log": "%s/%s.gate.log" % (task_dir(work), task),
                   "started": now(), "ttl_minutes": c["ttl_minutes"]}, f, indent=2)
    return 0


def read_gate_log(path):
    out = []
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            try:
                out.append(json.loads(line))
            except Exception:
                pass
    return out


def cmd_envelope(work, task):
    td = task_dir(work)
    raw = Path("%s/%s.stdout" % (td, task)).read_text(encoding="utf-8-sig") if os.path.exists("%s/%s.stdout" % (td, task)) else ""
    err = Path("%s/%s.stderr" % (td, task)).read_text(encoding="utf-8", errors="replace") if os.path.exists("%s/%s.stderr" % (td, task)) else ""
    gate = read_gate_log("%s/%s.gate.log" % (td, task))
    denials = [g for g in gate if g.get("decision") == "deny"]
    res = {"ok": False, "reason": "", "conversation_id": "", "agent_status": "", "denied_actions": [],
           "hook_failed": False, "gate_denials": len(denials), "gate_entries": len(gate)}
    if not raw.strip():
        res["reason"] = "stdout agy kosong"
        emit(res)
        return 12
    try:
        env = json.loads(raw)
    except Exception:
        res["reason"] = "stdout agy bukan JSON"
        emit(res)
        return 12
    Path("%s/%s.envelope.json" % (td, task)).write_text(json.dumps(env, indent=2, ensure_ascii=False), encoding="utf-8")
    res["conversation_id"] = env.get("conversation_id", "")
    res["denied_actions"] = env.get("denied_actions") or []
    so = env.get("structured_output")
    resp = env.get("response") or ""
    res["hook_failed"] = bool(re.search(r"JSON hook .{0,200}failed", resp + "\n" + err))
    if isinstance(so, dict):
        res["agent_status"] = so.get("status", "")
        Path("%s/%s.result.json" % (td, task)).write_text(json.dumps(so, indent=2, ensure_ascii=False), encoding="utf-8")
    if res["denied_actions"] or res["hook_failed"]:
        res["reason"] = "BLOCKED: izin ditolak (denied_actions) atau hook gagal; cek stderr dan gate.log"
        emit(res)
        return 13
    if env.get("status") != "SUCCESS":
        res["reason"] = "status envelope %s" % env.get("status")
        emit(res)
        return 12
    if not isinstance(so, dict):
        res["reason"] = "structured_output tidak ada"
        emit(res)
        return 12
    res["ok"] = True
    emit(res)
    return 0


# ---------------------------------------------------------------- audit
def porcelain_paths(cwd):
    rc, out = git(["status", "--porcelain"], cwd)
    return {l[3:].strip().strip('"') for l in out.splitlines() if len(l) > 3}


def transcript_calls(conv):
    home = Path(os.environ.get("AGY_HOME") or (Path.home() / ".gemini" / "antigravity-cli"))
    p = home / "brain" / conv / ".system_generated" / "logs" / "transcript_full.jsonl"
    calls = []
    if conv and p.exists():
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                for tc in json.loads(line).get("tool_calls", []) or []:
                    calls.append(tc)
            except Exception:
                pass
    return calls, p.exists()


def cmd_audit(work, task, service):
    td = task_dir(work)
    svc = "%s/source-code/%s" % (ROOT, service)
    scope = parse_scope("%s/%s.brief.md" % (td, task))
    viol, warn = [], []
    base = Path("%s/%s.base" % (td, task)).read_text().strip()
    rc, head = git(["rev-parse", "HEAD"], svc)
    if head.strip() != base:
        viol.append({"kind": "commit_made", "path": "HEAD %s != base %s" % (head.strip()[:8], base[:8])})
    _, d1 = git(["diff", "--name-only", base], svc)
    _, d2 = git(["ls-files", "--others", "--exclude-standard"], svc)
    changed = sorted({l.strip() for l in (d1 + "\n" + d2).splitlines() if l.strip()})
    full = ["source-code/%s/%s" % (service, f) for f in changed]
    for p in full:
        if matches(p, PROTECTED):
            viol.append({"kind": "protected_path", "path": p})
        elif not matches(p, scope):
            viol.append({"kind": "out_of_scope", "path": p})
        elif os.path.basename(p) in MANIFESTS and p not in scope:
            viol.append({"kind": "manifest_change", "path": p})
    before = set()
    bf = "%s/%s.rootbase" % (td, task)
    if os.path.exists(bf):
        before = {l.strip() for l in open(bf, encoding="utf-8") if l.strip()}
    for p in sorted(porcelain_paths(ROOT) - before):
        if not (p.startswith("docs/work/%s/" % work) or p.startswith(".agents/")):
            viol.append({"kind": "root_change", "path": p})
    claimed = []
    try:
        claimed = [norm(x).lstrip("/") for x in load_json("%s/%s.result.json" % (td, task)).get("files_changed", [])]
    except Exception:
        warn.append("result.json tidak terbaca")
    claimed_rel = {c if c.startswith("source-code/") else "source-code/%s/%s" % (service, c) for c in claimed}
    for p in sorted(claimed_rel - set(full)):
        warn.append("diklaim berubah tetapi tidak ada di diff: %s" % p)
    for p in sorted(set(full) - claimed_rel):
        warn.append("berubah tetapi tidak diklaim: %s" % p)
    conv = ""
    try:
        conv = load_json("%s/%s.envelope.json" % (td, task)).get("conversation_id", "")
    except Exception:
        pass
    calls, found = transcript_calls(conv)
    tools = {}
    for tc in calls:
        tools[tc.get("name", "?")] = tools.get(tc.get("name", "?"), 0) + 1
        a = tc.get("args") or {}
        if (tc.get("name") in ("write_file", "edit_file")) and a.get("Path"):
            r = rel(a["Path"])
            if r is None or not matches(r, scope):
                warn.append("transcript: percobaan menulis di luar Scope: %s" % a["Path"])
    if not found:
        warn.append("transcript tidak ditemukan (bukti tambahan saja; diff git tetap otoritas)")
    gate = read_gate_log("%s/%s.gate.log" % (td, task))
    out = {"ok": not viol, "violations": viol, "warnings": warn, "changed": full, "tool_calls": tools,
           "gate_denials": [g for g in gate if g.get("decision") == "deny"]}
    Path("%s/%s.audit.json" % (td, task)).write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    emit({"ok": out["ok"], "violations": viol, "warnings": len(warn), "changed": len(full)})
    return 0 if not viol else 14


# ---------------------------------------------------------------- preflight / setup
def vtuple(s):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", s or "")
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def required_allow():
    """Perintah yang boleh dijalankan executor di mana pun: dasar + cek service yang agent_runs-nya aktif."""
    cmds = list(cfg_all()["allowed_commands"]) + agent_checks()
    return ["command(%s)" % c for c in dict.fromkeys(cmds)]


def cmd_preflight():
    c, rows = cfg_all(), []

    def add(level, name, msg=""):
        rows.append((level, name, msg))

    exe = shutil.which(c["command"])
    if not exe:
        add("FAIL", "agy terpasang", "'%s' tidak ada di PATH" % c["command"])
    else:
        r = subprocess.run([exe, "--version"], capture_output=True, text=True)
        v = vtuple(r.stdout + r.stderr)
        ok = v >= vtuple(c["min_version"])
        add("PASS" if ok else "FAIL", "versi agy", "%s (minimum %s)" % (".".join(map(str, v)), c["min_version"]))
    sp = settings_path()
    try:
        s = load_json(sp)
        allow = set((s.get("permissions") or {}).get("allow") or [])
        miss = [r for r in required_allow() if r not in allow]
        add("FAIL" if miss else "PASS", "allowlist harness di settings.json", ("kurang: %s (jalankan install.sh)" % miss) if miss else sp)
        extra = sorted(allow - set(required_allow()))
        if extra:
            add("WARN", "allow di luar harness (berlaku juga untuk run headless)", "; ".join(x[:70] for x in extra))
        tr = [norm(t) for t in s.get("trustedWorkspaces", [])]
        low = ROOT.lower()
        trusted = any(low == t.lower() or low.startswith(t.lower().rstrip("/") + "/") for t in tr)
        add("PASS" if trusted else "FAIL", "workspace tepercaya", ROOT if trusted else "tambahkan %s ke trustedWorkspaces (lewat agy interaktif)" % ROOT)
    except Exception as e:
        add("FAIL", "settings.json terbaca", "%s: %s" % (sp, e))
    hp = ROOT + "/.agents/hooks.json"
    gate_cmd = ""
    try:
        h = load_json(hp)
        cmds = [hk.get("command", "") for ev in h.values() for e in ev.get("PreToolUse", []) for hk in e.get("hooks", [])]
        gate_cmd = next((x for x in cmds if "executor.py" in x and x.rstrip().endswith(" gate")), "")
        ok = bool(gate_cmd) and (ROOT + "/scripts/executor/executor.py") in gate_cmd.replace("\\", "/")
        add("PASS" if ok else "FAIL", "hooks.json memakai path absolut ke gate", gate_cmd or "tidak ada hook gate (jalankan install.sh)")
    except Exception as e:
        add("FAIL", "hooks.json terbaca", "%s: %s" % (hp, e))
    add("PASS" if cmd_gate_selftest() == 0 else "FAIL", "gate-selftest (logika keputusan)")
    if gate_cmd:
        probe = json.dumps({"toolCall": {"name": "read_file", "args": {"Path": "x"}}})
        import tempfile
        import shlex
        r = subprocess.run(shlex.split(gate_cmd), input=probe, capture_output=True, text=True, cwd=tempfile.gettempdir())
        try:
            ok = json.loads(r.stdout.strip().splitlines()[-1]).get("decision") == "allow"
        except Exception:
            ok = False
        add("PASS" if ok else "FAIL", "hook gate jalan dari direktori kerja asing", (r.stderr or r.stdout).strip()[:150])
    if os.path.exists(ACTIVE):
        add("WARN", "active-task.json masih ada", "sisa dispatch sebelumnya (kedaluwarsa otomatis sesuai ttl)")
    for lv, n, m in rows:
        sys.stderr.write("[%s] %s %s\n" % (lv, n, ("- " + m) if m else ""))
    return 10 if any(r[0] == "FAIL" for r in rows) else 0


def cmd_settings_merge():
    sp = settings_path()
    s = load_json(sp) if os.path.exists(sp) else {}
    allow = s.setdefault("permissions", {}).setdefault("allow", [])
    added = [r for r in required_allow() if r not in allow]
    if added:
        if os.path.exists(sp):
            shutil.copy(sp, "%s.bak-%s" % (sp, datetime.datetime.now().strftime("%Y%m%d%H%M%S")))
        allow.extend(added)
        os.makedirs(os.path.dirname(sp), exist_ok=True)
        Path(sp).write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    emit({"settings": sp, "added": added})
    return 0


def gate_command():
    """Perintah hook: interpreter python absolut + executor.py. TANPA bash: di Windows, bila agy dijalankan dari
    PowerShell, 'bash' di PATH bisa mengarah ke WSL (System32\\bash.exe) dan hook gagal (terbukti di e2e)."""
    q = lambda x: '"%s"' % x if re.search(r"\s", x) else x
    py = str(sys.executable).replace("\\", "/")
    return "%s %s gate" % (q(py), q(ROOT + "/scripts/executor/executor.py"))


def cmd_hooks_gen():
    hp = ROOT + "/.agents/hooks.json"
    os.makedirs(os.path.dirname(hp), exist_ok=True)
    hooks = {"harness-gate": {"PreToolUse": [{"matcher": ".*", "hooks": [
        {"type": "command", "command": gate_command(), "timeout": 10}]}]}}
    Path(hp).write_text(json.dumps(hooks, indent=2) + "\n", encoding="utf-8")
    emit({"hooks": hp})
    return 0


def cmd_cfg(key, default=""):
    v = cfg_all().get(key, default)
    print(" ".join(v) if isinstance(v, list) else v)
    return 0


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 2
    c, a = argv[1], argv[2:]
    table = {"gate": lambda: cmd_gate(), "gate-selftest": lambda: cmd_gate_selftest(),
             "prepare": lambda: cmd_prepare(*a), "envelope": lambda: cmd_envelope(*a),
             "audit": lambda: cmd_audit(*a), "preflight": lambda: cmd_preflight(),
             "settings-merge": lambda: cmd_settings_merge(), "checks": lambda: cmd_checks(*a), "hooks-gen": lambda: cmd_hooks_gen(),
             "cfg": lambda: cmd_cfg(*a)}
    if c not in table:
        sys.stderr.write("subcommand tidak dikenal: %s\n" % c)
        return 2
    return table[c]()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
