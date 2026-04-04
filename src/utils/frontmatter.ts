import { parse as parseYaml } from "yaml";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Frontmatter is YAML between `---` delimiters at the start of the file.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  const yamlStr = trimmed.substring(3, endIndex).trim();
  const body = trimmed.substring(endIndex + 3).trim();

  try {
    const parsed = parseYaml(yamlStr);
    return {
      frontmatter: typeof parsed === "object" && parsed !== null ? parsed : {},
      body,
      hasFrontmatter: true,
    };
  } catch {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }
}

/** Count words in a string (splits on whitespace). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
