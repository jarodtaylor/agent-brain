/**
 * agent-brain — shared test helpers.
 *
 * Every spec builds real temp git repos (never mocks git) and cleans them up.
 * That scaffolding was copy-pasted across four spec files; it lives here now.
 */
import { afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStore, type BrainStore } from "./store";

/** Runs `git init -q <dir>`; throws on failure. */
export function gitInit(dir: string): void {
  const result = Bun.spawnSync(["git", "init", "-q", dir]);
  if (result.exitCode !== 0) {
    throw new Error(`git init failed for ${dir}: ${result.stderr.toString()}`);
  }
}

/**
 * Registers an `afterEach` that removes every tracked temp dir after each test
 * in the CALLING spec file, and returns temp-store helpers bound to that
 * tracker. Call once at a spec file's top level.
 *
 * Per-file by design: a single module-level `afterEach` in this shared module
 * would only register against the first spec that imports it, silently skipping
 * cleanup in the others.
 */
export function useTempStores(): {
  trackDir: (dir: string) => string;
  mktempStoreDir: () => string;
  freshStore: () => BrainStore;
} {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  const trackDir = (dir: string): string => {
    dirs.push(dir);
    return dir;
  };
  const mktempStoreDir = (): string => trackDir(mkdtempSync(join(tmpdir(), "agent-brain-store-")));
  const freshStore = (): BrainStore => {
    const dir = mktempStoreDir();
    gitInit(dir);
    return resolveStore(dir);
  };

  return { trackDir, mktempStoreDir, freshStore };
}
