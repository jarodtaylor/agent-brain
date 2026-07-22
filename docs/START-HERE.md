# START HERE — agent-brain

> New session (human or AI)? Read this first, then `DECISIONS.md`. These two files are the state —
> you should not need to re-read the repo to be productive. Continuity lives in these docs, not in
> session memory (so a fresh session or an auto-compact resumes without skipping a beat).

## What this is
A cross-harness **memory substrate** for AI agents: capture raw episodes, promote the keepers into
durable, human-readable truth, retrieve them from any tool. A component of AgentOS, usable standalone.

## North star
The persistent **second brain** across build / learn / create — eventually the memory that backs a
personal "Hermes" chief-of-staff that learns its user. Today's build is one thin vertical slice of it.

## The MVI (current target)
`capture` a decision → `promote` it into a distilled markdown node + Pinecone projection → `retrieve`
it semantically, with provenance. The rule: *nothing is "known" until it's promoted into durable truth;
the fast layer speeds up search, it never becomes the truth.*
- **Platform:** TypeScript / Bun — MCP server (+ thin CLI) + Pinecone (integrated embedding).
- **Borrow** L1/L2/L4 patterns from the IBOS reference; **build** the new L3 retrieval adapter.
- **Northstar intake backlog:** `docs/NORTHSTAR-SOURCES.local.md` (gitignored) — the raw material to dogfood.

## Where we are RIGHT NOW  (2026-07-21)
- ✅ Repo scaffolded; anti-drift docs + local `/handoff` skill + `CLAUDE.md` entry point in place.
- ✅ Operating model aligned — **build from agent-brain**; Compound Engineering is the methodology;
  Sherpa = the cohort deliverable schedule (see DECISIONS #10–11).
- ✅ **Plan cycle complete** — implementation-ready plan at `docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md` (6 units, Verification Contract, DoD). Refinements in DECISIONS #12–18.
- ✅ **Skeleton BUILT (U1–U5) on branch `feat/memory-walking-skeleton`** — `capture → promote → git commit → retrieve` runs end-to-end; the git-HEAD committed-gate holds (verified by a live Pinecone smoke). 46 tests + clean typecheck. Real brain store lives at `~/agent-brain-store` (external, git-backed).
- ✅ **Reviewed + shipped to PR #1** — ce-simplify (2 passes) + ce-code-review (7 reviewers + Codex cross-model). Found + fixed one **P0 in the differentiator** (a committed-gate content leak — retrieve read content from the working tree; now reads the HEAD blob, DECISIONS #19), plus hardening. Copilot + CodeRabbit PR reviews triaged, fixed, and replied (`c07eb2e`).
- ✅ **`PINECONE_API_KEY` rotated** — old key (leaked into a subagent transcript) revoked; new key in 1Password (`op://Deftloom/pinecone-agent-brain-key`) via chezmoi. **Restart the session to pick up the new env.**
- ⏳ **▶ NEXT:** **U6 — real demo corpus + eval.** Needs Jarod's AMS research + at least one messy source. Steps: run the real `capture→promote→commit→retrieve` loop on that material into `~/agent-brain-store`; freeze the promoted corpus; author 5–10 cases in `eval/cases.jsonl` (each needs `query` + `expect_slug` + `expect_source_episode`); `bun run eval/run.ts` must pass. Then the **Sprint 1 demo, Sun Jul 26.** (Also: merge PR #1.)

## How we work
- **Model routing:** Opus main loop / Sonnet coding subagents (Fable at architecture-lock gates).
- **Claude-only this week;** cross-harness fan-out is the Sprint 2 wow.
- **Session wrap-up:** run **`/handoff`** — it updates this file + `DECISIONS.md`.
