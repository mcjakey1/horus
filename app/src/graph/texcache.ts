/**
 * LRU cache of loaded textures, generic so it needs no renderer. At most `cap` live at once;
 * the least recently used is unloaded. A failed load is remembered and never retried (Review Focus 5).
 */
export class TexCache<T> {
  private live = new Map<string, T>(); // Map order = LRU order, oldest first
  private pending = new Map<string, "loading" | "failed">();

  constructor(
    private cap: number,
    private load: (url: string) => Promise<T>,
    private unload: (t: T) => void,
  ) {}

  get(url: string): T | "loading" | "failed" {
    const t = this.live.get(url);
    if (t !== undefined) {
      this.touch(url);
      return t;
    }
    const state = this.pending.get(url);
    if (state) return state;
    this.pending.set(url, "loading");
    // The executor turns a synchronous throw from `load` into a rejection.
    new Promise<T>((resolve) => resolve(this.load(url))).then(
      (tex) => {
        this.pending.delete(url);
        this.live.set(url, tex);
        for (const [old, oldTex] of this.live) {
          if (this.live.size <= this.cap) break;
          this.live.delete(old);
          this.unload(oldTex);
        }
      },
      () => this.pending.set(url, "failed"),
    );
    return "loading";
  }

  touch(url: string): void {
    const t = this.live.get(url);
    if (t === undefined) return;
    this.live.delete(url);
    this.live.set(url, t);
  }

  size(): number {
    return this.live.size;
  }
}
