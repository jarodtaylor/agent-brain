import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { captureEpisode } from "./capture";
import { useTempStores } from "./test-support";

const { freshStore } = useTempStores();

describe("captureEpisode", () => {
  test("writes an immutable raw episode dir with content + provenance", () => {
    const store = freshStore();

    const episode = captureEpisode(store, { text: "the north star is X", source: "obsidian/ams.md" });

    expect(episode.id).toBeTruthy();
    expect(episode.source).toBe("obsidian/ams.md");
    expect(episode.capturedAt).toBeTruthy();

    const episodeDir = join(store.rawDir, episode.id);
    expect(existsSync(episodeDir)).toBe(true);

    const content = readFileSync(join(episodeDir, "content.md"), "utf8");
    expect(content).toBe("the north star is X");

    const meta = JSON.parse(readFileSync(join(episodeDir, "meta.json"), "utf8"));
    expect(meta.id).toBe(episode.id);
    expect(meta.source).toBe("obsidian/ams.md");
    expect(meta.capturedAt).toBe(episode.capturedAt);
  });

  test("capturing without a source omits provenance rather than fabricating it", () => {
    const store = freshStore();

    const episode = captureEpisode(store, { text: "loose note" });

    expect(episode.source).toBeUndefined();
    const meta = JSON.parse(readFileSync(join(store.rawDir, episode.id, "meta.json"), "utf8"));
    expect(meta.source).toBeUndefined();
  });

  test("re-capturing edited text from the same source creates a second episode; the first is byte-unchanged", () => {
    const store = freshStore();

    const first = captureEpisode(store, { text: "draft A", source: "notes.md" });
    const firstContentPath = join(store.rawDir, first.id, "content.md");
    const firstBytesBefore = readFileSync(firstContentPath);

    const second = captureEpisode(store, { text: "draft B — edited", source: "notes.md" });

    expect(second.id).not.toBe(first.id);
    expect(existsSync(join(store.rawDir, first.id))).toBe(true);
    expect(existsSync(join(store.rawDir, second.id))).toBe(true);

    const firstBytesAfter = readFileSync(firstContentPath);
    expect(firstBytesAfter.equals(firstBytesBefore)).toBe(true);
    expect(readFileSync(firstContentPath, "utf8")).toBe("draft A");
    expect(readFileSync(join(store.rawDir, second.id, "content.md"), "utf8")).toBe("draft B — edited");

    // both episodes present — raw/ is a log, never overwritten in place.
    const episodeIds = readdirSync(store.rawDir);
    expect(episodeIds.sort()).toEqual([first.id, second.id].sort());
  });

  test("rejects empty or whitespace-only text with a clear error, rather than recording a hollow episode", () => {
    const store = freshStore();

    expect(() => captureEpisode(store, { text: "" })).toThrow(/empty/i);
    expect(() => captureEpisode(store, { text: "   \n\t  " })).toThrow(/empty/i);

    // nothing should have been written to raw/ — the store dir doesn't even exist yet.
    expect(existsSync(store.rawDir)).toBe(false);
  });

  test("creates raw/ on first capture into a fresh store", () => {
    const store = freshStore();
    expect(existsSync(store.rawDir)).toBe(false);

    captureEpisode(store, { text: "first ever capture" });

    expect(existsSync(store.rawDir)).toBe(true);
  });
});
