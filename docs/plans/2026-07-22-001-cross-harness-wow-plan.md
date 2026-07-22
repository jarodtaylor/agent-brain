# Plan — The Cross-Harness "Wow" (Sprint-2 push → Sun Jul 26 demo)

> 4 build days (Wed–Sat), demo Sun. Sequenced **demo-first**: the thin end-to-end demo works on Day 1,
> then we make it rich. The demo is never in a not-working state.

## The wow (one sentence)
Two AIs from two different companies (Claude, Codex) share **one brain you own** — and a *cold* session
that was never in the room instantly knows what the other learned, **but only after a human commits it.**

## The do-or-die framing (DECISION #12 stays the star)
"Two agents query the same store" is exactly what mem0/Zep do — the thing we rejected in DECISION #21.
So the cross-harness beat MUST run **through the commit membrane**, or it degrades into RAG-over-a-shared-DB:

1. Claude captures + promotes a fresh decision (uncommitted).
2. Retrieve in Claude → **absent.** Retrieve in a cold Codex session → **absent.** (Written ≠ known, in *both* harnesses.)
3. A human commits (the gate).
4. Retrieve in Claude → present. Retrieve in cold Codex → present, **with provenance.**

Cross-harness is the *amplifier*; the membrane is the *point*. Different vendor = obviously not cached context.

## Cut rule (kills the time-sinks)
**Nothing earns a slot unless it's on camera.** Reconciliation hardening only if the demo shows a live
edit/revert. Graph layer only if the demo shows multi-hop. Default: both are Sprint 2, not this week.

## Two lanes
- **Solo (Claude drives):** build capability, grow corpus, turnkey harness setup, runbook v2, README/packaging.
- **With Jarod (interactive):** every cross-harness verification + the rehearsals + the record. Cross-harness
  needs live Herdr with a human at the gate — never ephemeral. **Block ≥1 rehearsal before Saturday.**

## Core (must ship by Sat) — the only real commitment
1. **Thin end-to-end cross-harness-through-the-gate loop, verified live** (Day 1). Ugly is fine; it works.
2. **Turnkey harness setup** — one launcher, self-contained `.env`; a second harness (Codex) reliably
   cold-recalls. Documented so it's repeatable on camera.
3. **A richer, still-honest corpus + expanded eval** — enough nodes that retrieval feels like a real brain,
   eval still green. (On camera: the retrieve results must look substantial.)
4. **Runbook v2** rebuilt around the cross-harness-through-the-gate spine; rehearsed with Jarod.

## Stretch (only if flying, only if filmed)
- Third harness (Cursor) for "any harness."
- Graph layer (multi-hop retrieval) — *only* with a multi-hop beat in the demo.
- Packaging (npx/install) + a build-in-public writeup.

## Day-by-day (demo-first)
- **Wed (today):** thin end-to-end loop working live (solo-verify what I can via Herdr; the spine is already proven).
  Lock the plan; fix docs. → *demo exists, ugly.*
- **Thu:** grow corpus + eval; make setup turnkey + documented. → *demo is real, not a toy.*
- **Fri:** runbook v2 + README/packaging; **rehearsal #1 with Jarod.** → *demo is rehearsed.*
- **Sat:** **rehearsal #2 + record** with Jarod; buffer. → *shipped, a day early.*

## Risks
- **Scope creep** via reconciliation/graph → the cut rule is the defense.
- **Demo-last drift** → Day-1 end-to-end is the defense; never let the demo regress.
- **Harness setup friction** → Codex is proven; Cursor is stretch, not a dependency.
- **Jarod's time** → the interactive lane needs him; block a rehearsal slot before Sat.

## Definition of done
A recorded demo showing: a fresh decision promoted → **not retrievable in Claude *or* cold Codex** → human
commit → **both recall it with provenance**, on a corpus that feels like a real brain, with a passing eval.
