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
 *   { "query": "...", "expect_slug": "...", "expect_source_episode": "..."? }
 * `expect_source_episode` is optional; when present, the matched node's
 * provenance must equal it. Freeze the promoted corpus BEFORE authoring cases
 * so the eval isn't a moving target (U6 execution note).
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

async function runCase(store: ReturnType<typeof resolveStore>, c: EvalCase): Promise<CaseResult> {
  const results = await retrieve(store, c.query, { topK: TOP_K });
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
