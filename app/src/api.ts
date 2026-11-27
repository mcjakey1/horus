// Typed wrappers for the Rust commands (Plan 1, Task 7). All JSON is camelCase.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { resolveResource } from "@tauri-apps/api/path";

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
/** Plan 4: `referenceIds` in board order. */
export type Board = { id: string; name: string; referenceIds: string[] };
/** `written`: image file names in board order; `skipped`: [reference id, reason]. */
export type ExportReport = { written: string[]; credits: string | null; skipped: [string, string][] };
/** What the lightbox loads: the original (`full`), or a cached PNG preview. */
export type LightboxSource = { path: string; full: boolean; width: number; height: number };

export type LibraryView = {
  root: string;
  references: Reference[];
  links: Link[];
  boards: Board[];
  warning?: string | null;
  /** Demo-seed problems; already joined into `warning`. */
  seedWarnings?: string[];
  /** The seed fallback after a damaged taxonomy.json; taxonomy edits are refused. */
  taxonomyReadOnly: boolean;
  /** Plan 6 Task 2: what the open found on disk; absent or null when nothing. */
  integrity?: IntegrityReport | null;
};

/** Plan 6 Task 4: Help > Verify image files… `changed`: reference ids whose file no longer matches. */
export type VerifyReport = { changed: string[]; checked: number; total: number };

/** Plan 6 Task 4: the Help menu's items, as Rust emits them on `menu://action`. */
export type MenuId = "play-intro" | "about" | "verify";

/** Plan 6 Task 2. Paths are absolute; ids are reference ids. */
export type IntegrityReport = {
  sweptTmp: string[];
  /** Never removed from the library: "Show them" lists them. */
  missingOriginals: string[];
  /** Rebuilt in the background; `onThumbsRebuilt` reports the ids. */
  missingThumbs: string[];
  /** Image files no reference points to: "Add them" makes them Inbox references. */
  orphans: string[];
  taxonomyBackupInvalid: boolean;
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
/** Absent keeps a field, null (or "") clears it. Plan 6 Task 3c adds the four detail fields (title can't be cleared). */
export type FieldPatch = {
  note?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  creator?: string | null;
  year?: string | null;
  credit?: string | null;
};
/** Optional intake metadata (SPEC §2); stored as text, never fetched. */
export type IntakeMeta = { note?: string; sourceUrl?: string };
/** What a mutating command changed. `taxonomy` is set only when it changed. */
export type Change = {
  references: Reference[];
  removed: string[];
  taxonomy?: Taxonomy | null;
  created?: string | null;
  /**
   * Tags an operation or domain move could not re-point (their technique or branch was already
   * missing) and kept as partial tags in the same undo step; 0 otherwise. Rust always sends it.
   */
  madePartial?: number;
  /** Plan 4: the full lists, set only when a link or a board changed. Absent in older fakes. */
  links?: Link[] | null;
  boards?: Board[] | null;
  canUndo: boolean;
  canRedo: boolean;
};

// Plan 3 Task 9: taxonomy edits. Patches: an absent key keeps the field.
export type TechniquePatch = { name?: string; description?: string; synonyms?: string[] };
export type DomainPatch = { name?: string; description?: string; icon?: string };
/** `color`: absent keeps it, `null` resets it (seed ink by id, or neutral), a name in EXTRA_INKS sets it. */
export type OperationPatch = { name?: string; plainLabel?: string; description?: string; color?: string | null };
/** Where the tags of a removed technique or link go: another linked pair, or kept as partial tags. */
export type TagMove = { kind: "technique"; techniqueId: string; branchId: string } | { kind: "partial" };
export type OpMove = { kind: "operation"; operationId: string } | { kind: "delete" };
export type DomainMove = { kind: "domain"; domainId: string } | { kind: "delete" };

export type Scored = { id: string; score: number; sharedTechniques: string[]; sharedBranches: string[] };
/** A Galaxy edge: one per pair, `a < b`. */
export type Edge = { a: string; b: string; score: number };

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
  /** Plan 6 D15: Cancel stopped it between files; what was imported before stays. */
  cancelled?: boolean;
};
/** `import://progress`: files done of the import's total (Plan 6 D15). */
export type ImportProgress = { done: number; total: number };
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
  /** Plan 6 Task 4: the intro played once (or was skipped); "Play intro" never changes it. */
  introSeen: boolean;
};

