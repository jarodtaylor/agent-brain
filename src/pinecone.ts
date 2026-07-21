/**
 * agent-brain — Pinecone integrated-embedding projection (U4)
 *
 * Projects a committed L2 knowledge node into an integrated-embedding
 * Pinecone index with a FLAT record schema. agent-brain never runs an
 * embedding model itself — Pinecone embeds the `text` field server-side per
 * the index's `fieldMap` (KTD3).
 *
 * U4 only knows how to project; it does not decide what's committed (U5
 * does, via git HEAD — KTD2) and does not decide when to embed (U5's
 * lazy-embed, KTD1). Every function here takes an injected `PineconeClient`
 * so unit tests never touch the network; `getClient()` is the only place
 * that talks to real Pinecone, built from env at the call site.
 * See docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md, R11/R12/KTD3.
 */
import { Pinecone } from "@pinecone-database/pinecone";
import type { NodeFrontmatter } from "./frontmatter";

/** Single default namespace — no per-user/per-project partitioning yet. */
export const DEFAULT_NAMESPACE = "default";

/** Confirmed available in this account: dim 1024, cosine (verified against live docs/index). */
const EMBED_MODEL = "llama-text-embed-v2";

/**
 * The minimal structural subset of the real `Pinecone`/`Index` SDK surface
 * this module uses. Defined explicitly (rather than importing the SDK's own
 * classes) so a hand-rolled fake can satisfy it in tests without standing up
 * the rest of the real client. `new Pinecone({ apiKey })` satisfies this by
 * structural typing — no adapter needed at the real-client call site.
 */
export interface PineconeClient {
  listIndexes(): Promise<{ indexes?: Array<{ name: string }> }>;
  createIndexForModel(options: {
    name: string;
    cloud: string;
    region: string;
    embed: { model: string; fieldMap: { text: string } };
    waitUntilReady?: boolean;
  }): Promise<unknown>;
  index(name: string): PineconeIndexHandle;
}

interface PineconeIndexHandle {
  namespace(namespace: string): PineconeNamespaceHandle;
}

interface PineconeNamespaceHandle {
  upsertRecords(options: { records: FlatRecord[] }): Promise<void>;
  searchRecords(options: {
    query: { topK: number; inputs: { text: string } };
  }): Promise<{ result: { hits: Array<{ _id: string; _score: number; fields: object }> } }>;
  fetch(options: { ids: string[] }): Promise<{ records: Record<string, unknown> }>;
}

/**
 * Builds the real Pinecone client from env. Not called by any test — tests
 * inject a fake `PineconeClient` instead (see `src/pinecone.test.ts`).
 */
export function getClient(): PineconeClient {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is not set. See .env.example.");
  }
  return new Pinecone({ apiKey });
}

/** Index name the brain projects into. Defaults to "agent-brain" per .env.example. */
export function getIndexName(): string {
  return process.env.AGENT_BRAIN_INDEX || "agent-brain";
}

/**
 * A committed L2 node, already parsed from its OKF frontmatter + prose body
 * (see `promote.ts`). Field names mirror the frontmatter keys verbatim so a
 * caller can pass a parsed node straight through with no translation.
 */
export interface DistilledNode extends Omit<NodeFrontmatter, "type"> {
  slug: string;
  prose: string;
}

/**
 * A flat Pinecone record: `id` + the `text` field the index's `fieldMap`
 * embeds, plus provenance as flat scalars/string-arrays. No nested objects,
 * no `metadata` field (R11) — Pinecone rejects both for integrated-embedding
 * records, and the plugin's own instructions forbid them regardless.
 */
export interface FlatRecord {
  id: string;
  text: string;
  title: string;
  description: string;
  tags: string[];
  source_episode: string;
  source_path?: string;
}

/**
 * Pure mapping from a parsed distilled node to a flat Pinecone record. No
 * I/O, no committedness check — U4 projects what it's handed (U5 decides
 * what's committed).
 */
export function buildRecord(node: DistilledNode): FlatRecord {
  const record: FlatRecord = {
    id: node.slug,
    text: node.prose,
    title: node.title,
    description: node.description,
    tags: node.tags,
    source_episode: node.source_episode,
  };
  // Omit rather than write `undefined` — an absent field, not a null-ish one.
  if (node.source_path) {
    record.source_path = node.source_path;
  }
  return record;
}

/**
 * Ensures the integrated-embedding index exists, guarded by a describe-first
 * (`listIndexes`) idempotency check rather than try/create/catch-conflict —
 * avoids depending on matching a specific SDK error type. Safe to call on
 * every startup/promotion.
 */
export async function ensureIndex(client: PineconeClient, indexName: string): Promise<void> {
  const { indexes } = await client.listIndexes();
  const exists = (indexes ?? []).some((idx) => idx.name === indexName);
  if (exists) return;

  await client.createIndexForModel({
    name: indexName,
    cloud: "aws",
    region: "us-east-1",
    embed: { model: EMBED_MODEL, fieldMap: { text: "text" } },
    waitUntilReady: true,
  });
}

/** Upserts flat records into a single namespace (default: `DEFAULT_NAMESPACE`). */
export async function upsertNodes(
  client: PineconeClient,
  indexName: string,
  records: FlatRecord[],
  namespace: string = DEFAULT_NAMESPACE,
): Promise<void> {
  await client.index(indexName).namespace(namespace).upsertRecords({ records });
}

/** A search hit, normalized away from the SDK's `{_id, _score, fields}` hit shape. */
export interface SearchHit {
  id: string;
  score: number;
}

/**
 * Semantic search over the projected nodes. Returns a normalized
 * `{ id, score }[]` — stable across SDK versions — rather than the raw SDK
 * hit shape, so U5's committed-gate filtering has a fixed contract to code
 * against.
 */
export async function searchNodes(
  client: PineconeClient,
  indexName: string,
  query: string,
  topK: number,
  namespace: string = DEFAULT_NAMESPACE,
): Promise<SearchHit[]> {
  const response = await client
    .index(indexName)
    .namespace(namespace)
    .searchRecords({ query: { topK, inputs: { text: query } } });

  return response.result.hits.map((hit) => ({ id: hit._id, score: hit._score }));
}

/**
 * Returns the subset of `ids` already present in the index — lets U5
 * lazy-embed only committed nodes not yet projected, without re-upserting
 * (and re-paying embedding cost for) nodes already there.
 */
export async function fetchExistingIds(
  client: PineconeClient,
  indexName: string,
  ids: string[],
  namespace: string = DEFAULT_NAMESPACE,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const response = await client.index(indexName).namespace(namespace).fetch({ ids });
  return ids.filter((id) => id in response.records);
}
