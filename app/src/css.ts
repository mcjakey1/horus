// Plan 6 Task 1: the CSP is `style-src 'self'`, which blocks a style attribute parsed from
// innerHTML but not the CSSOM. Templates write a `data-css` attribute instead; this copies each one to
// `el.style.cssText` and drops the attribute. Call it after every innerHTML that carries one.
export function applyCss(root: ParentNode): void {
  const all = [...root.querySelectorAll<HTMLElement | SVGElement>("[data-css]")];
  if (root instanceof Element && root.hasAttribute("data-css")) all.push(root as HTMLElement);
  for (const el of all) {
    el.style.cssText = el.getAttribute("data-css") ?? "";
    el.removeAttribute("data-css");
  }
}
