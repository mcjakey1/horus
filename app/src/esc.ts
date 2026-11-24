// The one HTML escape for strings put into innerHTML or attribute values.
const MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s: unknown = ""): string => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
