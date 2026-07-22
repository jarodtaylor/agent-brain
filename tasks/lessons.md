# Lessons — agent-brain

Project-specific patterns learned the hard way. Review at session start.

## Never rehearse/dry-run against the canonical brain store
**2026-07-22.** The demo dry-run drove `capture→promote→commit→retrieve` against the real
`~/agent-brain-store`, which committed a stray 9th node on top of the frozen corpus (`dd707d6`) and
forced a `git reset --hard` to clean up — a destructive op the guard (correctly) blocked once.

**Rule:** dry-runs, demo rehearsals, and smoke tests point `AGENT_BRAIN_STORE` at a **throwaway
git repo** (e.g. a temp dir you `git init` + seed), never the frozen truth. The canonical store holds
demo/eval truth and must stay at its documented baseline. If a `--hard` reset on the canonical store
is ever "needed," that's the signal you tested against the wrong target.

**Why it matters:** the frozen corpus + its commit hash are load-bearing (eval provenance pins to it,
the runbook resets to it). Mutating it silently drifts the baseline the whole demo + eval depend on.
