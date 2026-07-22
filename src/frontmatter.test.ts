import { describe, expect, test } from "bun:test";
import { buildNodeMarkdown, parseNodeMarkdown } from "./frontmatter";

describe("frontmatter round-trip", () => {
  test("build -> parse recovers every field, including tricky scalar values", () => {
    const fm = {
      type: "knowledge",
      title: 'A "quoted": title, with punctuation',
      description: "",
      tags: ["ams", "north-star"],
      source_episode: "2026-07-21T00-00-00-000Z-abc123",
      source_path: "obsidian/ams.md",
    };
    const prose = "Line one.\n\nLine two, with a colon: still fine.";

    const { fields, prose: parsedProse } = parseNodeMarkdown(buildNodeMarkdown(fm, prose));

    expect(fields.title).toBe(fm.title);
    expect(fields.description).toBe("");
    expect(fields.tags).toEqual(fm.tags);
    expect(fields.source_episode).toBe(fm.source_episode);
    expect(fields.source_path).toBe(fm.source_path);
    expect(parsedProse).toBe(prose);
  });

  test("source_path is omitted entirely when absent (not written as an empty field)", () => {
    const md = buildNodeMarkdown(
      { type: "knowledge", title: "No Source", description: "d", tags: [], source_episode: "ep1" },
      "body",
    );
    expect(md).not.toContain("source_path");
    const { fields } = parseNodeMarkdown(md);
    expect(fields.source_path).toBeUndefined();
    expect(fields.tags).toEqual([]);
  });

  test("prose containing the closing marker does not truncate the body", () => {
    const prose = "before\n---\n\nafter";
    const md = buildNodeMarkdown(
      { type: "knowledge", title: "T", description: "", tags: [], source_episode: "ep1" },
      prose,
    );
    expect(parseNodeMarkdown(md).prose).toBe(prose);
  });

  test("parseNodeMarkdown throws on input missing the frontmatter closing marker", () => {
    expect(() => parseNodeMarkdown("---\ntitle: \"x\"\nno closing marker here")).toThrow(
      /missing frontmatter closing marker/i,
    );
  });
});
