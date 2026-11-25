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
const NON_IPC_KEYS = ["assetUrl", "onSaveStatus", "onSaveFailed", "onCloseWaiting", "importBytes", "pickFolder", "pickImages"];

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
