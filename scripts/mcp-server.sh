#!/usr/bin/env bash
# Canonical launcher for the agent-brain MCP server.
#
# The cross-harness contract in one file: ANY MCP-speaking harness (Claude Code,
# Codex, Cursor, …) points at THIS script and shares the same brain. It cd's to
# the repo root so Bun auto-loads .env, which supplies BOTH AGENT_BRAIN_STORE and
# PINECONE_API_KEY — the server is self-contained and does NOT rely on the
# launching harness's environment. That is deliberate: harnesses other than Claude
# Code do not pass an exported PINECONE_API_KEY down to the MCP subprocess, so a
# shell-inherited key silently works in one harness and breaks every other one.
# .env is gitignored. No per-harness secret plumbing.
set -euo pipefail
cd "$(dirname "$0")/.."

# Harnesses spawn MCP servers with a minimal PATH that often omits a version
# manager's shim dir (mise/asdf/nvm), so `bun` may not resolve. Recover it from
# the common install locations before exec'ing.
if ! command -v bun >/dev/null 2>&1; then
  for d in "$HOME/.local/share/mise/shims" "$HOME/.bun/bin" /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$d/bun" ]; then PATH="$d:$PATH"; break; fi
  done
fi

exec bun run src/index.ts