/** Plan 5 Find similar. `error` is artist copy from Rust's one copy table, never raw error text. */
export type SimilarPhase = "off" | "downloading" | "verifying" | "loading" | "indexing" | "paused" | "ready" | "error";
export type SimilarStatus = {
  phase: SimilarPhase;
  downloadDone: number;
  /** Always the model's full size, in every phase. */
  downloadTotal: number;
  indexed: number;
  total: number;
  /** The model folder plus the open library's embeddings.bin. */
  diskBytes: number;
  error: string | null;
};
/** Highest first; the UI shows rank order only, never the score (it differs by mode). */
export type SimHit = { id: string; score: number };

export interface Api {
  /** `seedDemo` imports the bundled demo set into the new library. */
  createLibrary(path: string, seedDemo: boolean): Promise<LibraryView>;
  openLibrary(path: string): Promise<LibraryView>;
  getTaxonomy(): Promise<Taxonomy>;
  related(id: string): Promise<Scored[]>;
  /** The union of every visible reference's top `k` neighbours among those sharing a technique, deduplicated. */
  graphEdges(k: number): Promise<Edge[]>;
  /** Plan 6 Task 2, "Add them": the open library's orphans as Inbox references, one undo step. */
  recoverOrphans(): Promise<Change>;
  /** Plan 6 Task 2: the reference ids whose thumbnails were rebuilt after an open. */
  onThumbsRebuilt(cb: (ids: string[]) => void): Promise<() => void>;
  // Plan 6 Task 4: the native menu, About and "Verify image files…".
  /** A Help menu item was chosen (File > Open library folder is handled in Rust). */
  onMenu(cb: (id: MenuId) => void): Promise<() => void>;
  appVersion(): Promise<string>;
  /** Absolute path of the bundled THIRD_PARTY_NOTICES.md ($RESOURCE). */
  noticesPath(): Promise<string>;
  /** The capability allows exactly one path: the notices (R10). */
  openPath(path: string): Promise<void>;
  /** Hashes every original; `checked < total` when cancelled. Never changes the library. */
  verifyImageFiles(): Promise<VerifyReport>;
  cancelVerify(): Promise<void>;
  onVerifyProgress(cb: (p: { done: number; total: number }) => void): Promise<() => void>;
  importPaths(paths: string[], meta?: IntakeMeta): Promise<ImportResult>;
  /** Plan 6 D15: stops the running import before its next file. */
  cancelImport(): Promise<void>;
  /** Plan 6 D15: the running import's progress. */
  onImportProgress(cb: (p: ImportProgress) => void): Promise<() => void>;
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
  /** Plan 4 Task 5: shows `path` in the file manager (opener: reveal-item-in-dir only). */
  revealFolder(path: string): Promise<void>;
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
  // Plan 3 Task 9 taxonomy edits; each is one undo step. Errors: "NeedsMove", "LastLink",
  // "LastOperation", "TooManyOperations", "UnknownInk", "UnknownIcon", "EmptyName",
  // "BadMoveTarget", "NameTaken:<id>", "LabelTaken:<id>", "TaxonomyReadOnly".
  updateTechnique(id: string, patch: TechniquePatch): Promise<Change>;
  /** "NeedsMove" while tags use it and no `moveTo` is given. */
  deleteTechnique(id: string, moveTo?: TagMove): Promise<Change>;
  linkTechnique(techniqueId: string, branchId: string): Promise<Change>;
  /** "LastLink" for its only link; "NeedsMove" while tags use the pair and no `moveTo` is given. */
  unlinkTechnique(techniqueId: string, branchId: string, moveTo?: TagMove): Promise<Change>;
  addBranch(operationId: string, domainId: string): Promise<Change>;
  /** `Change.created` is the new id; with `operationId` its branch is added in the same step. */
  addDomain(name: string, description: string, icon?: string, operationId?: string): Promise<Change>;
  updateDomain(id: string, patch: DomainPatch): Promise<Change>;
  deleteDomain(id: string, moveTo?: DomainMove): Promise<Change>;
  /** `Change.created` is the new id; without `color` it takes the first free extra ink. */
  addOperation(name: string, plainLabel: string, description: string, color?: string): Promise<Change>;
  updateOperation(id: string, patch: OperationPatch): Promise<Change>;
  deleteOperation(id: string, moveTo?: OpMove): Promise<Change>;
  // Plan 4 Task 3. Each edit is one undo step. Errors are wire codes: "SelfLink",
  // "DuplicateLink:<id>", "EmptyWhy", "EmptyName", "BoardNameTaken:<id>", "UnknownLink:<id>",
  // "UnknownBoard:<id>".
  /** `Change.created` is the link id. */
  addLink(fromRef: string, toRef: string, why: string): Promise<Change>;
  updateLink(linkId: string, why: string): Promise<Change>;
  removeLink(linkId: string): Promise<Change>;
  /** `Change.created` is the board id. */
  createBoard(name: string, referenceIds: string[]): Promise<Change>;
  renameBoard(boardId: string, name: string): Promise<Change>;
  /** Add, remove and reorder in one call. */
  setBoardMembers(boardId: string, referenceIds: string[]): Promise<Change>;
  deleteBoard(boardId: string): Promise<Change>;
  /** Copies the board's images and a credits file into `dest`. Reasons carry the OS's text. */
  exportBoard(boardId: string, dest: string): Promise<ExportReport>;
  /** Any two visible references, with no minimum-score cut. */
  scorePair(a: string, b: string): Promise<Scored>;
  lightboxSource(refId: string): Promise<LightboxSource>;
  /** The intake queue went busy or drained: a close waits while it is busy (R2). */
  intakeBusy(busy: boolean): Promise<void>;
  /** The save-failure dialog's "Try again"; on success Rust closes the window. */
  retrySave(): Promise<void>;
  /** The save-failure dialog's "Quit without saving". */
  exitWithoutSaving(): Promise<void>;
  onSaveStatus(cb: (s: SaveStatus) => void): Promise<() => void>;
  /** The window's close was stopped because the final save failed. */
  onSaveFailed(cb: (message: string) => void): Promise<() => void>;
  /** The window's close waits for a running import; Rust closes it when that ends. */
  onCloseWaiting(cb: () => void): Promise<() => void>;
  // Plan 5 Find similar. Search errors are wire codes: "FindSimilarOff", "NotIndexedYet",
  // "TooLarge", "Unreadable", "UnknownReference:<id>" (treat as no results); anything else is
  // artist copy.
  similarStatus(): Promise<SimilarStatus>;
  /** Sets findSimilar "on", then downloads if needed, loads and indexes in the background. */
  similarEnable(): Promise<SimilarStatus>;
  /** Sets findSimilar "off", stops indexing, frees the model; keeps the files. */
  similarDisable(): Promise<SimilarStatus>;
  /** Disable, then delete the model folder and the open library's embeddings.bin. */
  similarRemoveModel(): Promise<SimilarStatus>;
  similarPause(paused: boolean): Promise<SimilarStatus>;
  similarByRef(id: string): Promise<SimHit[]>;
  similarByText(q: string): Promise<SimHit[]>;
  /** An image file outside the library: decoded in memory, never imported. */
  similarByFile(path: string): Promise<SimHit[]>;
  /** Every phase change and progress tick (at most 4 a second). */
  onSimilarStatus(cb: (s: SimilarStatus) => void): Promise<() => void>;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "gif"];

