"""Write a synthetic demo-format folder for the Plan 3 speed check (Task 11).

    python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7

OUT_DIR/images/pNNNN.jpg are plain 600x800 colour fields with their number on them (synthetic,
no rights questions); OUT_DIR/manifest.json is an array in demo.rs's format. Each entry gets 1-4
distinct (operation, domain, technique) display-name triples, drawn Zipf (weight 1/rank) over the
seed's branchTechniques links in file order, so the first links are common. Start the perf build
with HORUS_DEMO_DIR=OUT_DIR and pick "Start with the demo set".

Needs Pillow >= 10.1 (ImageFont.load_default(size=...)) in the interpreter's own site-packages:
-I ignores the user site.
"""

import argparse
import colorsys
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SEED_TAXONOMY = Path(__file__).resolve().parent.parent / "app" / "src-tauri" / "resources" / "taxonomy.json"


def triples(tax):
    """(operation, domain, technique) names per branch link; to_tag resolves them back."""
    ops = {o["id"]: o["name"] for o in tax["operations"]}
    doms = {d["id"]: d["name"] for d in tax["domains"]}
    techs = {t["id"]: t["name"] for t in tax["techniques"]}
    branches = {b["id"]: b for b in tax["branches"]}
    # to_tag finds names by first match and rebuilds the branch id as "{op}.{domain}".
    assert len(set(techs.values())) == len(techs), "technique names must be unique"
    assert all(k == f'{b["operationId"]}.{b["domainId"]}' for k, b in branches.items())
    out = []
    for link in tax["branchTechniques"]:
        b = branches[link["branchId"]]
        out.append((ops[b["operationId"]], doms[b["domainId"]], techs[link["techniqueId"]]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--n", type=int, default=2500)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    links = triples(json.loads(SEED_TAXONOMY.read_text(encoding="utf-8")))
    weights = [1 / (r + 1) for r in range(len(links))]
    rng = random.Random(a.seed)
    font = ImageFont.load_default(size=160)
    (a.out / "images").mkdir(parents=True, exist_ok=True)

    manifest = []
    for i in range(1, a.n + 1):
        pid = f"p{i:04d}"
        rgb = colorsys.hsv_to_rgb(rng.random(), 0.35 + 0.3 * rng.random(), 0.55 + 0.35 * rng.random())
        img = Image.new("RGB", (600, 800), tuple(round(c * 255) for c in rgb))
        # The number also keeps every file's bytes, and so its hash, distinct (import dedupes by hash).
        ImageDraw.Draw(img).text((300, 400), f"{i:04d}", fill="white", font=font, anchor="mm")
        img.save(a.out / "images" / f"{pid}.jpg", quality=80)

        picked = set()
        want = rng.randint(1, 4)
        while len(picked) < want:
            picked.add(rng.choices(range(len(links)), weights)[0])
        manifest.append({
            "id": pid,
            "file": f"images/{pid}.jpg",
            "title": f"Perf {i:04d}",
            "suggestedTechniques": [
                {"operation": op, "domain": dom, "technique": tech} for op, dom, tech in (links[k] for k in sorted(picked))
            ],
        })

    (a.out / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"wrote {a.n} references to {a.out}")


if __name__ == "__main__":
    main()
