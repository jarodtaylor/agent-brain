# CLAUDE.md — agent-brain

> **Read `docs/START-HERE.md` first**, then `docs/DECISIONS.md`. Those two files are the state — don't
> reconstruct context by re-reading the repo. Run `/handoff` at session end to keep them current.

## What this is
A cross-harness memory substrate for AI agents (capture → promote → retrieve). A component of AgentOS,
usable standalone. Public / build-in-public. North star + current MVI are in `docs/START-HERE.md`.

## Who you're working with
Jarod — orchestration-first (delegates the build), expert; explain architecture, not syntax. Real
constraint is **completion, not capability.** **ADHD: one decision at a time, no walls of text —
present one thing, then stop and let him engage.**

## How we work
**Model routing** (recommend per phase; only Jarod flips the main loop via `/model`):

| Phase | Main loop | Effort |
|---|---|---|
| Facilitated / design conversation | Opus 4.8 | medium |
| Hard architecture decisions | Opus 4.8 + **Fable subagent gate** | high |
| Build / implementation | Opus 4.8 (**Sonnet** coding subagents) | medium |
| Adversarial lock-in gate | Fable 5 (or subagent) | high |

- **On Opus, lean on the `advisor`** for any decision needing a second opinion (Opus lacks Fable's
  inline frontier synthesis).
- **Methodology = Compound Engineering** (ce-strategy → brainstorm → plan → work → review → compound →
  commit). **Sherpa** workflows are the cohort's *deliverable schedule* — the 3 demos, the Sprint-1 eval
  set, and logging progress via the sherpa MCP — **not** a rival flow.
- **Git:** docs → straight to main (no asking); code → feature branch + PR.
- **Claude-only this week;** cross-harness fan-out is the Sprint 2 wow.

## Boundary
Public product repo. The bootcamp **cockpit** (`~/Projects/courses/ai-agent-project`, private) holds
process only — profile, eval sets, demo prep, reflections. **Never** commit personal/cohort context
here, and this repo never points back at the cockpit.
