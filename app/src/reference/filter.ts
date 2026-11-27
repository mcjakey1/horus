// The Ranked pane's technique filter (SPEC §5a): view state only, never saved or undone.
import type { Reference } from "../api";

/** `refs` (Plan 6 Task 2, "Show them"): only these references, before any technique test. */
export type Filter = { techniques: string[]; mode: "and" | "or"; refs?: string[] };

/** An empty filter matches everything; a partial tag (no techniqueId) never matches. */
export function matchesFilter(ref: Reference, f: Filter): boolean {
  if (f.refs && !f.refs.includes(ref.id)) return false;
  if (!f.techniques.length) return true;
  const has = (id: string) => ref.tags.some((t) => t.techniqueId === id);
  return f.mode === "and" ? f.techniques.every(has) : f.techniques.some(has);
}

export function toggle(f: Filter, techId: string): Filter {
  const on = f.techniques.includes(techId);
  return { ...f, techniques: on ? f.techniques.filter((x) => x !== techId) : [...f.techniques, techId] };
}
