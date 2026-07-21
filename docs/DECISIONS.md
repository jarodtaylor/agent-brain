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

## Open forks (decide later)
- **L2↔L3 cut + promotion taxonomy** — the exact durable/runtime boundary and promotion event types → Ideation / Architecture.
- **License** — TBD (public repo) → before wider sharing.
- **STRATEGY.md** — formal north star via `ce-strategy` → when we want it canonical.
- **Graph + SQLite layers** — post-MVI.
