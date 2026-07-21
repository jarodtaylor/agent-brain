/**
 * agent-brain — `retrieve` with lazy-embed + HEAD-committed gate (U5)
 *
 * `retrieve` answers a query with ONLY git-committed knowledge nodes. A node
 * promoted (written to disk) but not yet committed is invisible (R9); once
 * committed, it is embedded just-in-time (lazy-embed, KTD1) with no manual
 * sync step. "Committed" always means git HEAD of the brain store, resolved
 * via `-C <storeRoot>` — never the process cwd, which is the *public* repo
 * (KTD2).
 *
 * Pinecone is treated as a rebuildable accelerator, not canonical: even a
 * hit for a slug Pinecone still holds (e.g. after a revert) is dropped if
 * that slug isn't in the current committed set (R8/R9/AE2).
 * See docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md, R8/R9 / F3 / KTD1/KTD2.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DistilledNode, PineconeClient } from "./pinecone";
import { buildRecord, ensureIndex, fetchExistingIds, getClient, getIndexName, searchNodes, upsertNodes } from "./pinecone";
import type { BrainStore } from "./store";

export interface RetrievedNode {
  slug: string;
  title: string;
  prose: string;
  provenance: { source_episode: string; source_path?: string };
  score: number;
}

/**
 * Runs `git -C storeRoot ls-tree -r --name-only HEAD -- knowledge/` and
 * returns the committed node slugs. A store with zero commits fails this
 * command with git's "not a valid object name HEAD" — that specific failure
 * is an empty committed set, not an error; any other failure is rethrown.
 */
function committedKnowledgeSlugs(storeRoot: string): string[] {
  const result = Bun.spawnSync(
    ["git", "-C", storeRoot, "ls-tree", "-r", "--name-only", "HEAD", "--", "knowledge/"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString();
    if (/not a valid object name|unknown revision|bad revision/i.test(stderr)) {
      return [];
    }
    throw new Error(`git ls-tree failed for ${storeRoot}: ${stderr}`);
  }
  return result.stdout
    .toString()
    .split("\n")
    .filter((path) => path.endsWith(".md"))
    .map((path) => path.slice("knowledge/".length, -".md".length));
}

/**
 * Parses a `key: value` frontmatter line written by `promote.ts`'s
 * `yamlString`/`yamlStringArray` helpers back into a value. Every value
 * there is JSON syntax (a JSON string or a JSON string-array), so `JSON.parse`
 * round-trips it exactly — no YAML library needed, mirroring the writer.
 */
function parseFrontmatter(raw: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    if (line === "---" || line.trim() === "") continue;
    const separator = line.indexOf(": ");
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    if (key === "type") continue; // bare scalar (`knowledge`), not JSON — and unneeded here.
    fields[key] = JSON.parse(line.slice(separator + 2));
  }
  return fields;
}

/** Parses a committed `knowledge/<slug>.md` file (see promote.ts's on-disk format) into a DistilledNode. */
function parseKnowledgeNode(filePath: string, slug: string): DistilledNode {
  const contents = readFileSync(filePath, "utf8");
  const closingMarker = "---\n\n";
  const closingIndex = contents.indexOf(closingMarker);
  if (closingIndex === -1) {
    throw new Error(`Malformed knowledge node (missing frontmatter closing marker): ${filePath}`);
  }
  const fields = parseFrontmatter(contents.slice(0, closingIndex));
  const body = contents.slice(closingIndex + closingMarker.length);
  // promote.ts always appends exactly one trailing "\n" after the prose it was given.
  const prose = body.endsWith("\n") ? body.slice(0, -1) : body;

  return {
    slug,
    title: fields.title as string,
    description: (fields.description as string) ?? "",
    tags: (fields.tags as string[]) ?? [],
    source_episode: fields.source_episode as string,
    source_path: fields.source_path as string | undefined,
    prose,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetrieveOptions {
  topK?: number;
  client?: PineconeClient;
  indexName?: string;
  /**
   * Bounded search-readiness poll after lazy-embedding (KTD1 freshness). Real
   * integrated-embedding upsert is eventually consistent, and — proven by live
   * smoke — semantic SEARCH lags fetch-by-id consistency on a fresh index. So
   * the freshness poll must re-run the search (not fetch), bounded, only when
   * this call just embedded something.
   */
  embedRetry?: { attempts: number; delayMs: number };
}

/**
 * Returns committed knowledge nodes matching `query`, lazy-embedding any
 * committed node not yet in Pinecone. Never returns a node that isn't in the
 * current git-HEAD committed set, regardless of what Pinecone still holds.
 */
export async function retrieve(
  store: BrainStore,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedNode[]> {
  const topK = opts.topK ?? 5;
  const client = opts.client ?? getClient();
  const indexName = opts.indexName ?? getIndexName();
  // ~20s cap on the first retrieve after a commit (returns early the moment a
  // committed hit appears). On a warm index this resolves in a few seconds;
  // subsequent retrieves skip the poll entirely (nothing newly embedded).
  const embedRetry = opts.embedRetry ?? { attempts: 20, delayMs: 1000 };

  const committedSlugs = committedKnowledgeSlugs(store.root);
  if (committedSlugs.length === 0) return [];

  // Only touch Pinecone once there's committed content to serve. Ensures the
  // integrated-embedding index exists before any fetch/upsert/search — on a
  // fresh account the index is created here just-in-time (KTD1), not assumed.
  await ensureIndex(client, indexName);

  const nodesBySlug = new Map<string, DistilledNode>(
    committedSlugs.map((slug) => [slug, parseKnowledgeNode(join(store.knowledgeDir, `${slug}.md`), slug)]),
  );

  // Lazy-embed (KTD1): only committed nodes are ever projected into Pinecone.
  // fetch-by-id consistency is adequate for this dedup (avoids re-upserting).
  const existingIds = new Set(await fetchExistingIds(client, indexName, committedSlugs));
  const missingSlugs = committedSlugs.filter((slug) => !existingIds.has(slug));
  if (missingSlugs.length > 0) {
    const records = missingSlugs.map((slug) => buildRecord(nodesBySlug.get(slug) as DistilledNode));
    await upsertNodes(client, indexName, records);
  }

  // Search, filtering hits to the committed set — defends R9/AE2 even if
  // Pinecone still holds a reverted/stale node (see the "partial revert"
  // test). When this call just embedded nodes, poll the SEARCH (not fetch)
  // until a committed hit appears or the cap is hit (KTD1 freshness) — search
  // lags fetch on a fresh index, so fetch-readiness would return too early.
  const justEmbedded = missingSlugs.length > 0;
  let results: RetrievedNode[] = [];
  for (let attempt = 0; attempt < embedRetry.attempts; attempt++) {
    const hits = await searchNodes(client, indexName, query, topK);
    results = hits
      .filter((hit) => nodesBySlug.has(hit.id))
      .map((hit) => {
        const node = nodesBySlug.get(hit.id) as DistilledNode;
        return {
          slug: node.slug,
          title: node.title,
          prose: node.prose,
          provenance: { source_episode: node.source_episode, source_path: node.source_path },
          score: hit.score,
        };
      });
    // Stop as soon as we have a committed hit; also stop immediately when this
    // call embedded nothing (an empty result is then genuinely empty, not lag).
    if (results.length > 0 || !justEmbedded) break;
    await sleep(embedRetry.delayMs);
  }
  return results;
}
