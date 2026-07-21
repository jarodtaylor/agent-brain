/**
 * agent-brain — distilled node scaffold and `promote` (U3)
 *
 * `promote` reads a raw episode and writes it out as a distilled OKF
 * knowledge node at a deterministic, title-derived slug. The calling agent
 * authors the distilled prose; agent-brain only scaffolds, slugs, and
 * persists it — it holds no LLM and makes no model call (R5/KTD4).
 *
 * The written node is left UNCOMMITTED. Truth is the human `git commit`
 * (R7) — promote never runs git add/commit itself.
 *
 * On-disk layout: knowledge/<slug>.md, OKF frontmatter + provenance + the
 * agent-authored prose as the body, verbatim.
 * See docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md, R4-R7 / F2 / KTD4 / KTD6.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildNodeMarkdown, parseNodeMarkdown } from "./frontmatter";
import type { BrainStore } from "./store";

export interface PromotedNode {
  slug: string;
  path: string;
}

interface EpisodeMeta {
  id: string;
  source?: string;
  capturedAt: string;
}

/**
 * Derives a deterministic slug from a title (KTD6): lowercase, spaces to
 * dashes, strip anything that isn't alphanumeric or a dash, collapse
 * repeated dashes, trim leading/trailing dashes. Same title -> same slug,
 * always — the seam that lets a future reconciliation pass update a node in
 * place instead of spawning a duplicate.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Writes a distilled OKF knowledge node from a raw episode, at a
 * title-derived deterministic slug. Reads the episode's meta.json for
 * provenance; throws if the episode was never captured — you can't promote
 * what wasn't captured. Takes an already-resolved store rather than reading
 * env itself, so callers/tests control the store explicitly.
 */
export function promoteEpisode(
  store: BrainStore,
  input: { episodeId: string; title: string; prose: string; description?: string; tags?: string[] },
): PromotedNode {
  // episodeId comes verbatim from the MCP tool input — reject path separators
  // and `..` so it can't escape rawDir when joined (capture only ever mints
  // ids from a safe timestamp + hex, but promote must not trust its caller).
  if (/[/\\]|\.\./.test(input.episodeId)) {
    throw new Error(`Invalid episodeId "${input.episodeId}": must not contain path separators or "..".`);
  }

  const episodeDir = join(store.rawDir, input.episodeId);
  const metaPath = join(episodeDir, "meta.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `Cannot promote unknown episode "${input.episodeId}" — no captured episode at ${episodeDir}.`,
    );
  }
  const meta: EpisodeMeta = JSON.parse(readFileSync(metaPath, "utf8"));

  const slug = slugify(input.title);
  if (!slug) {
    throw new Error(
      `Title "${input.title}" produced an empty slug — give it a title with at least one alphanumeric character.`,
    );
  }

  mkdirSync(store.knowledgeDir, { recursive: true });

  const contents = buildNodeMarkdown(
    {
      type: "knowledge",
      title: input.title,
      description: input.description ?? "",
      tags: input.tags ?? [],
      source_episode: input.episodeId,
      source_path: meta.source,
    },
    input.prose,
  );

  const path = join(store.knowledgeDir, `${slug}.md`);
  // Deterministic slugs mean two distinct titles can collide on one slug.
  // Re-promoting the SAME episode (idempotent content update) is fine, but
  // refuse to overwrite a node whose identity belongs to a DIFFERENT episode —
  // silently replacing a committed node's content + provenance is a data-loss
  // trap, and reconciliation is deferred past Sprint 1.
  if (existsSync(path)) {
    const existing = parseNodeMarkdown(readFileSync(path, "utf8"));
    if (existing.fields.source_episode !== input.episodeId) {
      throw new Error(
        `Slug collision: title "${input.title}" maps to slug "${slug}", already used by episode ` +
          `"${existing.fields.source_episode}". Refusing to overwrite a different node's identity — choose a distinct title.`,
      );
    }
  }
  writeFileSync(path, contents);

  return { slug, path };
}