export const tauriApi: Api = {
  createLibrary: (path, seedDemo) => invoke("create_library", { path, seedDemo }),
  openLibrary: (path) => invoke("open_library", { path }),
  getTaxonomy: () => invoke("get_taxonomy"),
  related: (id) => invoke("related", { id }),
  graphEdges: (k) => invoke("graph_edges", { k }),
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
    (await open({ multiple: true, title: "Add images", filters: [{ name: "Images", extensions: IMAGE_EXTS }] })) ?? [],
  revealFolder: (path) => revealItemInDir(path),
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
  updateTechnique: (id, patch) => invoke("update_technique", { id, patch }),
  deleteTechnique: (id, moveTo) => invoke("delete_technique", { id, moveTo: moveTo ?? null }),
  linkTechnique: (techniqueId, branchId) => invoke("link_technique", { techniqueId, branchId }),
  unlinkTechnique: (techniqueId, branchId, moveTo) =>
    invoke("unlink_technique", { techniqueId, branchId, moveTo: moveTo ?? null }),
  addBranch: (operationId, domainId) => invoke("add_branch", { operationId, domainId }),
  addDomain: (name, description, icon, operationId) =>
    invoke("add_domain", { name, description, icon: icon ?? null, operationId: operationId ?? null }),
  updateDomain: (id, patch) => invoke("update_domain", { id, patch }),
  deleteDomain: (id, moveTo) => invoke("delete_domain", { id, moveTo: moveTo ?? null }),
  addOperation: (name, plainLabel, description, color) =>
    invoke("add_operation", { name, plainLabel, description, color: color ?? null }),
  updateOperation: (id, patch) => invoke("update_operation", { id, patch }),
  deleteOperation: (id, moveTo) => invoke("delete_operation", { id, moveTo: moveTo ?? null }),
  addLink: (fromRef, toRef, why) => invoke("add_link", { fromRef, toRef, why }),
  updateLink: (linkId, why) => invoke("update_link", { linkId, why }),
  removeLink: (linkId) => invoke("remove_link", { linkId }),
  createBoard: (name, referenceIds) => invoke("create_board", { name, referenceIds }),
  renameBoard: (boardId, name) => invoke("rename_board", { boardId, name }),
  setBoardMembers: (boardId, referenceIds) => invoke("set_board_members", { boardId, referenceIds }),
  deleteBoard: (boardId) => invoke("delete_board", { boardId }),
  exportBoard: (boardId, dest) => invoke("export_board", { boardId, dest }),
  scorePair: (a, b) => invoke("score_pair", { a, b }),
  lightboxSource: (refId) => invoke("lightbox_source", { refId }),
  intakeBusy: (busy) => invoke("intake_busy", { busy }),
  retrySave: () => invoke("retry_save"),
  exitWithoutSaving: () => invoke("exit_without_saving"),
  onSaveStatus: (cb) => listen<SaveStatus>("save-status", (e) => cb(e.payload)),
  onSaveFailed: (cb) => listen<{ message: string }>("save-failed", (e) => cb(e.payload.message)),
  onCloseWaiting: (cb) => listen("close-waiting", () => cb()),
  similarStatus: () => invoke("similar_status"),
  similarEnable: () => invoke("similar_enable"),
  similarDisable: () => invoke("similar_disable"),
  similarRemoveModel: () => invoke("similar_remove_model"),
  similarPause: (paused) => invoke("similar_pause", { paused }),
  similarByRef: (id) => invoke("similar_by_ref", { id }),
  similarByText: (q) => invoke("similar_by_text", { q }),
  similarByFile: (path) => invoke("similar_by_file", { path }),
  onSimilarStatus: (cb) => listen<SimilarStatus>("similar://status", (e) => cb(e.payload)),
  recoverOrphans: () => invoke("recover_orphans"),
  onThumbsRebuilt: (cb) => listen<string[]>("library://thumbs-rebuilt", (e) => cb(e.payload)),
  onMenu: (cb) => listen<MenuId>("menu://action", (e) => cb(e.payload)),
  appVersion: () => getVersion(),
  noticesPath: () => resolveResource("THIRD_PARTY_NOTICES.md"),
  openPath: (path) => openPath(path),
  verifyImageFiles: () => invoke("verify_image_files"),
  cancelVerify: () => invoke("cancel_verify"),
  onVerifyProgress: (cb) => listen<{ done: number; total: number }>("verify://progress", (e) => cb(e.payload)),
  cancelImport: () => invoke("cancel_import"),
  onImportProgress: (cb) => listen<ImportProgress>("import://progress", (e) => cb(e.payload)),
};
