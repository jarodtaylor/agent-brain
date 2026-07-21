import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertOutsideBoundary, isPathInside, resolveStore } from "./store";
import { gitInit, useTempStores } from "./test-support";

const { trackDir, mktempStoreDir } = useTempStores();

// The real public agent-brain repo root — used only to prove resolveStore refuses
// a store nested inside it. Resolved via git, not process.cwd() (see U1 approach).
function gitToplevel(dir: string): string {
  const result = Bun.spawnSync(["git", "-C", dir, "rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) {
    throw new Error(`could not resolve git toplevel for ${dir}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

const PUBLIC_REPO_ROOT = gitToplevel(import.meta.dir);

describe("resolveStore", () => {
  test("resolves a valid external git repo to store root + raw/knowledge handles", () => {
    const dir = mktempStoreDir();
    gitInit(dir);

    const store = resolveStore(dir);

    expect(store.root).toBe(realpathSync(dir));
    expect(store.rawDir).toBe(join(store.root, "raw"));
    expect(store.knowledgeDir).toBe(join(store.root, "knowledge"));
  });

  test("refuses a store path nested inside the public repo", () => {
    const dir = trackDir(join(PUBLIC_REPO_ROOT, ".tmp-boundary-test-inside"));
    mkdirSync(dir, { recursive: true });
    gitInit(dir);

    expect(() => resolveStore(dir)).toThrow(/inside the public agent-brain repo/i);
  });

  test("refuses a non-existent path", () => {
    const dir = join(tmpdir(), `agent-brain-store-missing-${Date.now()}`);

    expect(() => resolveStore(dir)).toThrow(/does not exist/i);
  });

  test("refuses a path that exists but is not a git repo", () => {
    const dir = mktempStoreDir();

    expect(() => resolveStore(dir)).toThrow(/not a git repository/i);
  });

  test("refuses when no path is provided and AGENT_BRAIN_STORE is unset", () => {
    const original = process.env.AGENT_BRAIN_STORE;
    delete process.env.AGENT_BRAIN_STORE;
    try {
      expect(() => resolveStore()).toThrow(/AGENT_BRAIN_STORE/);
    } finally {
      if (original !== undefined) process.env.AGENT_BRAIN_STORE = original;
    }
  });
});

// assertOutsideBoundary is the pure containment check resolveStore delegates to.
// It's exercised directly (both directions) because safely reproducing the
// "public repo nested inside the store" case against the *real* repo would require
// git-initing an ancestor of this checkout — not something a test should touch.
describe("assertOutsideBoundary", () => {
  test("refuses when the store is inside the public repo", () => {
    expect(() => assertOutsideBoundary("/repo/store", "/repo")).toThrow(
      /inside the public agent-brain repo/i,
    );
  });

  test("refuses when the public repo is inside the store — the reverse nesting direction", () => {
    expect(() => assertOutsideBoundary("/store", "/store/repo")).toThrow(
      /must not contain/i,
    );
  });

  test("refuses when the store path IS the public repo root exactly", () => {
    // path.relative of identical paths is "" (neither "inside" nor "containing"),
    // so this equality case must be guarded explicitly — else nodes land in the public repo.
    expect(() => assertOutsideBoundary("/repo", "/repo")).toThrow(/IS the public agent-brain repo/i);
  });

  test("allows a sibling path that merely shares a prefix", () => {
    // /foo/bar-store must NOT be judged inside /foo/bar (startsWith would get this wrong).
    expect(() => assertOutsideBoundary("/foo/bar-store", "/foo/bar")).not.toThrow();
  });
});

describe("isPathInside", () => {
  test("detects a path nested inside a base", () => {
    expect(isPathInside("/foo/bar", "/foo/bar/baz")).toBe(true);
  });

  test("does not treat a same-prefix sibling as nested", () => {
    expect(isPathInside("/foo/bar", "/foo/bar-store")).toBe(false);
  });

  test("does not treat a path as inside itself", () => {
    expect(isPathInside("/foo/bar", "/foo/bar")).toBe(false);
  });
});
