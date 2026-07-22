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

## Lead with the answer in ONE glance — Jarod has ADHD, walls of text fail
**2026-07-22.** Delivered a full ce-pov verdict as a dense multi-section block (grade, incumbent,
verified facts split project/external, conditions, reversal trigger). Jarod screenshotted it: "This is
what my ADHD brain sees." Correct — it was a wall. Even the follow-up `AskUserQuestion` menu was too
much and got rejected.

**Rule:** answer first, in 1-3 short lines, bolded bottom line. THEN stop and let him engage — detail
only on request. This is in CLAUDE.md ("one decision at a time, no walls of text") and the global
profile; I violated it anyway when I had a rich result and wanted to show the work. The richness of
what I found is never a license to dump it. A 6-section verdict block reads as noise, not rigor.

**How to apply:** for any verdict/analysis/status — first line is the decision or answer. Supporting
evidence is opt-in ("want the why?"), never front-loaded. Prefer a plain one-line next question over a
multi-option menu unless the options genuinely need comparing.
