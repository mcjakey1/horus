// Typed wrappers for the Rust commands (Plan 1, Task 7). All JSON is camelCase.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export type Region = { x: number; y: number; w: number; h: number };

export type Tag = {
  id: string;
  operationId: string;
  techniqueId?: string;
  branchId?: string;
  region?: Region;
  suggested: boolean;
};

export type Reference = {
  id: string;
  title: string;
  creator?: string;
  year?: string;
  sourceUrl?: string;
  credit?: string;
  note?: string;
  file: string;
  hash: string;
  width: number;
  height: number;
  addedAt: string;
  tags: Tag[];
  /** Absolute paths built in Rust. Pass through `assetUrl`, never concatenate. */
  thumb256: string;
  thumb1024: string;
};

export type Link = { id: string; fromRef: string; toRef: string; why: string };

export type LibraryView = {
  root: string;
  references: Reference[];
  links: Link[];
  warning?: string | null;
  /** Demo-seed problems; already joined into `warning`. */
  seedWarnings?: string[];
  /** The seed fallback after a damaged taxonomy.json; taxonomy edits are refused. */
  taxonomyReadOnly: boolean;
};

export type Operation = { id: string; name: string; plainLabel: string; color?: string | null; icon: string; description: string };
export type Domain = { id: string; name: string; icon: string; description: string };
export type Branch = { id: string; operationId: string; domainId: string };
export type Technique = {
  id: string;
  name: string;
  icon: string;
  description: string;
  synonyms: string[];
  citation?: string | null;
  examples: unknown[];
  custom: boolean;
};
export type Taxonomy = {
  operations: Operation[];
  domains: Domain[];
  branches: Branch[];
  techniques: Technique[];
  branchTechniques: { branchId: string; techniqueId: string }[];
};

