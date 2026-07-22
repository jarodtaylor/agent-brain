#!/usr/bin/env bun
/**
 * agent-brain — eval harness (U6)
 *
 * Runs the frozen eval set against the LIVE retrieve loop: real brain store
 * (git-HEAD committed gate) + real Pinecone. Proves `retrieve` returns the
 * expected distilled node with correct provenance across a 5–10 case set
 * (R15). Run: `bun run eval/run.ts`.
 *
 * Cases live in `eval/cases.jsonl`, one JSON object per line:
 *   { "query": "...", "expect_slug": "...", "expect_source_episode": "..." }
 * All three fields are required — provenance correctness is the point of the
 * eval (R15). Freeze the promoted corpus BEFORE authoring cases so the eval
 * isn't a moving target (U6 execution note).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retrieve } from "../src/retrieve";
import { resolveStore } from "../src/store";

interface EvalCase {
  query: string;
  expect_slug: string;
  // Required: provenance correctness is the point of the eval (R15). A case
  // that doesn't pin the source episode could pass on a wrong-provenance hit.
  expect_source_episode: string;
}

interface CaseResult {
  query: string;
  expect_slug: string;
  passed: boolean;
  rank: number | null; // 1-based position of expect_slug in results, or null if absent
  reason: string;
}

const CASES_PATH = join(import.meta.dir, "cases.jsonl");
const TOP_K = 5;
// Cold-index tolerance. On a fresh Pinecone index, semantic SEARCH lags
// embed-by-id (see retrieve.ts): the first retrieve embeds every committed node
// but only polls until ITS query has a hit, so a later case can transiently
// miss its node while that node's vector is still indexing. This is search lag,
// NOT a corpus/query defect — so a "not in top K" miss is retried up to this
// deadline. A provenance mismatch is deterministic and never retried.
const READY_RETRY = { attempts: 20, delayMs: 1000 };

function loadCases(): EvalCase[] {
  if (!existsSync(CASES_PATH)) return [];
  const cases: EvalCase[] = [];
  // Iterate with the physical line index so error messages point at the real
  // file line, not the position within the comment-and-blank-filtered subset.
  readFileSync(CASES_PATH, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      const line = raw.trim();
      if (line === "" || line.startsWith("//")) return;
      let parsed: EvalCase;
      try {
        parsed = JSON.parse(line) as EvalCase;
      } catch {
        throw new Error(`eval/cases.jsonl line ${i + 1} is not valid JSON: ${line}`);
      }
      if (!parsed.query || !parsed.expect_slug || !parsed.expect_source_episode) {
        throw new Error(
          `eval/cases.jsonl line ${i + 1}: each case needs query, expect_slug, and expect_source_episode.`,
        );
      }
      cases.push(parsed);
    });
  return cases;
}

function evaluate(results: Awaited<ReturnType<typeof retrieve>>, c: EvalCase): CaseResult {
  const rank = results.findIndex((r) => r.slug === c.expect_slug);
  const base = { query: c.query, expect_slug: c.expect_slug };

  if (rank === -1) {
    return { ...base, passed: false, rank: null, reason: `expected slug not in top ${TOP_K}` };
  }
  const match = results[rank]!;
  if (match.provenance.source_episode !== c.expect_source_episode) {
    return {
      ...base,
      passed: false,
      rank: rank + 1,
      reason: `provenance mismatch: got ${match.provenance.source_episode}, want ${c.expect_source_episode}`,
    };
  }
  return { ...base, passed: true, rank: rank + 1, reason: "ok" };
}

async function runCase(store: ReturnType<typeof resolveStore>, c: EvalCase): Promise<CaseResult> {
  // Retry ONLY the "not in top K" miss, and only up to the readiness deadline —
  // that's the shape a still-indexing vector takes. A pass or a provenance
  // mismatch is returned immediately (both are stable, not lag-sensitive).
  let result = evaluate(await retrieve(store, c.query, { topK: TOP_K }), c);
  for (let attempt = 1; attempt < READY_RETRY.attempts && result.rank === null; attempt++) {
    await Bun.sleep(READY_RETRY.delayMs);
    result = evaluate(await retrieve(store, c.query, { topK: TOP_K }), c);
  }
  return result;
}

async function main(): Promise<void> {
  const cases = loadCases();
  if (cases.length === 0) {
    // An unconfigured eval is NOT a pass — exit non-zero so the Verification
    // Contract gate can't go green before any case exists (R15).
    console.error(
      "No eval cases yet — eval NOT satisfied. Freeze the promoted corpus, then author 5–10 cases in eval/cases.jsonl.\n" +
        'Each line: { "query": "...", "expect_slug": "...", "expect_source_episode": "..." }',
    );
    process.exit(1);
  }

  const store = resolveStore();

  // Warm the index once before scoring: a single retrieve lazy-embeds EVERY
  // committed node not yet in Pinecone (retrieve embeds the whole missing set,
  // not just this query's hit). Running it up front means the per-case readiness
  // retries only ever wait on search lag, never on a cold, unembedded corpus.
  await retrieve(store, cases[0]!.query, { topK: TOP_K });

  const results: CaseResult[] = [];
  for (const c of cases) {
    results.push(await runCase(store, c));
  }

  for (const r of results) {
    const mark = r.passed ? "PASS" : "FAIL";
    const rank = r.rank ? ` @${r.rank}` : "";
    console.log(`[${mark}] ${r.expect_slug}${rank} — "${r.query}"${r.passed ? "" : ` (${r.reason})`}`);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} eval cases passed.`);
  if (passed < results.length) process.exit(1);
}

main().catch((err: unknown) => {
  console.error("eval run failed:", err);
  process.exit(1);
});
