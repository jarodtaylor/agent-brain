/**
 * agent-brain — brain-store resolution and boundary enforcement (U1)
 *
 * The raw tier and distilled L2 nodes are personal and must never land in this
 * public repo. This module resolves the configurable external brain-store path
 * and refuses to operate unless it is a git repo that lives outside — and does
 * not contain — the public repo's working tree. See docs/plans/
 * 2026-07-21-001-feat-memory-walking-skeleton-plan.md, R10 / KTD5.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export interface BrainStore {
  /** Real (symlink-resolved) path to the brain-store git working tree. */
  root: string;
  /** The append-only, immutable raw episode tier. */
  rawDir: string;
  /** The curated, git-committed L2 knowledge tier. */
  knowledgeDir: string;
}

/** Runs `git -C dir rev-parse --show-toplevel`; returns the toplevel path, or null if `dir` isn't inside a git working tree. */
function gitToplevel(dir: string): string | null {
  const result = Bun.spawnSync(["git", "-C", dir, "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) return null;
  return result.stdout.toString().trim();
}

/**
 * True iff `target` is inside `base` (strictly — `base` itself doesn't count).
 * Uses path.relative semantics, not startsWith, so a sibling that merely shares
 * a prefix (e.g. `/foo/bar-store` vs `/foo/bar`) is never misjudged as nested.
 */
export function isPathInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * The boundary check behind R10: refuses in both nesting directions — the store
 * inside the public repo, and the public repo inside the store. Exported as a
 * pure function so both directions are unit-testable without touching real
 * filesystem ancestors of either repo.
 */
export function assertOutsideBoundary(storeRoot: string, publicRepoRoot: string): void {
  if (isPathInside(publicRepoRoot, storeRoot)) {
    throw new Error(
      `Brain-store path resolves inside the public agent-brain repo (${publicRepoRoot}): ${storeRoot}. ` +
        "It must live outside this repo's working tree.",
    );
  }
  if (isPathInside(storeRoot, publicRepoRoot)) {
    throw new Error(
      `The public agent-brain repo (${publicRepoRoot}) resolves inside the brain-store path: ${storeRoot}. ` +
        "The store must not contain this repo's working tree.",
    );
  }
}

/**
 * Resolves and validates the external brain-store path, refusing to operate
 * unless it is a git repo outside — and not containing — the public repo.
 *
 * @param overridePath explicit store path; falls back to AGENT_BRAIN_STORE.
 *   Accepting an override (rather than always reading ambient env) keeps
 *   callers/tests from depending on process.env.
 */
export function resolveStore(overridePath?: string): BrainStore {
  const storePath = overridePath || process.env.AGENT_BRAIN_STORE;
  if (!storePath) {
    throw new Error(
      "AGENT_BRAIN_STORE is not set. Point it at the external, git-backed brain-store directory (see .env.example).",
    );
  }

  if (!existsSync(storePath) || !statSync(storePath).isDirectory()) {
    throw new Error(`Brain-store path does not exist or is not a directory: ${storePath}`);
  }

  const resolvedStore = realpathSync(storePath);
  const storeToplevel = gitToplevel(resolvedStore);
  if (!storeToplevel || realpathSync(storeToplevel) !== resolvedStore) {
    throw new Error(`Brain-store path is not a git repository: ${storePath}`);
  }

  // Anchored on the source file's own location, not process.cwd() — cwd is
  // whatever launched the MCP server and can't be trusted (see KTD5/U1).
  const publicRepoToplevel = gitToplevel(import.meta.dir);
  if (!publicRepoToplevel) {
    throw new Error(
      "Could not resolve the public agent-brain repo's git root — cannot enforce the store boundary.",
    );
  }
  const resolvedPublicRepoRoot = realpathSync(publicRepoToplevel);

  assertOutsideBoundary(resolvedStore, resolvedPublicRepoRoot);

  return {
    root: resolvedStore,
    rawDir: join(resolvedStore, "raw"),
    knowledgeDir: join(resolvedStore, "knowledge"),
  };
}
