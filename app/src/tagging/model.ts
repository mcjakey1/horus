// The tagging picker's pure rules: which techniques an operation offers, when to ask for the
// domain, the search filter (kept in step with search.rs by match-cases.json), examples, presets.
import type { Branch, DemoExample, NewTag, Reference, Taxonomy, Technique } from "../api";

/** The operation's techniques, in taxonomy order. */
export function techniquesFor(tax: Taxonomy, opId: string): Technique[] {
  const branches = new Set(tax.branches.filter((b) => b.operationId === opId).map((b) => b.id));
  const ids = new Set(tax.branchTechniques.filter((l) => branches.has(l.branchId)).map((l) => l.techniqueId));
  return tax.techniques.filter((t) => ids.has(t.id));
}

/** One branch: inferred. Several: the picker asks (SPEC §6.3). */
export function domainChoice(tax: Taxonomy, opId: string, techId: string): { branchId: string } | { ask: Branch[] } {
  const bs = tax.branches.filter(
    (b) => b.operationId === opId && tax.branchTechniques.some((l) => l.branchId === b.id && l.techniqueId === techId),
  );
  return bs.length === 1 ? { branchId: bs[0].id } : { ask: bs };
}

// Mirrors search.rs `normalise`: Rust's char::is_alphanumeric is Alphabetic or N, and
// Alphabetic (unlike \p{L}) keeps combining vowel signs such as Devanagari U+093E.
const normalise = (s: string) =>
  s.normalize("NFC").toLowerCase().replace(/[^\p{Alphabetic}\p{N}]+/gu, " ").trim();
const hasPhrase = (hay: string, phrase: string) => phrase !== "" && ` ${hay} `.includes(` ${phrase} `);

/** search.rs's technique rules. A blank query matches everything. */
export function matchesQuery(t: Technique, q: string): boolean {
  const n = normalise(q);
  if (!n) return true;
  const field = (s: string) => {
    const f = normalise(s);
    return f.includes(n) || hasPhrase(n, f);
  };
  if (field(t.name) || t.synonyms.some(field)) return true;
  const words = n.split(" ").filter((w) => [...w].length > 3); // code points, as Rust's chars().count()
  const d = normalise(t.description);
  return words.length > 0 && words.every((w) => hasPhrase(d, w));
}

export type Example = { kind: "library"; ref: Reference } | { kind: "demo"; demo: DemoExample };

/** The library's own uses first (confirmed before suggested, newest first), then demo examples (SPEC §6.2). */
export function examplesFor(refs: Iterable<Reference>, techId: string, n = 2, demo: DemoExample[] = []): Example[] {
  const confirmed = (r: Reference) => r.tags.some((t) => t.techniqueId === techId && !t.suggested);
  const own = [...refs]
    .filter((r) => r.tags.some((t) => t.techniqueId === techId))
    .sort((a, b) => Number(confirmed(b)) - Number(confirmed(a)) || b.addedAt.localeCompare(a.addedAt));
  return [
    ...own.map((ref): Example => ({ kind: "library", ref })),
    ...demo.filter((d) => d.techniqueId === techId).map((d): Example => ({ kind: "demo", demo: d })),
  ].slice(0, n);
}

/** "Tag like this": the source's whole-image technique tags, once each. */
export function presetFrom(source: Reference): NewTag[] {
  const seen = new Set<string>();
  return source.tags.flatMap((t) => {
    const k = `${t.operationId}|${t.techniqueId}|${t.branchId}`;
    if (!t.techniqueId || seen.has(k)) return [];
    seen.add(k);
    return [{ operationId: t.operationId, techniqueId: t.techniqueId, branchId: t.branchId }];
  });
}
