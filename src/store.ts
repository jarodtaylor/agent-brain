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
import { runGit } from "./git";

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
  const result = runGit(dir, "rev-parse", "--show-toplevel");
  return result.exitCode !== 0 ? null : result.stdout.trim();
}

let cachedPublicRepoRoot: string | undefined;

/**
 * The public agent-brain repo's git root, anchored on this source file's own
 * location (never process.cwd() — see KTD5). Fixed for the process lifetime,
 * so it's resolved once and cached across the many resolveStore() calls a
 * long-lived MCP server makes.
 */
function publicRepoRoot(): string {
  if (cachedPublicRepoRoot === undefined) {
    const toplevel = gitToplevel(import.meta.dir);
    if (!toplevel) {
      throw new Error(
        "Could not resolve the public agent-brain repo's git root — cannot enforce the store boundary.",
      );
    }
    cachedPublicRepoRoot = realpathSync(toplevel);
  }
  return cachedPublicRepoRoot;
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
  if (storeRoot === publicRepoRoot) {
    throw new Error(
      `Brain-store path IS the public agent-brain repo (${publicRepoRoot}). ` +
        "It must be a separate repo outside this one — otherwise personal nodes would land here.",
    );
  }
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

  assertOutsideBoundary(resolvedStore, publicRepoRoot());

  return {
    root: resolvedStore,
    rawDir: join(resolvedStore, "raw"),
    knowledgeDir: join(resolvedStore, "knowledge"),
  };
}