// Plan 2 Task 5 types.
export type NewTag = { operationId: string; techniqueId?: string; branchId?: string; region?: Region };
/** A bundled demo image that uses a technique (SPEC §6.2); `path` is absolute. */
export type DemoExample = { techniqueId: string; title: string; path: string };
/** A custom technique (SPEC §6.7); Rust saves it with `custom: true` under `operationId`'s `domainId` branch. */
export type NewTechnique = { name: string; description: string; operationId: string; domainId: string };
/** Tag this reference with the new technique in the same undo step. */
export type TagFor = { refId: string; region?: Region };
/** Absent keeps the field, `null` clears it; Rust trims, and `""` clears too. */
export type FieldPatch = { note?: string | null; sourceUrl?: string | null };
/** Optional intake metadata (SPEC §2); stored as text, never fetched. */
export type IntakeMeta = { note?: string; sourceUrl?: string };
/** What a mutating command changed. `taxonomy` is set only when it changed. */
export type Change = {
  references: Reference[];
  removed: string[];
  taxonomy?: Taxonomy | null;
  created?: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type Scored = { id: string; score: number; sharedTechniques: string[]; sharedBranches: string[] };

/** Why a file was skipped; `detail` is a message, or the byte size for `tooLarge`. */
export type Skip =
  | { kind: "unsupported" | "unreadable" | "writeFailed"; detail: string }
  | { kind: "tooLarge"; detail: number }
  | { kind: "insideLibrary" };

export type ImportReport = {
  added: string[];
  duplicates: [string, string][];
  skipped: [string, Skip][];
  warnings?: [string, string][];
};
/** An import saves at once and is one undo step; `change` holds the new references. */
export type ImportResult = { report: ImportReport; change: Change };
/** The background saver's result after each debounced flush. */
export type SaveStatus = { ok: boolean; message?: string };

/** Task 6 `search`: tagged camelCase union; ≤ 8 technique hits by count, then ≤ 4 reference hits. */
export type Hit =
  | { kind: "technique"; id: string; operationId: string; count: number }
  | { kind: "reference"; id: string };

export type Settings = {
  lastLibrary: string | null;
  theme: "system" | "light" | "dark";
  findSimilar: "unset" | "on" | "off";
};

export interface Api {
  /** `seedDemo` imports the bundled demo set into the new library. */
  createLibrary(path: string, seedDemo: boolean): Promise<LibraryView>;
  openLibrary(path: string): Promise<LibraryView>;
  getTaxonomy(): Promise<Taxonomy>;
  related(id: string): Promise<Scored[]>;
  importPaths(paths: string[], meta?: IntakeMeta): Promise<ImportResult>;
  /** A pasted image: `name` is a file name (only its last part is kept). */
  importBytes(name: string, bytes: ArrayBuffer | Uint8Array, meta?: IntakeMeta): Promise<ImportResult>;
  search(q: string): Promise<Hit[]>;
  getSettings(): Promise<Settings>;
  /** A patch: only the fields sent change (Rust merges into the stored settings). */
  setSettings(s: Partial<Settings>): Promise<void>;
  /** Total RAM in whole GB, or null if it could not be read. */
  systemRamGb(): Promise<number | null>;
  /** Native folder picker; null when cancelled. */
  pickFolder(title: string): Promise<string | null>;
  /** Native multi-file picker filtered to images; [] when cancelled. */
  pickImages(): Promise<string[]>;
  /** URL for an absolute file path from Rust (asset protocol). */
  assetUrl(path: string): string;
  undo(): Promise<Change>;
  redo(): Promise<Change>;
  // Plan 2 Task 5 commands (Task 8 builds against them). Errors are plain strings, e.g. "NameTaken:<id>".
  /** One undo step for the whole list ("Tag like this"). */
  addTags(refId: string, tags: NewTag[]): Promise<Change>;
  /** Replaces the tag; sets `suggested: false` (editing confirms). */
  updateTag(refId: string, tagId: string, tag: NewTag): Promise<Change>;
  removeTag(refId: string, tagId: string): Promise<Change>;
  /** With `tag`: adds the technique and tags the reference in one undo step; `Change.created` is the new id. */
  addTechnique(t: NewTechnique, tag?: TagFor): Promise<Change>;
  demoExamples(): Promise<DemoExample[]>;
  /** One undo step for every id and field. */
  setField(refIds: string[], patch: FieldPatch): Promise<Change>;
  /** Absolute path of the original image, for the lightbox. */
  imagePath(refId: string): Promise<string>;
  /** The save-failure dialog's "Try again"; on success Rust closes the window. */
  retrySave(): Promise<void>;
  /** The save-failure dialog's "Quit without saving". */
  exitWithoutSaving(): Promise<void>;
  onSaveStatus(cb: (s: SaveStatus) => void): Promise<() => void>;
  /** The window's close was stopped because the final save failed. */
  onSaveFailed(cb: (message: string) => void): Promise<() => void>;
  /** The window's close waits for a running import; Rust closes it when that ends. */
  onCloseWaiting(cb: () => void): Promise<() => void>;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "gif"];

export const tauriApi: Api = {
  createLibrary: (path, seedDemo) => invoke("create_library", { path, seedDemo }),
  openLibrary: (path) => invoke("open_library", { path }),
  getTaxonomy: () => invoke("get_taxonomy"),
  related: (id) => invoke("related", { id }),
  importPaths: (paths, meta) =>
    invoke("import_paths", { paths, note: meta?.note ?? null, sourceUrl: meta?.sourceUrl ?? null }),
  // Headers carry ASCII only, so the metadata travels percent-encoded.
  importBytes: (name, bytes, meta) =>
    invoke("import_bytes", bytes, { headers: { "x-meta": encodeURIComponent(JSON.stringify({ name, ...meta })) } }),
  search: (q) => invoke("search", { q }),
  getSettings: () => invoke("get_settings"),
  setSettings: (s) => invoke("set_settings", { s }),
  systemRamGb: () => invoke("system_ram_gb"),
  pickFolder: async (title) => {
    const p = await open({ directory: true, title });
    return typeof p === "string" ? p : null;
  },
  pickImages: async () =>
    (await open({ multiple: true, title: "Import images", filters: [{ name: "Images", extensions: IMAGE_EXTS }] })) ?? [],
  assetUrl: (path) => convertFileSrc(path),
  undo: () => invoke("undo"),
  redo: () => invoke("redo"),
  addTags: (refId, tags) => invoke("add_tags", { refId, tags }),
  updateTag: (refId, tagId, tag) => invoke("update_tag", { refId, tagId, tag }),
  removeTag: (refId, tagId) => invoke("remove_tag", { refId, tagId }),
  addTechnique: (t, tag) => invoke("add_technique", { t, tag: tag ?? null }),
  demoExamples: () => invoke("demo_examples"),
  setField: (refIds, patch) => invoke("set_field", { refIds, patch }),
  imagePath: (refId) => invoke("image_path", { refId }),
  retrySave: () => invoke("retry_save"),
  exitWithoutSaving: () => invoke("exit_without_saving"),
  onSaveStatus: (cb) => listen<SaveStatus>("save-status", (e) => cb(e.payload)),
  onSaveFailed: (cb) => listen<{ message: string }>("save-failed", (e) => cb(e.payload.message)),
  onCloseWaiting: (cb) => listen("close-waiting", () => cb()),
};
