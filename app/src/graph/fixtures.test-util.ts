// Shared test builders for the taxonomy graph and its layouts (tests only).
import seedJson from "../../src-tauri/resources/taxonomy.json";
import type { Reference, Region, Tag, Taxonomy } from "../api";
import type { Snapshot } from "../data";

export const seed = seedJson as unknown as Taxonomy;

/** A full tag through the seed's first branch for `techId`, or a partial one when `techId` is absent. */
export function tagOf(tax: Taxonomy, opOrTech: { op: string } | { tech: string; branch?: string; region?: Region }, n = 0): Tag {
  if ("op" in opOrTech) return { id: `t${n}`, operationId: opOrTech.op, suggested: false };
  const branchId = opOrTech.branch ?? tax.branchTechniques.find((l) => l.techniqueId === opOrTech.tech)!.branchId;
  const operationId = tax.branches.find((b) => b.id === branchId)!.operationId;
  return { id: `t${n}`, operationId, techniqueId: opOrTech.tech, branchId, region: opOrTech.region, suggested: false };
}

export function refOf(id: string, tags: Tag[]): Reference {
  return {
    id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
    addedAt: "2026-11-25T00:00:00Z", tags, thumb256: id, thumb1024: id,
  };
}

export function snap(tax: Taxonomy, refs: Reference[] = []): Snapshot {
  return {
    refs: new Map(refs.map((r) => [r.id, r])), links: [], tax, version: 0,
    taxonomyReadOnly: false, inScope: () => true,
  };
}

/** A synthetic taxonomy: `ops` operations, each with 2 branches of 2 techniques (none shared). */
export function synth(ops: number): Taxonomy {
  const t: Taxonomy = { operations: [], domains: [{ id: "d", name: "D", icon: "", description: "" }], branches: [], techniques: [], branchTechniques: [] };
  for (let o = 0; o < ops; o++) {
    t.operations.push({ id: `o${o}`, name: `Op ${o}`, plainLabel: "", icon: "", description: "" });
    for (let b = 0; b < 2; b++) {
      const branchId = `o${o}.b${b}`;
      t.branches.push({ id: branchId, operationId: `o${o}`, domainId: "d" });
      for (let k = 0; k < 2; k++) {
        const id = `t${o}-${b}-${k}`;
        t.techniques.push({ id, name: id, icon: "", description: "", synonyms: [], examples: [], custom: false });
        t.branchTechniques.push({ branchId, techniqueId: id });
      }
    }
  }
  return t;
}
