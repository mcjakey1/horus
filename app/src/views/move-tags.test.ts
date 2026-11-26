// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Taxonomy } from "../api";
import { refOf, seed, snap, tagOf } from "../graph/fixtures.test-util";
import { openMoveBranches, openMoveTags } from "./move-tags";

const refs = [
  refOf("a", [tagOf(seed, { tech: "chiaroscuro" }), tagOf(seed, { tech: "rim-light" }, 1)]),
  refOf("b", [tagOf(seed, { tech: "rim-light" }), tagOf(seed, { op: "infer" }, 1)]),
  refOf("c", [tagOf(seed, { tech: "face-schema", branch: "infer.social" })]),
];
const s = snap(seed, refs);
const dlg = () => document.querySelector<HTMLElement>('[role="alertdialog"]')!;
const radios = () => [...dlg().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const ok = () => dlg().querySelector<HTMLButtonElement>(".tx-ok")!;
const labelOf = (r: HTMLInputElement) => r.closest("label")!.textContent!.trim();
const allPairs = (t: Taxonomy) => t.branchTechniques.map((l) => `${l.techniqueId}|${l.branchId}`);

describe("move-tags dialog", () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.append(host);
  });

  it("move_targets_exclude_self (delete)", async () => {
    const p = openMoveTags(host, { s, techId: "rim-light" });
    expect(dlg().querySelector(".tx-title")!.textContent).toBe("2 references use Rim light");
    const targets = radios().filter((r) => r.value !== "partial").map((r) => r.value);
    expect(targets).toEqual(allPairs(seed).filter((v) => !v.startsWith("rim-light|")));
    const sil = radios().find((r) => r.value === "silhouette|differentiate.feature")!;
    expect(labelOf(sil)).toBe("Silhouette — Differentiate · Feature");
    expect(ok().textContent).toBe("Move and delete");
    sil.click();
    ok().click();
    expect(await p).toEqual({ kind: "technique", techniqueId: "silhouette", branchId: "differentiate.feature" });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("move_targets_exclude_self (unlink: only the pair)", async () => {
    const p = openMoveTags(host, { s, techId: "chiaroscuro", branchId: "differentiate.feature" });
    expect(dlg().querySelector(".tx-title")!.textContent).toBe("1 reference uses Chiaroscuro under Differentiate · Feature");
    const targets = radios().filter((r) => r.value !== "partial").map((r) => r.value);
    expect(targets).toContain("chiaroscuro|sequence.feature");
    expect(targets).not.toContain("chiaroscuro|differentiate.feature");
    expect(targets).toHaveLength(allPairs(seed).length - 1);
    expect(ok().textContent).toBe("Move and unlink");
    // the search narrows the list
    const q = dlg().querySelector<HTMLInputElement>(".tx-search")!;
    q.value = "silhou";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    const shown = radios().filter((r) => r.value !== "partial" && !r.closest("li")!.hidden);
    expect(shown.map((r) => r.value)).toEqual(["silhouette|differentiate.feature"]);
    dlg().querySelector<HTMLButtonElement>(".tx-cancel")!.click();
    expect(await p).toBeNull();
  });

  it("no_default_choice", async () => {
    const p = openMoveTags(host, { s, techId: "rim-light" });
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(ok().disabled).toBe(true);
    const partial = radios().find((r) => r.value === "partial")!;
    expect(labelOf(partial)).toBe("Keep them as partial tags (operation only)");
    partial.click();
    expect(ok().disabled).toBe(false);
    ok().click();
    expect(await p).toEqual({ kind: "partial" });
  });

  it("Escape cancels", async () => {
    const p = openMoveTags(host, { s, techId: "rim-light" });
    dlg().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await p).toBeNull();
  });
});

describe("move-branches dialog", () => {
  beforeEach(() => void (document.body.innerHTML = ""));

  it("delete_operation_dialog: both options with counts, none chosen", async () => {
    const p = openMoveBranches(document.body, { s, kind: "op", id: "infer" });
    const rs = radios();
    expect(rs.some((r) => r.checked)).toBe(false);
    expect(ok().disabled).toBe(true);
    expect(rs.filter((r) => r.value !== "delete").map(labelOf)).toEqual([
      "Move its branches and tags to Stand out", "Move its branches and tags to Hold together", "Move its branches and tags to Lead the eye",
    ]);
    // infer: 2 tags (b's partial, c's face-schema) on 2 references; techniques linked only under infer
    const inferBranches = new Set(seed.branches.filter((b) => b.operationId === "infer").map((b) => b.id));
    const only = new Set(seed.branchTechniques.map((l) => l.techniqueId));
    for (const l of seed.branchTechniques) if (!inferBranches.has(l.branchId)) only.delete(l.techniqueId);
    const del = rs.find((r) => r.value === "delete")!;
    expect(labelOf(del)).toBe(`Delete them and their tags: 2 tags on 2 references, ${only.size} techniques left with no other place`);
    rs.find((r) => r.value === "differentiate")!.click();
    ok().click();
    expect(await p).toEqual({ kind: "operation", operationId: "differentiate" });
  });

  it("domain options", async () => {
    const p = openMoveBranches(document.body, { s, kind: "domain", id: "cultural" });
    const rs = radios();
    expect(rs.filter((r) => r.value !== "delete").map(labelOf)).toEqual(
      ["Move to Feature", "Move to Grouping", "Move to Space", "Move to Social", "Move to Semantic"]);
    expect(labelOf(rs.find((r) => r.value === "delete")!)).toMatch(/^Delete; tags become partial/);
    rs.find((r) => r.value === "delete")!.click();
    ok().click();
    expect(await p).toEqual({ kind: "delete" });
  });
});
