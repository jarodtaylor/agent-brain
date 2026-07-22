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

## Cross-harness = interactive (Herdr), never `codex exec` / `claude -p`
**2026-07-22.** To verify Codex retrieves from the same brain, I ran headless `codex exec` and burned
many cycles fighting its non-interactive tool-approval + Claude Code's classifier. Jarod: wrong tool
entirely — ephemeral invocations are fire-and-forget *delivery*, not a feedback loop.

**Rule:** the agent-brain cross-harness proof — and ANY "does harness X work with our MCP server"
check — runs in an **interactive, human-in-the-loop session, driven through Herdr**, never headless.
Ephemeral `codex exec` / `claude -p` are only for delegating a task where the artifact is all you want
back. The approval wall that blocked me exists only in `exec` mode; interactively the human clicks
Allow and the loop closes. General principle captured in memory:
[[interactive-not-ephemeral-for-harness-feedback]].

## Technical decisions are mine — reporting is not asking
**2026-07-22.** Ended a turn with "Want me to start runbook v2 now, or leave Friday's lane clean?"
and buried two side findings under a status dump. Jarod: *"My ADHD brain will not read that entire
message. What do you need from me?"* — then set the roles explicitly: he's Product Manager, I'm
Architect/CTO. "Own your expertise. Don't default to hand-holding. I'm here for the outcome, not the
implementation details."

**Rule:** the dividing line is **technical vs product**, not reversible vs irreversible. Sequencing,
architecture, tooling, verification strategy, what to build next → decide and do, then report the
call + why in one line. Only **product** judgment (scope, priorities, what the demo claims) goes to
him. A reversible technical question is still hand-holding.

**How to apply:** end turns with what I'm doing next, never a menu. Side findings (a leaked key, a
broken MCP server) get their own one-liner or get handled — they never ride along in a status wall.
If the reply needs scrolling, it already failed regardless of content quality.
