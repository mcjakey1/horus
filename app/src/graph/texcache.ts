/**
 * LRU cache of loaded textures, generic so it needs no renderer. At most `cap` live at once;
 * the least recently used is unloaded. A failed load is remembered and never retried (Review Focus 5).
 * A load that settles after `clear`, `destroy` or `evict` dropped its URL is unloaded, never inserted.
 */
export class TexCache<T> {
  private live = new Map<string, T>(); // Map order = LRU order, oldest first
  private pending = new Map<string, { state: "loading" | "failed"; token: object }>();
  private destroyed = false;

  constructor(
    private cap: number,
    private load: (url: string) => Promise<T>,
    private unload: (t: T) => void,
  ) {}

  get(url: string): T | "loading" | "failed" {
    if (this.destroyed) return "failed";
    const t = this.live.get(url);
    if (t !== undefined) {
      this.touch(url);
      return t;
    }
    const p = this.pending.get(url);
    if (p) return p.state;
    const token = {};
    this.pending.set(url, { state: "loading", token });
    const current = () => this.pending.get(url)?.token === token;
    // The executor turns a synchronous throw from `load` into a rejection.
    new Promise<T>((resolve) => resolve(this.load(url))).then(
      (tex) => {
        if (!current()) {
          if (tex != null) this.unload(tex); // dropped while loading
          return;
        }
        // A loader that resolves nothing counts as failed, so it is not retried every frame.
        if (tex == null) {
          this.pending.set(url, { state: "failed", token });
          return;
        }
        this.pending.delete(url);
        this.live.set(url, tex);
        for (const [old, oldTex] of this.live) {
          if (this.live.size <= this.cap) break;
          this.live.delete(old);
          this.unload(oldTex);
        }
      },
      () => {
        if (current()) this.pending.set(url, { state: "failed", token });
      },
    );
    return "loading";
  }

  touch(url: string): void {
    const t = this.live.get(url);
    if (t === undefined) return;
    this.live.delete(url);
    this.live.set(url, t);
  }

  /** Drops one URL: unloads its texture, or orphans its load. It may load again later. */
  evict(url: string): void {
    const t = this.live.get(url);
    if (t !== undefined) {
      this.live.delete(url);
      this.unload(t);
    }
    if (this.pending.get(url)?.state === "loading") this.pending.delete(url);
  }

  /** Drops an in-flight load only (its node left the view); a live texture stays cached. */
  cancel(url: string): void {
    if (this.pending.get(url)?.state === "loading") this.pending.delete(url);
  }

  /** Unloads every live texture and forgets loads and failures (after a lost WebGL context). */
  clear(): void {
    const all = [...this.live.values()];
    this.live.clear();
    this.pending.clear();
    for (const t of all) this.unload(t);
  }

  /** `clear`, and nothing loads again. */
  destroy(): void {
    this.destroyed = true;
    this.clear();
  }

  /** The live URLs, least recently used first: what to reload after `clear`. */
  urls(): string[] {
    return [...this.live.keys()];
  }

  size(): number {
    return this.live.size;
  }
}
