// @vitest-environment jsdom
// Pins every command's IPC name and argument keys (Tauri camelCases the Rust parameter names).
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { type Api, tauriApi } from "./api";

// ESM exports can't be spied on: wrap the real invoke (which mockIPC answers) in a mock.
vi.mock("@tauri-apps/api/core", async (orig) => {
  const real = await orig<typeof import("@tauri-apps/api/core")>();
  return { ...real, invoke: vi.fn(real.invoke) };
});

/** Not commands of ours: the asset URL, event listeners, the raw-body paste and the plugin pickers. */
const NON_IPC_KEYS = ["assetUrl", "onSaveStatus", "onSaveFailed", "onCloseWaiting", "onSimilarStatus", "onThumbsRebuilt", "importBytes", "pickFolder", "pickImages", "revealFolder"];

const tag = { operationId: "op" };
const rows: [keyof Api, string, string[], (a: Api) => Promise<unknown>][] = [
  // Plan 1
  ["createLibrary", "create_library", ["path", "seedDemo"], (a) => a.createLibrary("p", true)],
  ["openLibrary", "open_library", ["path"], (a) => a.openLibrary("p")],
  ["getTaxonomy", "get_taxonomy", [], (a) => a.getTaxonomy()],
  ["related", "related", ["id"], (a) => a.related("r")],
  ["graphEdges", "graph_edges", ["k"], (a) => a.graphEdges(8)],
  ["search", "search", ["q"], (a) => a.search("q")],
  ["getSettings", "get_settings", [], (a) => a.getSettings()],
  ["setSettings", "set_settings", ["s"], (a) => a.setSettings({ theme: "dark" })],
  ["systemRamGb", "system_ram_gb", [], (a) => a.systemRamGb()],
  // Plan 2
  ["addTags", "add_tags", ["refId", "tags"], (a) => a.addTags("r", [tag])],
  ["updateTag", "update_tag", ["refId", "tag", "tagId"], (a) => a.updateTag("r", "t", tag)],
  ["removeTag", "remove_tag", ["refId", "tagId"], (a) => a.removeTag("r", "t")],
  ["setField", "set_field", ["patch", "refIds"], (a) => a.setField(["r"], { note: "n" })],
  [
    "addTechnique",
    "add_technique",
    ["t", "tag"],
    (a) => a.addTechnique({ name: "n", description: "", operationId: "op", domainId: "d" }),
  ],
  ["undo", "undo", [], (a) => a.undo()],
  ["redo", "redo", [], (a) => a.redo()],
  ["imagePath", "image_path", ["refId"], (a) => a.imagePath("r")],
  ["demoExamples", "demo_examples", [], (a) => a.demoExamples()],
  ["importPaths", "import_paths", ["note", "paths", "sourceUrl"], (a) => a.importPaths(["p"])],
  ["intakeBusy", "intake_busy", ["busy"], (a) => a.intakeBusy(true)],
  ["retrySave", "retry_save", [], (a) => a.retrySave()],
  ["exitWithoutSaving", "exit_without_saving", [], (a) => a.exitWithoutSaving()],
  // Plan 3 Task 9
  ["updateTechnique", "update_technique", ["id", "patch"], (a) => a.updateTechnique("t", { name: "n" })],
  ["deleteTechnique", "delete_technique", ["id", "moveTo"], (a) => a.deleteTechnique("t", { kind: "partial" })],
  ["linkTechnique", "link_technique", ["branchId", "techniqueId"], (a) => a.linkTechnique("t", "b")],
  ["unlinkTechnique", "unlink_technique", ["branchId", "moveTo", "techniqueId"], (a) => a.unlinkTechnique("t", "b")],
  ["addBranch", "add_branch", ["domainId", "operationId"], (a) => a.addBranch("op", "d")],
  ["addDomain", "add_domain", ["description", "icon", "name", "operationId"], (a) => a.addDomain("n", "")],
  ["updateDomain", "update_domain", ["id", "patch"], (a) => a.updateDomain("d", { icon: "i" })],
  ["deleteDomain", "delete_domain", ["id", "moveTo"], (a) => a.deleteDomain("d", { kind: "delete" })],
  ["addOperation", "add_operation", ["color", "description", "name", "plainLabel"], (a) => a.addOperation("n", "l", "")],
  ["updateOperation", "update_operation", ["id", "patch"], (a) => a.updateOperation("op", { color: null })],
  ["deleteOperation", "delete_operation", ["id", "moveTo"], (a) => a.deleteOperation("op")],
  // Plan 4 Task 3
  ["addLink", "add_link", ["fromRef", "toRef", "why"], (a) => a.addLink("a", "b", "w")],
  ["updateLink", "update_link", ["linkId", "why"], (a) => a.updateLink("l", "w")],
  ["removeLink", "remove_link", ["linkId"], (a) => a.removeLink("l")],
  ["createBoard", "create_board", ["name", "referenceIds"], (a) => a.createBoard("n", ["r"])],
  ["renameBoard", "rename_board", ["boardId", "name"], (a) => a.renameBoard("b", "n")],
  ["setBoardMembers", "set_board_members", ["boardId", "referenceIds"], (a) => a.setBoardMembers("b", ["r"])],
  ["deleteBoard", "delete_board", ["boardId"], (a) => a.deleteBoard("b")],
  ["exportBoard", "export_board", ["boardId", "dest"], (a) => a.exportBoard("b", "d")],
  ["scorePair", "score_pair", ["a", "b"], (a) => a.scorePair("a", "b")],
  ["lightboxSource", "lightbox_source", ["refId"], (a) => a.lightboxSource("r")],
  // Plan 5 Task 5
  ["similarStatus", "similar_status", [], (a) => a.similarStatus()],
  ["similarEnable", "similar_enable", [], (a) => a.similarEnable()],
  ["similarDisable", "similar_disable", [], (a) => a.similarDisable()],
  ["similarRemoveModel", "similar_remove_model", [], (a) => a.similarRemoveModel()],
  ["similarPause", "similar_pause", ["paused"], (a) => a.similarPause(true)],
  ["similarByRef", "similar_by_ref", ["id"], (a) => a.similarByRef("r")],
  ["similarByText", "similar_by_text", ["q"], (a) => a.similarByText("q")],
  ["similarByFile", "similar_by_file", ["path"], (a) => a.similarByFile("p")],
  // Plan 6 Task 2
  ["recoverOrphans", "recover_orphans", [], (a) => a.recoverOrphans()],
];

