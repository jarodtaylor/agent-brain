#!/usr/bin/env bun
/**
 * agent-brain — MCP server (walking-skeleton stub)
 *
 * Exposes the three-step memory loop as MCP tools:
 *   capture  → record a raw episode into the runtime tier
 *   promote  → distill a raw episode into durable truth (git markdown + vector projection)
 *   retrieve → semantic recall of distilled truth, with provenance
 *
 * These are intentionally stubs. Sprint 1 wires them to real storage (markdown + Pinecone).
 * The architecture rule they enforce: nothing is "known" until it is promoted into durable truth.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { captureEpisode } from "./capture";
import { promoteEpisode } from "./promote";
import { resolveStore } from "./store";

const server = new McpServer({ name: "agent-brain", version: "0.0.1" });

server.registerTool(
  "capture",
  {
    title: "Capture",
    description:
      "Record a raw episode (a decision, plan, or note) into the runtime tier. Raw stays raw until promoted.",
    inputSchema: {
      text: z.string().describe("The raw episode text to capture."),
      source: z.string().optional().describe("Where it came from — e.g. the harness or session id."),
    },
  },
  async ({ text, source }) => {
    const store = resolveStore();
    const episode = captureEpisode(store, { text, source });
    return {
      content: [
        {
          type: "text",
          text: `Captured episode ${episode.id}${source ? ` from ${source}` : ""}. Not yet retrievable — promote it to make it durable truth.`,
        },
      ],
    };
  },
);

server.registerTool(
  "promote",
  {
    title: "Promote",
    description:
      "Distill a captured raw episode into a durable, human-readable knowledge node (git markdown), written uncommitted. The calling agent authors the distilled prose; the node becomes durable truth only once a human commits it.",
    inputSchema: {
      episodeId: z.string().describe("Id of the captured episode to promote."),
      title: z.string().describe("Title of the knowledge node. Determines its slug/filename."),
      prose: z.string().describe("The distilled prose, authored by the calling agent. Written verbatim as the node body."),
      description: z.string().optional().describe("One-line description for the node's frontmatter."),
      tags: z.array(z.string()).optional().describe("Tags for the node's frontmatter."),
    },
  },
  async ({ episodeId, title, prose, description, tags }) => {
    const store = resolveStore();
    const node = promoteEpisode(store, { episodeId, title, prose, description, tags });
    return {
      content: [
        {
          type: "text",
          text: `Promoted episode ${episodeId} to ${node.path} (uncommitted). Review the diff and commit to make it durable truth.`,
        },
      ],
    };
  },
);

server.registerTool(
  "retrieve",
  {
    title: "Retrieve",
    description:
      "Semantically recall distilled truth for a query. Returns durable knowledge with provenance — not raw transcripts.",
    inputSchema: {
      query: z.string().describe("What to recall."),
      topK: z.number().int().positive().optional().describe("How many results (default 5)."),
    },
  },
  async ({ query, topK }) => ({
    content: [
      {
        type: "text",
        text: `[stub] would retrieve top ${topK ?? 5} distilled notes for: "${query}". (not wired yet)`,
      },
    ],
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — log to stderr only.
  console.error("agent-brain MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("agent-brain failed to start:", err);
  process.exit(1);
});
