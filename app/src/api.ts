// Typed wrappers for the Rust commands (Plan 1, Task 7). All JSON is camelCase.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

export type Scored = { id: string; score: number; sharedTechniques: string[]; sharedBranches: string[] };

/** Why a file was skipped; `detail` is a message, or the byte size for `tooLarge`. */
export type Skip =
  | { kind: "unsupported" | "unreadable" | "writeFailed"; detail: string }
  | { kind: "tooLarge"; detail: number };

export type ImportReport = {
  added: string[];
  duplicates: [string, string][];
  skipped: [string, Skip][];
  warnings?: [string, string][];
};

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
  importPaths(paths: string[]): Promise<ImportReport>;
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
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "gif"];

export const tauriApi: Api = {
  createLibrary: (path, seedDemo) => invoke("create_library", { path, seedDemo }),
  openLibrary: (path) => invoke("open_library", { path }),
  getTaxonomy: () => invoke("get_taxonomy"),
  related: (id) => invoke("related", { id }),
  importPaths: (paths) => invoke("import_paths", { paths }),
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
};
