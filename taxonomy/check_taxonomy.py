"""Self-check for taxonomy.json. Run: python -I check_taxonomy.py"""
import json
from collections import Counter
from pathlib import Path

T = json.loads((Path(__file__).parent / "taxonomy.json").read_text(encoding="utf-8"))

# Hardcoded on purpose: deriving these from the JSON would make the check vacuous.
NAMES_41 = """Chiaroscuro|Pop-out|Saturation blocking|Simultaneous contrast|Warm and cool split|Scale disparity|
Semantic contrast|Common region|Good continuation|Symmetry|Face schema|Size hierarchy|Temporal synthesis|
Leading lines|Gaze cue|Closure|Forced perspective|Caricatural exaggeration|Contextual metaphor|
Complementary pairing|Rim light|Silhouette|Texture against flat|Isolation in void|Selective focus|Color blocking|
Figure-ground reversal|Proximity clustering|Anthropomorphism|Semantic compounding|Center placement|
Frame within a frame|Body vector|Reading path|Pattern break|Occlusion|Crop at the edge|Visual quotation|
Visible facture|Genre quotation|Form substitution""".replace("\n", "").split("|")
# REFERENCE-ANALYSIS §2.2 floor, plus group.feature, minus group.semantic (user decision; see README.md).
ALLOWED = {
    "differentiate": {"feature", "grouping", "space", "social", "semantic"},
    "group": {"grouping", "social", "feature"},
    "sequence": {"feature", "grouping", "space", "social", "cultural"},
    "infer": {"grouping", "space", "social", "semantic", "cultural"},
}
OBSERVED = {
    ("Differentiate", "Feature", "Complementary pairing"),
    ("Differentiate", "Semantic", "Semantic contrast"),
    ("Infer", "Semantic", "Contextual metaphor"),
    ("Infer", "Cultural", "Genre quotation"),
}

ops = {o["id"]: o for o in T["operations"]}
doms = {d["id"]: d for d in T["domains"]}
brs = {b["id"]: b for b in T["branches"]}
techs = {t["id"]: t for t in T["techniques"]}
links = T["branchTechniques"]

# unique ids
for key, table in [("operations", ops), ("domains", doms), ("branches", brs), ("techniques", techs)]:
    assert len(table) == len(T[key]), f"duplicate id in {key}"
assert len({(b["operationId"], b["domainId"]) for b in T["branches"]}) == len(brs), "duplicate branch pair"
assert len({(l["branchId"], l["techniqueId"]) for l in links}) == len(links), "duplicate link"

# names
assert [o["name"] for o in T["operations"]] == ["Differentiate", "Group", "Sequence", "Infer"]
assert [o["plainLabel"] for o in T["operations"]] == ["Stand out", "Hold together", "Lead the eye", "Make them think"]
assert {d["name"] for d in T["domains"]} == {"Feature", "Grouping", "Space", "Social", "Semantic", "Cultural"}
assert len(NAMES_41) == 41 and len(set(NAMES_41)) == 41
seed = [t["name"] for t in T["techniques"] if not t["custom"]]
assert sorted(seed) == sorted(NAMES_41), set(NAMES_41) ^ set(seed)
# Our own additions are custom: true and must not reuse a reel name.
assert not {t["name"] for t in T["techniques"] if t["custom"]} & set(NAMES_41)
assert len({t["name"].lower() for t in T["techniques"]}) == len(T["techniques"]), "duplicate technique name"

# references resolve, branches allowed
for b in T["branches"]:
    assert b["operationId"] in ops and b["domainId"] in doms, b
    assert b["domainId"] in ALLOWED[b["operationId"]], f"domain not allowed: {b['id']}"
for l in links:
    assert l["branchId"] in brs and l["techniqueId"] in techs, l
    assert l["source"] in ("observed", "drafted") and l["rationale"].strip(), l

# coverage
parents = Counter(l["techniqueId"] for l in links)
assert set(techs) <= set(parents), f"techniques without a branch: {set(techs) - set(parents)}"
assert set(brs) == {l["branchId"] for l in links}, f"empty branch: {set(brs) - {l['branchId'] for l in links}}"
# SPEC §6.3: two domains under one operation forces a domain prompt on every tag; keep it at zero.
op_dom = Counter((brs[l["branchId"]]["operationId"], l["techniqueId"]) for l in links)
assert all(v == 1 for v in op_dom.values()), [k for k, v in op_dom.items() if v > 1]

# observed paths: exactly these four
def path(l):
    b = brs[l["branchId"]]
    return (ops[b["operationId"]]["name"], doms[b["domainId"]]["name"], techs[l["techniqueId"]]["name"])
assert {path(l) for l in links if l["source"] == "observed"} == OBSERVED
assert sum(l["source"] == "observed" for l in links) == 4

# field shape
for t in T["techniques"]:
    assert isinstance(t["custom"], bool) and t["examples"] == [] and t["description"].strip() and t["icon"].strip(), t["id"]
    assert t["synonyms"] and all(isinstance(s, str) and s.strip() for s in t["synonyms"]), t["id"]
    assert t["citation"] is None or (isinstance(t["citation"], str) and t["citation"].strip()), t["id"]
for x in T["operations"] + T["domains"]:
    assert x["icon"].strip() and x["description"].strip(), x["id"]
assert all(o["color"] is None for o in T["operations"])

per_op = {op: len({l["techniqueId"] for l in links if brs[l["branchId"]]["operationId"] == op}) for op in ops}
print(f"OK: {len(brs)} branches, {len(links)} links "
      f"({4} observed, {len(links) - 4} drafted), techniques per operation {per_op}, "
      f"max parents {max(parents.values())}, min parents {min(parents.values())}")
