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
import { parseNodeMarkdown } from "./frontmatter";
import { runGit } from "./git";
import type { DistilledNode, FlatRecord, PineconeClient, SearchHit } from "./pinecone";
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
  const result = runGit(storeRoot, "ls-tree", "-r", "--name-only", "HEAD", "--", "knowledge/");
  if (result.exitCode !== 0) {
    if (/not a valid object name|unknown revision|bad revision/i.test(result.stderr)) {
      return [];
    }
    throw new Error(`git ls-tree failed for ${storeRoot}: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .filter((path) => path.startsWith("knowledge/") && path.endsWith(".md"))
    .map((path) => path.slice("knowledge/".length, -".md".length))
    // Only flat, agent-brain-authored nodes: a slug is a bare filename. Drop any
    // nested path (`knowledge/sub/x.md` -> `sub/x`) a human may have committed —
    // a `/` in a slug would become a bad Pinecone id and a wrong `git show` path.
    .filter((slug) => slug !== "" && !slug.includes("/"));
}

/**
 * Reads a committed knowledge node from git HEAD — never the working tree — so
 * node CONTENT shares one source of truth with the HEAD-based committed gate.
 * An uncommitted working-tree edit to an already-committed node is therefore
 * never served or embedded (R8/R9/KTD2). Validates required frontmatter and
 * throws on a missing blob or malformed node so the caller can skip it.
 */
function parseCommittedNode(storeRoot: string, slug: string): DistilledNode {
  const result = runGit(storeRoot, "show", `HEAD:knowledge/${slug}.md`);
  if (result.exitCode !== 0) {
    throw new Error(`Could not read committed node "${slug}" from HEAD: ${result.stderr.trim()}`);
  }
  const { fields, prose } = parseNodeMarkdown(result.stdout);
  if (typeof fields.title !== "string" || typeof fields.source_episode !== "string") {
    throw new Error(`Committed node "${slug}" is missing required frontmatter (title, source_episode).`);
  }
  return {
    slug,
    title: fields.title,
    description: typeof fields.description === "string" ? fields.description : "",
    tags: Array.isArray(fields.tags) ? (fields.tags as string[]) : [],
    source_episode: fields.source_episode,
    source_path: typeof fields.source_path === "string" ? fields.source_path : undefined,
    prose,
  };
}

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
  // ~30s cap on the first retrieve after a commit (returns early the moment a
  // committed hit appears) — matches the search-readiness deadline the live
  // Pinecone test needed. On a warm index this resolves in a few seconds;
  // subsequent retrieves skip the poll entirely (nothing newly embedded).
  const embedRetry = opts.embedRetry ?? { attempts: 30, delayMs: 1000 };

  const committedSlugs = committedKnowledgeSlugs(store.root);
  if (committedSlugs.length === 0) return [];

  // Only touch Pinecone once there's committed content to serve. Ensures the
  // integrated-embedding index exists before any fetch/upsert/search — on a
  // fresh account the index is created here just-in-time (KTD1), not assumed.
  await ensureIndex(client, indexName);

  const committedSet = new Set(committedSlugs);
  // Read each committed node (from HEAD) at most once, and only when needed —
  // for an upsert or as a returned hit — rather than the whole corpus per query
  // (efficiency: O(missing + topK), not O(N)). A missing/malformed committed
  // node is skipped (logged to stderr), not fatal: one stray or non-OKF `.md`
  // in knowledge/ must not take down all retrieval.
  const nodeCache = new Map<string, DistilledNode>();
  const unreadable = new Set<string>();
  const nodeFor = (slug: string): DistilledNode | null => {
    if (unreadable.has(slug)) return null;
    const cached = nodeCache.get(slug);
    if (cached) return cached;
    try {
      const node = parseCommittedNode(store.root, slug);
      nodeCache.set(slug, node);
      return node;
    } catch (err) {
      unreadable.add(slug);
      console.error(`[retrieve] skipping unreadable committed node "${slug}": ${(err as Error).message}`);
      return null;
    }
  };

  // Lazy-embed (KTD1): only committed nodes are ever projected into Pinecone.
  // fetch-by-id consistency is adequate for this dedup (avoids re-upserting).
  const existingIds = new Set(await fetchExistingIds(client, indexName, committedSlugs));
  const missingRecords = committedSlugs
    .filter((slug) => !existingIds.has(slug))
    .map((slug) => nodeFor(slug))
    .filter((node): node is DistilledNode => node !== null)
    .map((node) => buildRecord(node));
  if (missingRecords.length > 0) {
    await upsertNodes(client, indexName, missingRecords);
    // Integrated-embedding SEARCH lags upsert on a fresh vector (proven live):
    // a just-committed node is fetch-by-id-visible at once but takes seconds to
    // enter the search index. Wait until each freshly-embedded node is actually
    // SEARCHABLE before running the user's query — so a node is reliably returned
    // on the very first retrieve after its commit (the cross-harness reveal).
    await waitUntilSearchable(client, indexName, missingRecords, embedRetry);
  }

  // One ranked search. The just-embedded nodes are now searchable and compete on
  // merit. Filter hits to the committed set — defends R9/AE2 even if Pinecone
  // still holds a reverted/stale node (see the "partial revert" test).
  const hits = await searchNodes(client, indexName, query, topK);
  return hits
    .filter((hit) => committedSet.has(hit.id))
    .map((hit): { hit: SearchHit; node: DistilledNode | null } => ({ hit, node: nodeFor(hit.id) }))
    .filter((pair): pair is { hit: SearchHit; node: DistilledNode } => pair.node !== null)
    .map(({ hit, node }) => ({
      slug: node.slug,
      title: node.title,
      prose: node.prose,
      provenance: { source_episode: node.source_episode, source_path: node.source_path },
      score: hit.score,
    }));
}

/**
 * Blocks until every just-embedded record is searchable, or the retry budget is
 * spent. Readiness is confirmed PER RECORD with a self-query on its own title (a
 * guaranteed strong self-match), not by polling the user's query. Polling the
 * user query is wrong twice over: it returns early the moment any OTHER already-
 * searchable committed node hits — before the fresh node appears (the exact bug
 * this fixes) — and it would burn the whole deadline on a query that legitimately
 * doesn't rank the fresh node. A vector that answers its own title is in the
 * search index, so it will also be considered for the real query, ranked on merit.
 */
async function waitUntilSearchable(
  client: PineconeClient,
  indexName: string,
  records: FlatRecord[],
  retry: { attempts: number; delayMs: number },
): Promise<void> {
  // Wide enough that a node's own title reliably ranks it within the window even
  // in a large index (a title is maximally similar to its own node).
  const SELF_QUERY_TOPK = 20;
  let pending = records;
  for (let attempt = 0; attempt < retry.attempts && pending.length > 0; attempt++) {
    const stillPending: FlatRecord[] = [];
    for (const rec of pending) {
      const hits = await searchNodes(client, indexName, rec.title, SELF_QUERY_TOPK);
      if (!hits.some((h) => h.id === rec.id)) stillPending.push(rec);
    }
    pending = stillPending;
    // Don't sleep after the final attempt — no further search will run.
    if (pending.length > 0 && attempt < retry.attempts - 1) await Bun.sleep(retry.delayMs);
  }
}
