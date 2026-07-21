import { Pinecone } from "@pinecone-database/pinecone";
import { describe, expect, test } from "bun:test";
import {
  buildRecord,
  DEFAULT_NAMESPACE,
  ensureIndex,
  fetchExistingIds,
  getClient,
  searchNodes,
  upsertNodes,
} from "./pinecone";
import type { DistilledNode, PineconeClient } from "./pinecone";

const NODE: DistilledNode = {
  slug: "agent-memory-system-north-star",
  title: "Agent Memory System North Star",
  description: "The core thesis of the memory system.",
  tags: ["ams", "northstar"],
  source_episode: "2026-07-21T15-30-45-123Z-a1b2c3",
  source_path: "obsidian/ams.md",
  prose: "The north star is a membrane between raw episodes and durable, curated truth.",
};

describe("buildRecord", () => {
  test("produces a flat record: id + text + flat scalar provenance, no nesting, no metadata field", () => {
    const record = buildRecord(NODE);

    expect(record.id).toBe(NODE.slug);
    expect(record.text).toBe(NODE.prose);
    expect(record.title).toBe(NODE.title);
    expect(record.description).toBe(NODE.description);
    expect(record.tags).toEqual(NODE.tags);
    expect(record.source_episode).toBe(NODE.source_episode);
    expect(record.source_path).toBe(NODE.source_path);
    expect(record).not.toHaveProperty("metadata");

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) expect(typeof item).toBe("string");
      } else {
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });

  test("omits source_path when the node has none (never emits it as undefined/null)", () => {
    const { source_path, ...withoutSourcePath } = NODE;
    const record = buildRecord(withoutSourcePath);

    expect(record).not.toHaveProperty("source_path");
  });
});

/** Minimal fake satisfying the PineconeClient DI seam — no network. */
function fakeClient(overrides: Partial<PineconeClient> = {}): PineconeClient {
  return {
    listIndexes: async () => ({ indexes: [] }),
    createIndexForModel: async () => {},
    index: () => {
      throw new Error("index() not stubbed for this test");
    },
    ...overrides,
  };
}

describe("ensureIndex", () => {
  test("does NOT call create when the index already exists", async () => {
    let createCalls = 0;
    const client = fakeClient({
      listIndexes: async () => ({ indexes: [{ name: "agent-brain" }] }),
      createIndexForModel: async () => {
        createCalls++;
      },
    });

    await ensureIndex(client, "agent-brain");

    expect(createCalls).toBe(0);
  });

  test("calls create exactly once when the index is absent", async () => {
    let createCalls = 0;
    const client = fakeClient({
      listIndexes: async () => ({ indexes: [] }),
      createIndexForModel: async () => {
        createCalls++;
      },
    });

    await ensureIndex(client, "agent-brain");

    expect(createCalls).toBe(1);
  });
});

describe("upsertNodes", () => {
  test("upserts flat records into the default namespace", async () => {
    let seenNamespace: string | undefined;
    let seenRecords: unknown;
    const client = fakeClient({
      index: () => ({
        namespace: (ns: string) => {
          seenNamespace = ns;
          return {
            upsertRecords: async (opts: { records: unknown }) => {
              seenRecords = opts.records;
            },
            searchRecords: async () => ({ result: { hits: [] }, usage: {} }),
            fetch: async () => ({ records: {}, namespace: ns }),
          };
        },
      }),
    });

    await upsertNodes(client, "agent-brain", [buildRecord(NODE)]);

    expect(seenNamespace).toBe(DEFAULT_NAMESPACE);
    expect(seenRecords).toEqual([buildRecord(NODE)]);
  });
});

describe("searchNodes", () => {
  test("normalizes SDK hits ({_id, _score, fields}) to {id, score}[]", async () => {
    const client = fakeClient({
      index: () => ({
        namespace: () => ({
          upsertRecords: async () => {},
          searchRecords: async () => ({
            result: {
              hits: [
                { _id: "node-a", _score: 0.91, fields: { text: "..." } },
                { _id: "node-b", _score: 0.42, fields: { text: "..." } },
              ],
            },
            usage: { readUnits: 1 },
          }),
          fetch: async () => ({ records: {}, namespace: DEFAULT_NAMESPACE }),
        }),
      }),
    });

    const results = await searchNodes(client, "agent-brain", "north star", 2);

    expect(results).toEqual([
      { id: "node-a", score: 0.91 },
      { id: "node-b", score: 0.42 },
    ]);
  });
});

