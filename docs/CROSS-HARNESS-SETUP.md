# Cross-harness setup — one brain, any harness

agent-brain is a single MCP server. Every MCP-speaking harness — Claude Code, Codex, Cursor, and
whatever ships next — points at **one launcher script** and shares **one brain you own**.

The contract in one line: **`scripts/mcp-server.sh` is the entrypoint, and it is self-contained.**
It reads its own `.env` for both its config values, so no harness has to plumb secrets into a
subprocess. Register the script, and that harness has the brain.

---

## 1. Prerequisites

- [Bun](https://bun.sh) (the runtime) and `git`.
- A Pinecone API key — free tier is fine ([app.pinecone.io](https://app.pinecone.io)). The index is
  created on first use; it holds only a **derived projection** of your notes and is rebuildable.

## 2. Install

```bash
git clone https://github.com/jarodtaylor/agent-brain.git
cd agent-brain
bun install
```

## 3. Create the brain store

Your durable truth lives in a **separate git repo, outside this one** — so your personal notes can
never land in a public product repo (the server refuses to start otherwise).

```bash
mkdir -p ~/agent-brain-store/{raw,knowledge}
git -C ~/agent-brain-store init
touch ~/agent-brain-store/raw/.gitkeep ~/agent-brain-store/knowledge/.gitkeep
git -C ~/agent-brain-store add -A && git -C ~/agent-brain-store commit -m "init: brain store"
```

## 4. Configure `.env`

```bash
cp .env.example .env
```

Then fill in both values:

```
PINECONE_API_KEY=pcsk_...
AGENT_BRAIN_STORE=/Users/you/agent-brain-store    # absolute path
```

**Put the key in `.env`, not just your shell.** This is the whole reason cross-harness works — see
[Why `.env` and not the shell](#why-env-and-not-the-shell). `.env` is gitignored.

---

## 5. Register the launcher with each harness

Use the **absolute path** to `scripts/mcp-server.sh` anywhere a harness stores config globally
(Codex, Cursor); a relative path is fine only where config is scoped to this repo (Claude Code).

### Claude Code

Already wired — the repo ships `.mcp.json`:

```json
{
  "mcpServers": {
    "agent-brain": { "command": "./scripts/mcp-server.sh" }
  }
}
```

Launch Claude Code from the repo root and confirm with `/mcp` → `agent-brain` connected, 3 tools.
To use the brain from *another* project, register it globally instead:

```bash
claude mcp add --scope user agent-brain -- /absolute/path/to/agent-brain/scripts/mcp-server.sh
```

### Codex

```bash
codex mcp add agent-brain -- /absolute/path/to/agent-brain/scripts/mcp-server.sh
```

### Cursor / any other MCP client

Add to the client's MCP config (`~/.cursor/mcp.json` for Cursor):

```json
{
  "mcpServers": {
    "agent-brain": { "command": "/absolute/path/to/agent-brain/scripts/mcp-server.sh" }
  }
}
```

---

## 6. Verify (do this in a *cold* session)

The point of the setup is that a session which was never in the room can recall what another harness
learned. So verify in a fresh session of the second harness:

> `retrieve: <something you know is committed in your store>`

You should get the distilled node back **with provenance** — the source episode id and original
source path. Same node, same slug, same provenance as the first harness returns. That's the proof.

If your store is empty, run one full loop first (`capture` → `promote` → **`git commit`** in the
store → `retrieve`).

---

## The one rule that will confuse you first

**A promoted node is not retrievable until a human commits it.** `promote` writes the markdown
*uncommitted*; `retrieve` reads each node's bytes from the git `HEAD` blob. So:

```bash
git -C ~/agent-brain-store add -A
git -C ~/agent-brain-store commit -m "promote: <what you learned>"
```

That commit is the gate — the `git diff` is your review surface. This is deliberate, and it is the
difference between this and a shared vector database: nothing becomes "known" in *any* harness until
you approve it in one place. Once committed, the node is searchable on the very next `retrieve`, in
every harness.

---

## Why `.env` and not the shell

<a id="why-env-and-not-the-shell"></a>

Claude Code passes your exported shell environment down to MCP subprocesses. **Most harnesses don't.**
Codex, for one, spawns the server without your `PINECONE_API_KEY`, so a shell-exported key produces a
setup that works perfectly in one harness and fails in every other — and the failure surfaces late,
inside a tool call, not at startup.

A self-contained server ends that whole class of problem: the launcher `cd`s to the repo root, Bun
auto-loads `.env`, and every harness gets identical config with zero per-harness plumbing.

## Troubleshooting

**`bun: command not found` / the server dies instantly.**
Harnesses spawn MCP servers with a minimal `PATH` that often omits version-manager shims (mise, asdf,
nvm). The launcher already recovers `bun` from the common install locations — if yours lives somewhere
else, add it to the loop in `scripts/mcp-server.sh`.

**Tools appear, but every call fails on Pinecone auth.**
The key isn't reaching the process. Confirm it's in `.env` (not only exported in your shell), and that
you're pointing the harness at `scripts/mcp-server.sh` rather than at `bun run src/index.ts`.

**A node you just promoted doesn't come back.**
Almost always the gate: it's written but not committed. Check `git -C <store> status`.

**Don't debug a harness with a one-shot command.**
`codex exec "..."` / `claude -p "..."` are fire-and-forget — they mask real MCP startup errors as
generic failures (a missing key surfaced as "user cancelled" during this project's own build). Verify
cross-harness behavior in an **interactive** session, where the harness actually reports what broke.
