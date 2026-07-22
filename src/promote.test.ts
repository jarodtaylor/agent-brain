import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureEpisode } from "./capture";
import { promoteEpisode, slugify } from "./promote";
import { useTempStores } from "./test-support";

const { freshStore } = useTempStores();

function gitUntrackedFiles(dir: string): string {
  const result = Bun.spawnSync(["git", "-C", dir, "ls-files", "--others", "--exclude-standard"]);
  return result.stdout.toString();
}

function gitLsFiles(dir: string): string {
  const result = Bun.spawnSync(["git", "-C", dir, "ls-files"]);
  return result.stdout.toString();
}

describe("promoteEpisode", () => {
  test("writes an OKF node at the title-derived slug with frontmatter + provenance, uncommitted", () => {
    const store = freshStore();
    const episode = captureEpisode(store, { text: "the north star is X", source: "obsidian/ams.md" });

    const node = promoteEpisode(store, {
      episodeId: episode.id,
      title: "Agent Memory System North Star",
      prose: "The north star is a membrane between raw episodes and durable, curated truth.",
      description: "The core thesis of the memory system.",
      tags: ["ams", "northstar"],
    });

    expect(node.slug).toBe("agent-memory-system-north-star");
    expect(node.path).toBe(join(store.knowledgeDir, "agent-memory-system-north-star.md"));

    const contents = readFileSync(node.path, "utf8");
    expect(contents).toContain("type: knowledge");
    expect(contents).toContain('title: "Agent Memory System North Star"');
    expect(contents).toContain('description: "The core thesis of the memory system."');
    expect(contents).toContain('tags: ["ams", "northstar"]');
    expect(contents).toContain(`source_episode: "${episode.id}"`);
    expect(contents).toContain('source_path: "obsidian/ams.md"');
    expect(contents).toContain(
      "The north star is a membrane between raw episodes and durable, curated truth.",
    );

    // R7: promote writes the working file only — truth is the human commit.
    expect(gitUntrackedFiles(store.root)).toContain("knowledge/agent-memory-system-north-star.md");
    expect(gitLsFiles(store.root)).not.toContain("knowledge/agent-memory-system-north-star.md");
  });

  test("deterministic slug: re-promoting the SAME episode reuses the slug and overwrites in place", () => {
    const store = freshStore();
    const episode = captureEpisode(store, { text: "draft A" });

    const first = promoteEpisode(store, { episodeId: episode.id, title: "Shared Title", prose: "prose A" });
    const second = promoteEpisode(store, { episodeId: episode.id, title: "Shared Title", prose: "prose B — edited" });

    expect(second.slug).toBe(first.slug);
    expect(second.path).toBe(first.path);
    // Idempotent update: the working file now carries the new prose, not the old.
    const contents = readFileSync(second.path, "utf8");
    expect(contents).toContain("prose B — edited");
    expect(contents).not.toContain("prose A");
  });

  test("slug collision: a DIFFERENT episode whose title maps to an existing slug is refused, not silently overwritten", () => {
    const store = freshStore();
    const episodeA = captureEpisode(store, { text: "draft A" });
    const episodeB = captureEpisode(store, { text: "draft B" });

    promoteEpisode(store, { episodeId: episodeA.id, title: "Shared Title", prose: "prose A" });

    expect(() =>
      promoteEpisode(store, { episodeId: episodeB.id, title: "Shared Title", prose: "prose B" }),
    ).toThrow(/slug collision/i);
  });

  test("rejects an episodeId containing path traversal", () => {
    const store = freshStore();
    expect(() =>
      promoteEpisode(store, { episodeId: "../../etc", title: "X", prose: "y" }),
    ).toThrow(/path separators|\.\./i);
  });

  test("node body is exactly the agent-authored prose — agent-brain makes no LLM call and alters nothing", () => {
    const store = freshStore();
    const episode = captureEpisode(store, { text: "raw material" });
    const prose = "This is the exact distilled prose the calling agent wrote.\n\nIt has multiple paragraphs.";

    const node = promoteEpisode(store, { episodeId: episode.id, title: "Verbatim Body", prose });

    const contents = readFileSync(node.path, "utf8");
    const body = contents.slice(contents.indexOf("---\n\n") + "---\n\n".length);
    expect(body).toBe(`${prose}\n`);
  });

  test("promoting a non-existent episode id throws a clear error", () => {
    const store = freshStore();

    expect(() => promoteEpisode(store, { episodeId: "does-not-exist", title: "X", prose: "y" })).toThrow(
      /unknown episode|no captured episode/i,
    );
  });
});

describe("slugify", () => {
  test("lowercases, dashes spaces, strips punctuation, collapses and trims dashes", () => {
    expect(slugify("Agent Memory System: North Star!")).toBe("agent-memory-system-north-star");
    expect(slugify("  leading and trailing  ")).toBe("leading-and-trailing");
    expect(slugify("multiple   spaces")).toBe("multiple-spaces");
  });
});
