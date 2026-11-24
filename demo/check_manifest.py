"""Usage: python -I demo/check_manifest.py [taxonomy.json] [manifest.json]  (defaults: ../taxonomy/taxonomy.json, ./manifest.json; exit 1 on any BAD line)"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
args = sys.argv[1:] + [None, None]
T = json.load(open(args[0] or HERE.parent / "taxonomy" / "taxonomy.json", encoding="utf-8"))
M = json.load(open(args[1] or HERE / "manifest.json", encoding="utf-8"))
ops = {o["id"]: o["name"] for o in T["operations"]}
doms = {d["id"]: d["name"] for d in T["domains"]}
br = {b["id"]: (ops[b["operationId"]], doms[b["domainId"]]) for b in T["branches"]}
tn = {t["id"]: t["name"] for t in T["techniques"]}
paths = {}
for l in T["branchTechniques"]:
    paths.setdefault(tn[l["techniqueId"]], []).append(br[l["branchId"]])

errors = 0
def bad(*msg):
    global errors
    errors += 1
    print("BAD", *msg)

def num01(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1

if not isinstance(M, list):
    bad("manifest is not a list"); sys.exit(1)
seen, n = set(), 0
for i, m in enumerate(M):
    if not isinstance(m, dict):
        bad(f"item {i} is not an object"); continue
    rid = m.get("id")
    if not isinstance(rid, str) or not rid.strip():
        bad(f"item {i}: missing id")
    elif rid in seen:
        bad(f"duplicate id {rid}")
    seen.add(rid)
    tags = m.get("suggestedTechniques", [])
    if not isinstance(tags, list):
        bad(f"{rid}: suggestedTechniques is not a list"); continue
    dup = set()
    for x in tags:
        n += 1
        if not isinstance(x, dict):
            bad(f"{rid}: tag is not an object"); continue
        tech, op, dom, state, reg = (x.get(k) for k in ("technique", "operation", "domain", "state", "region"))
        where = f"{rid}: {op} > {dom} > {tech}"
        if op not in ops.values():
            bad("operation |", where)
        if tech is not None:
            if not isinstance(tech, str) or not tech.strip():
                bad("empty technique |", where)
            elif tech not in paths:
                bad("unknown technique |", where)
            elif (op, dom) not in paths[tech]:
                bad("path |", where, "| valid:", "; ".join(f"{a} > {b}" for a, b in paths[tech]))
            if state == "partial":
                bad("technique tag marked 'partial' |", where)
            if reg is None:  # several regions of one technique are fine (SPEC §4 collapses them)
                key = repr((op, dom, tech))  # repr: malformed list/dict values must not crash the check
                if key in dup:
                    bad("duplicate tag |", where)
                dup.add(key)
        else:
            if state != "partial":  # app.js defaults a missing state to "full"
                bad("partial tag without state 'partial' |", where)
            if dom is not None:  # SPEC §3: partial tag carries operation only
                bad("partial tag with a domain |", where)
        if state not in (None, "full", "partial", "region"):
            bad(f"state {state!r} |", where)
        if state == "region" and reg is None:
            bad("state 'region' without a region |", where)
        if reg is not None:
            ok = isinstance(reg, dict) and all(num01(reg.get(k)) for k in "xywh")
            if not (ok and reg["w"] > 0 and reg["h"] > 0 and reg["x"] + reg["w"] <= 1 and reg["y"] + reg["h"] <= 1):
                bad(f"region {reg} |", where)
print(f"DONE {len(M)} references, {n} tags, {errors} problems")
sys.exit(1 if errors else 0)
