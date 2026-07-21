/**
 * agent-brain — raw tier and `capture` (U2)
 *
 * `capture` ingests a raw source into an append-only, immutable episode tier.
 * Every capture call — including a re-capture of the same source — produces a
 * NEW episode directory; nothing here ever overwrites or deletes an existing
 * one. History lives in raw/; meaning lives in knowledge/ (see U3/promote).
 * See docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md, R1-R3 / F1.
 *
 * On-disk layout, one directory per episode under `store.rawDir`:
 *   raw/<episode-id>/content.md   — the captured text, verbatim
 *   raw/<episode-id>/meta.json    — { id, source?, capturedAt }
 *
 * Episode id: `<ISO-timestamp>-<random-suffix>`, e.g.
 * `2026-07-21T15-30-45-123Z-a1b2c3`. The timestamp prefix keeps ids
 * lexicographically time-sortable on disk; the random suffix guarantees
 * uniqueness even for two captures in the same millisecond. It is NOT
 * derived from content — re-capturing identical text must still mint a
 * distinct episode (R3).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { BrainStore } from "./store";

export interface Episode {
  id: string;
  path: string;
  source?: string;
  capturedAt: string;
}

function newEpisodeId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${timestamp}-${suffix}`;
}

/**
 * Writes a new immutable raw episode into `store.rawDir`. Takes an
 * already-resolved store (see `resolveStore`) rather than reading env itself,
 * so callers/tests control the store explicitly.
 */
export function captureEpisode(store: BrainStore, input: { text: string; source?: string }): Episode {
  if (input.text.trim() === "") {
    throw new Error("capture text must not be empty or whitespace-only.");
  }

  mkdirSync(store.rawDir, { recursive: true });

  const id = newEpisodeId();
  const episodeDir = join(store.rawDir, id);
  if (existsSync(episodeDir)) {
    // Timestamp + random suffix should never collide; refuse rather than
    // clobber an existing episode if it somehow does (append-only invariant).
    throw new Error(`Episode id collision, refusing to overwrite: ${id}`);
  }
  mkdirSync(episodeDir);

  const capturedAt = new Date().toISOString();
  const episode: Episode = { id, path: episodeDir, source: input.source, capturedAt };

  writeFileSync(join(episodeDir, "content.md"), input.text);
  writeFileSync(
    join(episodeDir, "meta.json"),
    JSON.stringify({ id, source: input.source, capturedAt }, null, 2),
  );

  return episode;
}
