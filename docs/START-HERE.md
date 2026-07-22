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

## Where we are RIGHT NOW  (2026-07-22)
- ✅ Repo scaffolded; anti-drift docs + local `/handoff` skill + `CLAUDE.md` entry point in place.
- ✅ Operating model aligned — **build from agent-brain**; Compound Engineering is the methodology;
  Sherpa = the cohort deliverable schedule (see DECISIONS #10–11).
- ✅ **Plan cycle complete** — implementation-ready plan at `docs/plans/2026-07-21-001-feat-memory-walking-skeleton-plan.md` (6 units, Verification Contract, DoD). Refinements in DECISIONS #12–18.
- ✅ **Skeleton BUILT (U1–U5) on branch `feat/memory-walking-skeleton`** — `capture → promote → git commit → retrieve` runs end-to-end; the git-HEAD committed-gate holds (verified by a live Pinecone smoke). 46 tests + clean typecheck. Real brain store lives at `~/agent-brain-store` (external, git-backed).
- ✅ **Skeleton reviewed + MERGED (PR #1)** — ce-simplify (2 passes) + ce-code-review (7 reviewers + Codex cross-model). Found + fixed one **P0 in the differentiator** (a committed-gate content leak — retrieve read content from the working tree; now reads the HEAD blob, DECISIONS #19), plus hardening. Merged to `main` (`0d8b5cd`); the skeleton lives on main.
- ✅ **`PINECONE_API_KEY` rotated + verified live** — old key (leaked into a subagent transcript) revoked; new key in 1Password (`op://Deftloom/pinecone-agent-brain-key`) via chezmoi. Session restarted, key confirmed against the live `agent-brain` index.
- ✅ **U6 DONE — real demo corpus + eval (PR #2 MERGED).** Ran the real `capture→promote→commit→retrieve` loop on Jarod's actual sources into `~/agent-brain-store`: **4 raw episodes → 8 distilled L2 nodes** (6 curated AMS/IBOS + **2 promoted from a genuinely messy ADHD braindump** = the R14 mess→clean moment). Corpus frozen at store commit `dd707d6`. **8 eval cases** (semantic queries, pinned provenance) + hardened `eval/run.ts` against cold-index search lag (warm-up + bounded readiness retry, DECISION #20). **`bun run eval/run.ts` → 8/8 pass, all @rank-1**, stable cold+warm.
- ✅ **Demo vehicle wired + PROVEN.** `.mcp.json` exposes `capture/promote/retrieve` to Claude Code (`PINECONE_API_KEY` via `${}` passthrough, store via `.env`). The **full gate sequence was dry-run end-to-end through the live MCP protocol**: capture → retrieve (absent) → promote → retrieve (**still** absent, uncommitted) → commit → retrieve (returns @rank-1 w/ provenance). Held-out slice = the braindump's *in-browser agent terminal* idea (chosen for max mess→clean contrast). **Runbook (5 beats) lives in the private cockpit** (`docs/demos/sprint-1-demo-runbook.md`) — names private paths, never in this repo.
- ✅ **CROSS-HARNESS PROVEN (Codex → same brain), live via Herdr.** Build-vs-use fork closed → BUILD (DECISION #21). Canonical `scripts/mcp-server.sh` launcher (PATH-robust; any harness points at it) registered with Codex (`codex mcp add agent-brain -- <abs>/scripts/mcp-server.sh`). In an **interactive** Codex (gpt-5.6-sol) session, `retrieve` returned the **same node, slug, and source-episode id** Claude Code returns (`multi-model-harness-orchestration-by-role`, provenance `…85a954`). Two harnesses, one committed brain, identical distilled truth + provenance. **Root cause found by dogfooding:** headless `codex exec` masked the real error as "user cancelled"; interactive Herdr surfaced it — non-Claude harnesses don't inherit the shell's `PINECONE_API_KEY`, so the server must be **self-contained** (reads its own `.env`, DECISION #22). **Never verify a harness via ephemeral `codex exec`/`claude -p` — those are fire-and-forget; feedback needs an interactive (Herdr) session.**
- 🚀 **SPRINT-2 "WOW" PUSH — plan locked, Day 1 DONE.** Demo reframed (with Jarod, aggressive-mode): the Sunday demo is now **cross-harness continuity *through the commit gate*** — a fresh decision is invisible in Claude *and* cold Codex until a human commits, then both recall it with provenance (not mem0's shared-DB; the membrane is the star). Plan: `docs/plans/2026-07-22-001-cross-harness-wow-plan.md` (demo-first sequencing, cut-rule = nothing off-camera, two lanes solo/with-Jarod; DECISION #8 superseded). **Day 1 (Wed) done:** the full through-the-gate loop verified end-to-end live (Claude promotes → Codex absent → commit → Codex present @0.425); and the demo-critical **embed-lag reveal bug is FIXED + merged (PR #3)** — a just-committed node is now searchable on the *first* retrieve (~2s, verified live), reliable in every harness.
- ✅ **Day 2 (Thu) DONE — the brain feels real.** **Corpus grown 8 → 19 nodes** (11 more distilled from
  the *same* 4 episodes — no new sources, so provenance stays honest; now ~5 nodes per episode).
  **Eval expanded 8 → 19 cases, `19/19 @rank-1` on the first run** — every original case held rank-1
  despite the corpus more than doubling. New freeze commit: store `7e648fd`.
  **The check the eval can't do:** an eval can go green while the demo's reveal is dead, because the
  held-out node is in neither. So node *selection* was the real work — candidates in the held-out
  slice's neighborhood (agent observability, token/auth dashboards) were deliberately **not** promoted,
  and the reveal query was re-measured live: best competitor now **0.291** vs the held-out node's ~0.43
  → margin *widened*. **Honesty check:** exactly one new node asserts externally-checkable facts
  (`graph-engine-options-after-the-kuzu-acquisition`, sourced from the doc Jarod flagged as
  Gemini-written) — all of it verified against current sources: Apple/Kùzu closed Oct 2025 (repo
  archived), SurrealDB BSL 1.1, Memgraph BSL 1.1, FalkorDB SSPLv1, ArcadeDB Apache 2.0. Every other
  node describes Jarod's own reasoning. **Turnkey setup shipped:** `docs/CROSS-HARNESS-SETUP.md` (per-harness
  registration, the `.env`-not-shell rationale, troubleshooting), the launcher's stale pre-#22 comment
  fixed, and `.mcp.json` switched to the same launcher every other harness uses — verified under a
  harness-like stripped-env spawn (no inherited key, minimal PATH): 3 tools + a live `retrieve` with
  provenance. Runbook pins updated in the cockpit (reset target `dd707d6` → `7e648fd`, 19/19).
- ⏳ **▶ NEXT (Fri):** runbook v2 (rebuild around the cross-harness-through-the-gate spine) + packaging;
  **rehearsal #1 with Jarod** — the one thing that needs him, block it before Sat. Sat: rehearse +
  **record**. Cut rule: reconciliation/graph only if filmed. Interactive/cross-harness verification is a
  **with-Jarod, Herdr** lane — never ephemeral. Sunday demo pre-flight: reset store to `7e648fd` + warm
  index; redaction is fine (Jarod's own AgentOS thinking, vault-relative provenance).
  **One open acceptance:** the `.mcp.json` launcher switch needs a Claude Code **session restart**
  (`/mcp` → 3 tools + one `retrieve`) — if it fails, revert that one line, don't debug the vehicle.

## How we work
- **Model routing:** Opus main loop / Sonnet coding subagents (Fable at architecture-lock gates).
- **Claude-only this week;** cross-harness fan-out is the Sprint 2 wow.
- **Session wrap-up:** run **`/handoff`** — it updates this file + `DECISIONS.md`.
