// Plan 3's own small "new technique" form for a branch's "+" (audit row 6: Plan 2's form lives
// inside mountPicker and is not exported). The caller's `api` applies the Change.
import type { Api } from "../api";
import { sayError } from "./move-tags";

export function mountTechniqueForm(host: HTMLElement, api: Api, branchId: string): void {
  // Branch ids are `<operation>.<domain>` and both are slugs ([a-z0-9-]): the first dot splits them.
  const dot = branchId.indexOf(".");
  const operationId = branchId.slice(0, dot);
  const domainId = branchId.slice(dot + 1);
  host.innerHTML = `<form class="tx-tech insp-form" novalidate>
    <label>Name <input name="name" autocomplete="off"></label>
    <label>Definition <textarea name="description" rows="2"></textarea></label>
    <p class="insp-err" role="alert"></p>
    <div class="tx-actions"><button class="fr-btn">Add technique</button><button type="button" class="text-btn tx-cancel">Cancel</button></div>
  </form>`;
  const form = host.querySelector<HTMLFormElement>("form")!;
  const err = form.querySelector<HTMLElement>(".insp-err")!;
  form.querySelector<HTMLInputElement>('[name="name"]')!.focus();
  form.querySelector(".tx-cancel")!.addEventListener("click", () => host.replaceChildren());
  let busy = false;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const name = form.querySelector<HTMLInputElement>('[name="name"]')!.value.trim();
    const description = form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value.trim();
    if (!name) return void (err.textContent = sayError("EmptyName"));
    busy = true;
    // C17: one argument; the wrapper sends `tag: null`.
    api.addTechnique({ name, description, operationId, domainId }).then(
      () => host.replaceChildren(),
      (x) => {
        busy = false;
        err.textContent = sayError(x);
      },
    );
  });
}
