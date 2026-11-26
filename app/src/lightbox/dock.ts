// The lightbox with the technique picker docked in its side slot (Plan 4 Task 7, R23): lifted out
// of the Reference view so the Reference view and Compare share one copy. It owns its docked
// picker, never nulls a newer one, and closes it when the lightbox closes.
import type { Api } from "../api";
import type { Store } from "../store";
import { mountPicker } from "../tagging/picker";
import { openLightbox } from "./view";

export function openLightboxWithPicker(
  api: Api,
  store: Store,
  refId: string,
  deps: { beforePicker?(): void; onClose?(): void },
): { close(): void } {
  let picker: ReturnType<typeof mountPicker> | null = null;
  const closePicker = () => {
    picker?.close();
    picker = null;
  };
  return openLightbox(api, store, refId, {
    openPicker: (opts) => {
      deps.beforePicker?.(); // e.g. the Reference view's margin picker closes first
      closePicker();
      // Docked inside the modal so it can be reached and focus stays trapped.
      const slot = document.querySelector<HTMLElement>(".lightbox .lb-side");
      if (!slot) return;
      const mine = mountPicker(slot, api, store, {
        ...opts,
        onDone: closePicker,
        onClose: () => void (picker === mine && (picker = null)), // never null a newer picker
      });
      picker = mine;
    },
    // The docked picker left with the lightbox's DOM: close it so it unsubscribes.
    onClose: () => {
      closePicker();
      deps.onClose?.();
    },
  });
}
