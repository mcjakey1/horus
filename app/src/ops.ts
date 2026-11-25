// Operation inks and labels, read from the taxonomy (operations are data: 1–9 of them, renamable).
// The only place operation inks are resolved (Plan 3 Task 2 owns the same interface).
import type { Taxonomy } from "./api";

export type Ink = { base: string; text: string; on: string };

/** The four seed operations' DESIGN.md inks. */
export const SEED_INK: Record<string, "diff" | "group" | "seq" | "infer"> = {
  differentiate: "diff",
  group: "group",
  sequence: "seq",
  infer: "infer",
};

/** Inks for added operations (Plan 3; values in DESIGN.md). */
export const EXTRA_INKS = ["teal", "olive", "rose", "indigo", "umber"] as const;

const NEUTRAL: Ink = { base: "var(--ink-2)", text: "var(--ink)", on: "var(--panel)" };
const ink = (k: string): Ink => ({ base: `var(--${k})`, text: `var(--${k}-text)`, on: `var(--${k}-on)` });

/** `color` ∈ EXTRA_INKS first, then the seed ink by id, else neutral. */
export function opInk(tax: Taxonomy, opId: string): Ink {
  const op = tax.operations.find((o) => o.id === opId);
  if (!op) return NEUTRAL;
  if (op.color && (EXTRA_INKS as readonly string[]).includes(op.color)) return ink(`x-${op.color}`);
  return Object.prototype.hasOwnProperty.call(SEED_INK, op.id) ? ink(SEED_INK[op.id]) : NEUTRAL;
}

/** Unknown ids show the id itself. */
export function opLabel(tax: Taxonomy, opId: string): { plain: string; name: string } {
  const op = tax.operations.find((o) => o.id === opId);
  return op ? { plain: op.plainLabel, name: op.name } : { plain: opId, name: opId };
}
