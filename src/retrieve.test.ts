import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureEpisode } from "./capture";
import type { DistilledNode, FlatRecord, PineconeClient } from "./pinecone";
import { DEFAULT_NAMESPACE } from "./pinecone";
import { promoteEpisode } from "./promote";
import { retrieve } from "./retrieve";
import { resolveStore } from "./store";

function gitInit(dir: string): void {
  const result = Bun.spawnSync(["git", "init", "-q", dir]);
  if (result.exitCode !== 0) {
    throw new Error(`git init failed for ${dir}: ${result.stderr.toString()}`);
  }
}

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

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), "agent-brain-store-"));
  cleanupDirs.push(dir);
  gitInit(dir);
  return resolveStore(dir);
}

/** In-memory fake Pinecone index — real git is used for the committed-gate; only Pinecone is faked. */
function fakeIndex() {
  const records = new Map<string, FlatRecord>();
  // Slugs that lag in SEARCH for the next N search calls, then appear —
  // modeling real integrated-embedding: fetch-by-id is consistent right after
  // upsert, but semantic search indexing lags (proven by live smoke). Only
  // search is gated; fetch is immediately consistent.
  const searchLag = new Map<string, number>();

  const client: PineconeClient = {
    listIndexes: async () => ({ indexes: [{ name: "agent-brain-test" }] }),
    createIndexForModel: async () => {},
    index: () => ({
      namespace: () => ({
        upsertRecords: async (opts: { records: FlatRecord[] }) => {
          for (const record of opts.records) records.set(record.id, record);
        },
        searchRecords: async (opts: { query: { topK: number; inputs: { text: string } } }) => ({
          result: {
            hits: [...records.values()]
              .filter((record) => {
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
        }),
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
  };
}

function promoteAndWrite(
  store: ReturnType<typeof resolveStore>,
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
});
