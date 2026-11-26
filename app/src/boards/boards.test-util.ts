// Shared fixtures for the Boards tests (Plan 4 Task 5).
import { vi } from "vitest";
import type { Api, Board, Change, LibraryView, Reference, Taxonomy } from "../api";
import { createStore, type Store } from "../store";

export const ref = (id: string, title = `Plate ${id}`): Reference => ({
  id,
  title,
  file: `${id}.jpg`,
  hash: id,
  width: 300,
  height: 400,
  addedAt: "2026-11-26T00:00:00Z",
  tags: [],
  thumb256: `t/${id}.jpg`,
  thumb1024: `T/${id}.jpg`,
});

export const taxonomy: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };

export const change = (c: Partial<Change> = {}): Change => ({ references: [], removed: [], canUndo: true, canRedo: false, ...c });

export function storeWith(refs: Reference[], boards: Board[]): Store {
  const view: LibraryView = { root: "C:\\lib", references: refs, links: [], boards, warning: null, taxonomyReadOnly: false };
  return createStore(view, taxonomy);
}

/** Only the methods the Boards modules call; each resolves to a Change that the test can shape. */
export function boardsApi(over: Partial<Api> = {}): Api {
  return {
    assetUrl: (p: string) => `asset://${p}`,
    createBoard: vi.fn(async () => change()),
    renameBoard: vi.fn(async () => change()),
    setBoardMembers: vi.fn(async () => change()),
    deleteBoard: vi.fn(async () => change()),
    exportBoard: vi.fn(async () => ({ written: [], credits: "credits.txt", skipped: [] })),
    pickFolder: vi.fn(async () => "D:/out"),
    revealFolder: vi.fn(async () => {}),
    ...over,
  } as unknown as Api;
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
