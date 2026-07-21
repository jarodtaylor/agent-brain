# DECISIONS — agent-brain

Every decision + why + what it serves (the north star). Newest at the bottom. Open forks at the end.

| # | Decision | Why | Serves |
|---|----------|-----|--------|
| 1 | Build the **Agent Brain / Memory System**, not agent-os-as-GTM | Crisp MVP, hot problem, and it's agent-os's needed brain layer — finishing it *advances* the main project instead of forking a new squirrel | Ship ONE genuinely-used MVP |
| 2 | Split **north star vs MVI** — north star = cross-domain brain → Hermes; MVI = one thin slice | Keeps the build small without it *feeling* small | Anti-abandonment |
| 3 | Scope by **vertical slice, not horizontal descope** | Boring stubs get abandoned; keep the exciting core through a narrow domain | Momentum |
| 4 | MVI = **capture → promote → retrieve**, cross-harness fan-out (Slice A) | Cross-harness continuity + the "distilled, not dumped" differentiator | The demo that excites |
| 5 | Architecture = **surface boundary** (git-markdown truth plane vs derived runtime plane; L4 promotion). Borrow L1/L2/L4 from IBOS, build L3 | The research already solved the hard part; the new work is the L3 adapter | Don't rebuild what IBOS proves |
| 6 | Platform = **TypeScript / Bun MCP server + CLI + Pinecone** | Matches agent-os (dogfood consumer); one MCP surface = every harness a client; verified TS-capable (Pinecone integrated embedding) | Cross-harness for free |
| 7 | **Two repos**: agent-brain (public product) + ai-agent-project cockpit (private process); one-directional breadcrumbs | A standalone keeper needs its own repo; protect the public/private boundary | Clean separation |
| 8 | **Claude-only this week**; cross-harness + unit-loop deferred | Don't boil the ocean; Sprint 1 is a single-harness skeleton | Completion over scope |
| 9 | Anti-drift via **START-HERE + DECISIONS + lean `/handoff`**; multi-model pipeline deferred | Durable docs survive fresh sessions and auto-compact — continuity from files, not chat | No drift between sessions |
| 10 | **Work from agent-brain** (build home); cockpit = cohort/process only | Native git / skills / codebase-memory / `/handoff`; ends the absolute-path awkwardness of editing across repos | Clean ergonomics |
| 11 | **Compound Engineering = the methodology; Sherpa = the deliverable schedule** (non-skippable: 3 demos, Sprint-1 eval set, sherpa-MCP progress) | CE fits the handoffs + durable docs; Sherpa's hand-holding isn't aimed at an expert | Build velocity + cohort standing |
| 12 | **The demo stars the boundary + retrieval + provenance — NOT summarization quality** (agent-brain is a storage/boundary/retrieval substrate; the distilling is Claude's) | Good summarizing is just Claude being Claude; the membrane is the defensible layer | Honest differentiation vs "RAG over notes" |
| 13 | **Full boundary in miniature** — capture→promote→retrieve all real & thin, run on real **messy + curated** sources | A recall-only tail is the exact "AI+Obsidian" anti-pattern; the promote membrane is what makes it not that | The demo that excites |
| 14 | **Git commit = the promotion gate** (truth = committed; `git diff` is the review surface) | No review UI to build; matches the docs-to-main workflow | Ship velocity |
| 15 | **Pinecone indexes distilled L2 truth only (Sprint 1); raw-archive recall deferred** | One job in week 1 keeps the skeleton thin; the massive-archive recall is the Sprint-2 wow | Completion over scope |
| 16 | **Raw tier is immutable/append-only; L2 is curated *current* truth, not a timeline** (Karpathy/IBOS) | History lives in raw, meaning in L2 → unbreakable provenance + deterministic eval | The real model, not a compromise |
| 17 | **Embed-on-commit = lazy-embed on retrieve** (retrieve returns only git-`HEAD`-committed nodes; advisor-gated) | Correctness lives in the committed-status gate (R8), so the trigger is reversible; lazy-embed uniquely gives *committed ⇒ retrievable, no manual step* | A robust on-camera demo |
| 18 | **Brain store lives OUTSIDE the public repo; boundary enforced by path validation** (refuse to write inside the public tree) | Personal distilled notes can't land in the public product repo | The public/private boundary |

## Open forks (decide later)
- **Build-vs-use** — is the membrane already provided by shipping tiered-memory tools (mem0, Letta/MemGPT, Zep)? Carried as an FYI from ce-doc-review → a quick `/ce-pov` before/around build.
- **License** — TBD (public repo) → before wider sharing.
- **STRATEGY.md** — formal north star via `ce-strategy` → when we want it canonical.
- **Graph + SQLite layers** — post-MVI.

_Closed: **L2↔L3 cut + promotion taxonomy** — resolved this session (immutable raw, curated L2, git-commit gate, lazy-embed) and captured in the plan._