describe("fetchExistingIds", () => {
  test("returns only the subset of requested ids present in the index", async () => {
    const client = fakeClient({
      index: () => ({
        namespace: () => ({
          upsertRecords: async () => {},
          searchRecords: async () => ({ result: { hits: [] }, usage: {} }),
          fetch: async (opts: { ids: string[] }) => ({
            records: opts.ids.includes("node-a") ? { "node-a": { id: "node-a" } } : {},
            namespace: DEFAULT_NAMESPACE,
          }),
        }),
      }),
    });

    const existing = await fetchExistingIds(client, "agent-brain", ["node-a", "node-b"]);

    expect(existing).toEqual(["node-a"]);
  });
});

// Live integration — never runs in default `bun test`. Requires both flags so
// a stray env var alone can't accidentally hit the network:
//   PINECONE_LIVE=1 bun test src/pinecone.test.ts
const live = process.env.PINECONE_LIVE === "1" && Boolean(process.env.PINECONE_API_KEY);
// A dedicated test index — never the real "agent-brain" index — so this
// never collides with or pollutes real promoted-node data. Records are
// cleaned up in a `finally` regardless: the index is reused run-to-run and
// stale records with duplicate/near-duplicate `text` would otherwise crowd
// out the just-upserted node from a small `topK`, flaking later runs.
const LIVE_TEST_INDEX = "agent-brain-test-live";

/** Polls `check` until it returns truthy or the deadline passes; returns the last value seen. */
async function pollUntil<T>(check: () => Promise<T>, isDone: (value: T) => boolean, deadlineMs: number): Promise<T> {
  const deadline = Date.now() + deadlineMs;
  let value = await check();
  while (!isDone(value) && Date.now() < deadline) {
    await Bun.sleep(2000);
    value = await check();
  }
  return value;
}

describe("live Pinecone integration", () => {
  test.skipIf(!live)(
    "ensureIndex -> upsert -> poll until searchable -> search + fetchExistingIds return the real shapes",
    async () => {
      const client = getClient();
      await ensureIndex(client, LIVE_TEST_INDEX);

      const node: DistilledNode = {
        slug: `live-test-node-${Date.now()}`,
        title: "Live Integration Test Node",
        description: "Exists only to prove the real Pinecone API shape works end to end.",
        tags: ["live-test"],
        source_episode: "live-test-episode",
        prose:
          "This node exists purely to verify agent-brain's Pinecone integrated-embedding projection against the real API.",
      };
      // Tagless, per what `promote.ts` really produces (`tags: input.tags ?? []`) —
      // proves integrated-embedding upsert accepts an empty string-array field.
      const taglessNode: DistilledNode = { ...node, slug: `${node.slug}-tagless`, tags: [] };
      const record = buildRecord(node);
      const taglessRecord = buildRecord(taglessNode);

      // Raw SDK handle for cleanup only — the injected PineconeClient DI
      // surface intentionally has no delete; U4's projection functions never
      // need one, so it isn't added to the interface just for test teardown.
      const rawNamespace = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string })
        .index(LIVE_TEST_INDEX)
        .namespace(DEFAULT_NAMESPACE);

      try {
        await upsertNodes(client, LIVE_TEST_INDEX, [record, taglessRecord]);

        // Integrated-embedding upsert is eventually consistent — poll instead
        // of sleeping a fixed guess. U5's lazy-embed does the same bounded
        // retry so the on-camera demo flip (KTD1) doesn't flake on lag.
        const hits = await pollUntil(
          () => searchNodes(client, LIVE_TEST_INDEX, node.prose, 5),
          (result) => result.some((hit) => hit.id === record.id),
          30_000,
        );
        expect(hits.some((hit) => hit.id === record.id)).toBe(true);

        // fetchExistingIds — the real `fetch` return shape U5's lazy-embed
        // dedup gate runs on. Also proves the tagless record actually upserted.
        const existing = await pollUntil(
          () => fetchExistingIds(client, LIVE_TEST_INDEX, [record.id, taglessRecord.id, "does-not-exist-xyz"]),
          (result) => result.includes(record.id) && result.includes(taglessRecord.id),
          15_000,
        );
        expect(existing.sort()).toEqual([record.id, taglessRecord.id].sort());
      } finally {
        await rawNamespace.deleteMany([record.id, taglessRecord.id]).catch(() => {});
      }
    },
    50_000,
  );
});
