# agent-brain

A cross-harness memory substrate for AI agents: **capture** raw episodes, **promote** the keepers into
durable, human-readable truth, and **retrieve** them from any tool.

> **Status:** early, work in progress — building in public.

## The idea

Agents forget. Every Claude Code / Codex / Cursor session starts cold, and most "memory" tools just dump
raw transcripts back at you. agent-brain draws a hard line between two layers:

- **Durable truth** — a reviewed, human-readable knowledge layer (git-backed markdown). The single
  source of truth.
- **Fast runtime** — vector + graph + local stores that make retrieval fast. Derived, rebuildable,
  **never canonical**.

The one rule: *nothing is "known" until it's promoted into durable truth. The fast layer speeds up
search; it never becomes the truth.*

It's exposed as a single **MCP server** (+ a thin CLI), so any MCP-speaking harness shares the same
brain — even when it only plays a bit part in a larger fan-out.

## Setup

```bash
bun install
cp .env.example .env   # then add your PINECONE_API_KEY
```

## Usage

_Coming soon — the walking skeleton (capture → promote → retrieve) is in progress._

## License

_TBD._
