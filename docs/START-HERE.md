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

## Where we are RIGHT NOW  (2026-07-21)
- ✅ Repo scaffolded — MCP server stub (`capture` / `promote` / `retrieve`), typechecks clean, deps in.
- ✅ Anti-drift docs + local `/handoff` skill in place.
- ⏳ **▶ NEXT:** wire the walking skeleton — make `capture → promote → retrieve` real (write a distilled
  markdown node + Pinecone upsert/search) in a **single harness**, plus a 5–10 case eval set.
  Target: **Sprint 1 demo, Sun Jul 26.**

## How we work
- **Model routing:** Opus main loop / Sonnet coding subagents (Fable at architecture-lock gates).
- **Claude-only this week;** cross-harness fan-out is the Sprint 2 wow.
- **Session wrap-up:** run **`/handoff`** — it updates this file + `DECISIONS.md`.
