// The taxonomy as a graph (SPEC §4): operations → branches → techniques → references. A technique
// with several parent branches is one node (a DAG, not a tree). Pure: rebuild it from a Snapshot
// whenever `version` changes; the Snapshot's Map is live, so never cache on identity.
import type { Region, Tag } from "../api";
import type { Snapshot } from "../data";

export type TaxNode =
  | { id: string; kind: "op"; opId: string; count: number }
  | { id: string; kind: "branch"; branchId: string; opId: string; domainId: string; count: number }
  | { id: string; kind: "tech"; techId: string; parents: string[] /* branch ids, taxonomy order */; count: number }
  | { id: string; kind: "ref"; refId: string; via: { techId: string; branchId: string; region?: Region; state: "full" | "region" } };
/** op→branches, branch→techs, tech→refs. Every node has an entry, possibly empty. */
export type TaxGraph = { nodes: Map<string, TaxNode>; children: Map<string, string[]> };

/**
 * Counts are distinct references: tagged with the technique, under the branch, or under the
 * operation. A partial tag (operation only) counts toward its operation and makes no node.
 * `expanded` lists the tech node ids whose references are included, or "all".
 */
export function buildTaxGraph(s: Snapshot, expanded: Set<string> | "all" = new Set()): TaxGraph {
  const { tax } = s;
  const opRefs = new Map(tax.operations.map((o) => [o.id, new Set<string>()]));
  const branchRefs = new Map(tax.branches.map((b) => [b.id, new Set<string>()]));
  /** techId → refId → the reference's first tag with that technique, in library order. */
  const techTags = new Map(tax.techniques.map((t) => [t.id, new Map<string, Tag>()]));
  // Board scope (Plan 4) does not filter here: an out-of-scope reference stays in the graph, and
  // the views draw it as a dot (audit row 10).
  for (const r of s.refs.values()) {
    for (const t of r.tags) {
      opRefs.get(t.operationId)?.add(r.id);
      const byRef = t.techniqueId ? techTags.get(t.techniqueId) : undefined;
      if (!byRef) continue; // partial, or a technique the taxonomy no longer has
      if (t.branchId) branchRefs.get(t.branchId)?.add(r.id);
      if (!byRef.has(r.id)) byRef.set(r.id, t);
    }
  }

  const nodes = new Map<string, TaxNode>();
  const children = new Map<string, string[]>();
  const add = (n: TaxNode, parents: string[] = []) => {
    nodes.set(n.id, n);
    children.set(n.id, []);
    for (const p of parents) children.get(p)?.push(n.id);
  };
  for (const o of tax.operations) add({ id: `op:${o.id}`, kind: "op", opId: o.id, count: opRefs.get(o.id)!.size });
  // ponytail: a branch whose operation is missing is dropped (Rust validates taxonomy.json)
  for (const b of tax.branches)
    if (opRefs.has(b.operationId))
      add({ id: `br:${b.id}`, kind: "branch", branchId: b.id, opId: b.operationId, domainId: b.domainId, count: branchRefs.get(b.id)!.size }, [`op:${b.operationId}`]);
  const branchOrder = new Map(tax.branches.map((b, i) => [b.id, i]));
  const parentsOf = new Map<string, string[]>();
  for (const l of tax.branchTechniques)
    if (nodes.has(`br:${l.branchId}`)) parentsOf.set(l.techniqueId, [...(parentsOf.get(l.techniqueId) ?? []), l.branchId]);
  for (const t of tax.techniques) {
    const parents = [...new Set(parentsOf.get(t.id) ?? [])].sort((a, b) => branchOrder.get(a)! - branchOrder.get(b)!);
    const id = `tech:${t.id}`;
    const byRef = techTags.get(t.id)!;
    add({ id, kind: "tech", techId: t.id, parents, count: byRef.size }, parents.map((b) => `br:${b}`));
    if (expanded !== "all" && !expanded.has(id)) continue;
    for (const [refId, tag] of byRef)
      add({
        id: `ref:${t.id}:${refId}`, kind: "ref", refId,
        via: { techId: t.id, branchId: tag.branchId ?? "", region: tag.region, state: tag.region ? "region" : "full" },
      }, [id]);
  }
  return { nodes, children };
}