describe("IPC contract", () => {
  afterEach(() => {
    clearMocks();
    vi.mocked(invoke).mockClear();
  });

  it.each(rows)("%s sends %s with its keys", async (_key, cmd, keys, call) => {
    const seen: { cmd: string; args: unknown }[] = [];
    mockIPC((c, args) => {
      seen.push({ cmd: c, args });
      return null;
    });
    await call(tauriApi);
    expect(seen).toHaveLength(1);
    expect(seen[0].cmd).toBe(cmd);
    expect(Object.keys((seen[0].args ?? {}) as object).sort()).toEqual(keys);
  });

  it("covers every IPC wrapper", () => {
    const covered = new Set(rows.map((r) => r[0] as string));
    const missing = Object.keys(tauriApi).filter((k) => !NON_IPC_KEYS.includes(k) && !covered.has(k));
    expect(missing).toEqual([]);
  });

  it("importPaths sends null for absent metadata", async () => {
    let args: unknown;
    mockIPC((_c, a) => void (args = a));
    await tauriApi.importPaths(["p"], { note: "n" });
    expect(args).toEqual({ paths: ["p"], note: "n", sourceUrl: null });
  });

  it("absent moveTo and color reach Rust as null (Task 10 passes undefined)", async () => {
    const seen: unknown[] = [];
    mockIPC((_c, a) => void seen.push(a));
    await tauriApi.deleteTechnique("t", undefined);
    await tauriApi.unlinkTechnique("t", "b", undefined);
    await tauriApi.addOperation("n", "l", "");
    expect(seen).toEqual([
      { id: "t", moveTo: null },
      { techniqueId: "t", branchId: "b", moveTo: null },
      { name: "n", plainLabel: "l", description: "", color: null },
    ]);
  });

  it("importBytes sends the raw bytes and the metadata in x-meta", async () => {
    mockIPC(() => null);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await tauriApi.importBytes("Étude.png", bytes, { note: "n", sourceUrl: "https://ex.org/a.png" });
    const [cmd, payload, opts] = vi.mocked(invoke).mock.calls[0];
    expect(cmd).toBe("import_bytes");
    expect(payload).toBeInstanceOf(ArrayBuffer);
    expect(payload).toBe(bytes);
    const header = (opts?.headers as Record<string, string>)["x-meta"];
    expect(header).toMatch(/^[\x20-\x7e]+$/); // ASCII only, as headers require
    expect(JSON.parse(decodeURIComponent(header))).toEqual({
      name: "Étude.png",
      note: "n",
      sourceUrl: "https://ex.org/a.png",
    });
  });
});
