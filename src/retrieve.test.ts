import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureEpisode } from "./capture";
import type { FlatRecord, PineconeClient } from "./pinecone";
import { promoteEpisode } from "./promote";
import { retrieve } from "./retrieve";
import type { BrainStore } from "./store";
import { useTempStores } from "./test-support";

const { freshStore } = useTempStores();

function git(dir: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", "-C", dir, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed for ${dir}: ${result.stderr.toString()}`);
  }
}

function commitAll(dir: string, message: string): void {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "-m", message);
}

/** In-memory fake Pinecone index — real git is used for the committed-gate; only Pinecone is faked. */
function fakeIndex() {
  const records = new Map<string, FlatRecord>();
  // Slugs that lag in SEARCH for the next N search calls, then appear —
  // modeling real integrated-embedding: fetch-by-id is consistent right after
  // upsert, but semantic search indexing lags (proven by live smoke). Only
  // search is gated; fetch is immediately consistent.
  const searchLag = new Map<string, number>();
  // Slugs that never surface in search — models a query that simply doesn't
  // match a given node (the fake otherwise ignores the query text).
  const hidden = new Set<string>();
  let searchCalls = 0;

  const client: PineconeClient = {
    listIndexes: async () => ({ indexes: [{ name: "agent-brain-test" }] }),
    createIndexForModel: async () => {},
    index: () => ({
      namespace: () => ({
        upsertRecords: async (opts: { records: FlatRecord[] }) => {
          for (const record of opts.records) records.set(record.id, record);
        },
        searchRecords: async (opts: { query: { topK: number; inputs: { text: string } } }) => {
          searchCalls++;
          return {
            result: {
              hits: [...records.values()]
                .filter((record) => {
                  if (hidden.has(record.id)) return false;
                  const remaining = searchLag.get(record.id) ?? 0;
                  if (remaining > 0) {
                    searchLag.set(record.id, remaining - 1); // decrement per search attempt
                    return false;
                  }
                  return true;
                })
                .slice(0, opts.query.topK)
                .map((record) => ({ _id: record.id, _score: 0.9, fields: {} })),
            },
          };
        },
        // fetch-by-id: immediately consistent after upsert (no lag) — this is
        // what makes the lazy-embed dedup correct while search still lags.
        fetch: async (opts: { ids: string[] }) => {
          const present: Record<string, unknown> = {};
          for (const id of opts.ids) {
            if (records.has(id)) present[id] = records.get(id);
          }
          return { records: present };
        },
      }),
    }),
  };

  return {
    client,
    records,
    /** Makes `slug` lag in SEARCH for the next `n` search calls, then appear. */
    delaySearchability(slug: string, n: number): void {
      searchLag.set(slug, n);
    },
    /** Permanently excludes `slug` from search results (models a non-matching query). */
    hideFromSearch(slug: string): void {
      hidden.add(slug);
    },
    /** Number of searchRecords calls so far. */
    searchCalls(): number {
      return searchCalls;
    },
  };
}

function promoteAndWrite(
  store: BrainStore,
  overrides: Partial<{ title: string; prose: string; description: string; tags: string[]; source: string }> = {},
) {
  const episode = captureEpisode(store, {
    text: overrides.prose ?? "the north star is a membrane between raw and truth",
    source: overrides.source ?? "obsidian/ams.md",
  });
  return promoteEpisode(store, {
    episodeId: episode.id,
    title: overrides.title ?? "Agent Memory System North Star",
    prose: overrides.prose ?? "The north star is a membrane between raw episodes and durable, curated truth.",
    description: overrides.description ?? "The core thesis of the memory system.",
    tags: overrides.tags ?? ["ams", "northstar"],
  });
}

const opts = { indexName: "agent-brain-test", topK: 5 };

