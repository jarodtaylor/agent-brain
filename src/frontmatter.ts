/**
 * agent-brain — OKF node wire format (write + read in ONE place).
 *
 * A distilled knowledge node is YAML frontmatter (JSON-encoded scalar values,
 * which are valid YAML double-quoted scalars) + a blank line + the prose body,
 * with a single trailing newline. `promote` writes it, `retrieve` reads it
 * back. Colocating both directions here means the escaping and the fences have
 * one source of truth — a change to one side can't silently break the other
 * (which is exactly what happened when write lived in promote.ts and parse in
 * retrieve.ts, synced only by a comment).
 */

/** Opening/closing frontmatter fence. */
export const FRONTMATTER_FENCE = "---";
/** The closing fence followed by the blank line before the body: `---\n\n`. */
export const FRONTMATTER_CLOSING = `${FRONTMATTER_FENCE}\n\n`;

// JSON's double-quoted string escaping is valid YAML double-quoted-scalar
// syntax — no YAML library needed for these controlled scalar values.
function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlStringArray(values: string[]): string {
  return `[${values.map(yamlString).join(", ")}]`;
}

/** The typed frontmatter of a distilled node. `type` is written as a bare scalar. */
export interface NodeFrontmatter {
  type: string;
  title: string;
  description: string;
  tags: string[];
  source_episode: string;
  source_path?: string;
}

/**
 * Serializes a node to its on-disk markdown: frontmatter + blank line + prose +
 * exactly one trailing newline.
 */
export function buildNodeMarkdown(fm: NodeFrontmatter, prose: string): string {
  const lines = [
    FRONTMATTER_FENCE,
    `type: ${fm.type}`,
    `title: ${yamlString(fm.title)}`,
    `description: ${yamlString(fm.description)}`,
    `tags: ${yamlStringArray(fm.tags)}`,
    `source_episode: ${yamlString(fm.source_episode)}`,
  ];
  if (fm.source_path) {
    lines.push(`source_path: ${yamlString(fm.source_path)}`);
  }
  lines.push(FRONTMATTER_FENCE, "");
  return `${lines.join("\n")}\n${prose}\n`;
}

/**
 * Parses the frontmatter block (everything before FRONTMATTER_CLOSING) into a
 * field map. Values are JSON (round-trip exactly); `type` is a bare scalar and
 * is skipped (unneeded by consumers).
 */
export function parseFrontmatterFields(raw: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    if (line === FRONTMATTER_FENCE || line.trim() === "") continue;
    const separator = line.indexOf(": ");
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    if (key === "type") continue;
    fields[key] = JSON.parse(line.slice(separator + 2));
  }
  return fields;
}

/** Splits node markdown into its parsed frontmatter fields and prose body. */
export function parseNodeMarkdown(contents: string): {
  fields: Record<string, unknown>;
  prose: string;
} {
  const closingIndex = contents.indexOf(FRONTMATTER_CLOSING);
  if (closingIndex === -1) {
    throw new Error("Malformed knowledge node: missing frontmatter closing marker.");
  }
  const fields = parseFrontmatterFields(contents.slice(0, closingIndex));
  const body = contents.slice(closingIndex + FRONTMATTER_CLOSING.length);
  // buildNodeMarkdown always appends exactly one trailing "\n" after the prose.
  const prose = body.endsWith("\n") ? body.slice(0, -1) : body;
  return { fields, prose };
}