describe("retrieve — committed gate (KTD2, R8, R9)", () => {
  // RED FIRST: this is the committed-gate contract — the revert case proves
  // the gate is git HEAD, not Pinecone presence. Run this before anything
  // else is wired to observe it fail against a stub/non-existent retrieve.
  test("reversibility: reverting a node's commit makes it unretrievable again, even though Pinecone still has it embedded", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    const before = await retrieve(store, "north star", { ...opts, client: fake.client });
    expect(before.map((n) => n.slug)).toContain(node.slug);
    expect(fake.records.has(node.slug)).toBe(true);

    // Revert the commit — node leaves HEAD, but the fake index still holds the vector.
    git(store.root, "revert", "--no-edit", "HEAD");

    const after = await retrieve(store, "north star", { ...opts, client: fake.client });
    expect(after.map((n) => n.slug)).not.toContain(node.slug);
    expect(fake.records.has(node.slug)).toBe(true); // proves the gate isn't "absent from Pinecone"
  });

  test("partial revert: dropping ONE of several committed nodes filters just that one, proving the hit-filter (not the zero-commit early-return) is what's doing the work", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const keep = promoteAndWrite(store, { title: "Keeper Node", prose: "keeper prose" });
    const doomed = promoteAndWrite(store, { title: "Doomed Node", prose: "doomed prose" });
    commitAll(store.root, "promote both nodes");

    // Retrieve once so the fake embeds both — committedSlugs stays non-empty
    // after the removal below, so this exercises the filter, not the
    // zero-commit early-return the full-revert test above takes.
    await retrieve(store, "prose", { ...opts, client: fake.client });
    expect(fake.records.has(keep.slug)).toBe(true);
    expect(fake.records.has(doomed.slug)).toBe(true);

    git(store.root, "rm", "-q", "knowledge/doomed-node.md");
    commitAll(store.root, "remove doomed node");

    const results = await retrieve(store, "prose", { ...opts, client: fake.client });

    expect(results.map((n) => n.slug)).toContain(keep.slug);
    expect(results.map((n) => n.slug)).not.toContain(doomed.slug);
    expect(fake.records.has(doomed.slug)).toBe(true); // still in Pinecone — only the filter drops it
  });

  test("happy: a committed node is returned with provenance", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    const results = await retrieve(store, "north star", { ...opts, client: fake.client });

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe(node.slug);
    expect(results[0]?.title).toBe("Agent Memory System North Star");
    expect(results[0]?.prose).toBe(
      "The north star is a membrane between raw episodes and durable, curated truth.",
    );
    expect(results[0]?.provenance.source_episode).toBeTruthy();
    expect(results[0]?.provenance.source_path).toBe("obsidian/ams.md");
  });

  test("boundary flip: a promoted-but-uncommitted node returns nothing; after commit it does", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);

    const beforeCommit = await retrieve(store, "north star", { ...opts, client: fake.client });
    expect(beforeCommit).toHaveLength(0);

    commitAll(store.root, "promote north star");

    const afterCommit = await retrieve(store, "north star", { ...opts, client: fake.client });
    expect(afterCommit.map((n) => n.slug)).toContain(node.slug);
  });

  test("lazy-embed: a newly committed node not yet in the fake index gets upserted and returned, no manual step", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    expect(fake.records.has(node.slug)).toBe(false);

    const results = await retrieve(store, "north star", { ...opts, client: fake.client });

    expect(fake.records.has(node.slug)).toBe(true);
    expect(results.map((n) => n.slug)).toContain(node.slug);
  });

  test("freshness: a node found after the bounded retry, guarding against upsert lag", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    // Simulate integrated-embedding lag: not present for the first 2 checks, then present.
    fake.delaySearchability(node.slug, 2);

    const results = await retrieve(store, "north star", {
      ...opts,
      client: fake.client,
      embedRetry: { attempts: 5, delayMs: 1 },
    });

    expect(results.map((n) => n.slug)).toContain(node.slug);
  });

  test("reveal: a freshly committed node that lags in search still appears on the first retrieve, even when OTHER committed nodes are already searchable", async () => {
    // Regression for the on-camera cross-harness reveal: the old poll broke on
    // the FIRST committed hit, so an already-searchable node would return early
    // and the just-committed (still-indexing) node was silently missed until a
    // second retrieve. Now readiness is per fresh node, so the reveal is reliable.
    const store = freshStore();
    const fake = fakeIndex();
    const first = promoteAndWrite(store, { title: "First Node", prose: "first prose" });
    commitAll(store.root, "promote first");
    await retrieve(store, "first", { ...opts, client: fake.client }); // embed + make searchable

    const second = promoteAndWrite(store, { title: "Second Node", prose: "second prose" });
    commitAll(store.root, "promote second");
    // The fresh node lags in SEARCH while `first` is already searchable.
    fake.delaySearchability(second.slug, 2);

    const results = await retrieve(store, "second", {
      ...opts,
      client: fake.client,
      embedRetry: { attempts: 5, delayMs: 1 },
    });

    expect(results.map((n) => n.slug)).toContain(second.slug);
  });

  test("nil: a brain-store repo with zero commits returns an empty set, not an error", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    promoteAndWrite(store); // written, never committed

    const results = await retrieve(store, "north star", { ...opts, client: fake.client });

    expect(results).toEqual([]);
  });

  test("fresh account: retrieve provisions the index when it is absent (KTD1 just-in-time create)", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    // Index does not exist yet, and record the create call.
    let created = "";
    fake.client.listIndexes = async () => ({ indexes: [] });
    fake.client.createIndexForModel = async (o: { name: string }) => {
      created = o.name;
    };

    const results = await retrieve(store, "north star", { ...opts, client: fake.client });

    expect(created).toBe("agent-brain-test");
    expect(results.map((n) => n.slug)).toContain(node.slug);
  });

  test("nil store never provisions an index (no committed content, no Pinecone touch)", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    let createCalls = 0;
    fake.client.listIndexes = async () => ({ indexes: [] });
    fake.client.createIndexForModel = async () => {
      createCalls++;
    };

    await retrieve(store, "north star", { ...opts, client: fake.client });

    expect(createCalls).toBe(0);
  });

  test("HEAD gate applies to CONTENT: an uncommitted edit to a committed node is neither served nor embedded", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");
    const committedProse = "The north star is a membrane between raw episodes and durable, curated truth.";

    // Edit the working-tree file WITHOUT recommitting — the slug stays in HEAD.
    writeFileSync(join(store.knowledgeDir, `${node.slug}.md`), readFileSync(join(store.knowledgeDir, `${node.slug}.md`), "utf8").replace(committedProse, "SECRET uncommitted edit"));

    const results = await retrieve(store, "north star", { ...opts, client: fake.client });

    // Served content comes from HEAD, not the working tree.
    expect(results[0]?.prose).toBe(committedProse);
    expect(results[0]?.prose).not.toContain("SECRET");
    // And the uncommitted edit was never projected into Pinecone.
    expect(fake.records.get(node.slug)?.text).toBe(committedProse);
    expect(fake.records.get(node.slug)?.text).not.toContain("SECRET");
  });

  test("steady state: an already-embedded corpus with zero matching hits returns [] after ONE search, no polling", async () => {
    const store = freshStore();
    const fake = fakeIndex();
    const node = promoteAndWrite(store);
    commitAll(store.root, "promote north star");

    // First retrieve embeds the node (justEmbedded=true path).
    await retrieve(store, "north star", { ...opts, client: fake.client });
    const searchesAfterEmbed = fake.searchCalls();

    // Now the node is already embedded; model a query that matches nothing.
    fake.hideFromSearch(node.slug);
    const results = await retrieve(store, "unrelated query", {
      ...opts,
      client: fake.client,
      embedRetry: { attempts: 10, delayMs: 1 },
    });

    expect(results).toEqual([]);
    // Nothing newly embedded -> single search, not a 10x poll.
    expect(fake.searchCalls() - searchesAfterEmbed).toBe(1);
  });
});
