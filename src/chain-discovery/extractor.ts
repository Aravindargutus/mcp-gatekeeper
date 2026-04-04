import { logger } from "../utils/logger.js";
import type { ToolCallResult } from "../core/types.js";

export interface ExtractionResult {
  value: unknown;
  path: string;
  tier: number;
  candidates?: Array<{ path: string; value: unknown }>;
}

/**
 * Smart value extractor — finds a target field in MCP tool responses.
 *
 * Three tiers (no hardcoded wrapper keys — everything schema-driven):
 *   Tier 1: Parse JSON + exact field match
 *   Tier 2: Recursive deep search + fuzzy name matching
 *   Tier 3: Return multiple candidates for LLM resolution
 *
 * The response structure is NOT assumed. No "data", "result", "items"
 * hardcoding. The extractor walks whatever structure exists.
 */
export function extractFromResponse(
  response: ToolCallResult,
  fieldHint: string
): ExtractionResult | null {

  // Get the text content from MCP response
  const textContent = response.content
    ?.filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");

  if (!textContent) {
    logger.debug(`Extraction: no text content in response`);
    return null;
  }

  // Try to parse as JSON
  let data: unknown;
  try {
    data = JSON.parse(textContent);
  } catch {
    // Not JSON — try regex for common patterns
    return extractFromPlainText(textContent, fieldHint);
  }

  // Check for error responses
  if (isErrorResponse(data)) {
    logger.debug(`Extraction: response is an error`);
    return null;
  }

  // Tier 1: Exact match at current level
  const exact = findExact(data, fieldHint, "$");
  if (exact) {
    return { value: exact.value, path: exact.path, tier: 1 };
  }

  // Tier 2: Deep recursive search
  const allCandidates = findAllCandidates(data, fieldHint, "$", 0, 8);

  if (allCandidates.length === 1) {
    return { value: allCandidates[0].value, path: allCandidates[0].path, tier: 2 };
  }

  if (allCandidates.length > 1) {
    // Multiple candidates — pick the shallowest (closest to root)
    const sorted = allCandidates.sort((a, b) => a.depth - b.depth);

    // If the shallowest is clearly better (2+ levels shallower), use it
    if (sorted.length >= 2 && sorted[1].depth - sorted[0].depth >= 2) {
      return { value: sorted[0].value, path: sorted[0].path, tier: 2 };
    }

    // Ambiguous — return all candidates for LLM resolution (Tier 3)
    return {
      value: sorted[0].value,
      path: sorted[0].path,
      tier: 3,
      candidates: sorted.map((c) => ({ path: c.path, value: c.value })),
    };
  }

  // Nothing found
  return null;
}

/** Extract first element if data is or contains an array */
export function unwrapFirstElement(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.length > 0 ? data[0] : null;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) {
        return value[0];
      }
    }
  }
  return data;
}

// ── Internal helpers ──────────────────────────────

interface CandidateMatch {
  value: unknown;
  path: string;
  depth: number;
}

function findExact(data: unknown, fieldHint: string, currentPath: string): CandidateMatch | null {
  if (!data || typeof data !== "object") return null;

  // Handle arrays — search first element
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    return findExact(data[0], fieldHint, `${currentPath}[0]`);
  }

  const obj = data as Record<string, unknown>;
  const lowerHint = fieldHint.toLowerCase();

  // Exact key match
  if (lowerHint in obj) {
    return { value: obj[lowerHint], path: `${currentPath}.${lowerHint}`, depth: 0 };
  }

  // Case-insensitive exact match
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === lowerHint) {
      return { value, path: `${currentPath}.${key}`, depth: 0 };
    }
  }

  return null;
}

function findAllCandidates(
  data: unknown,
  fieldHint: string,
  currentPath: string,
  depth: number,
  maxDepth: number
): CandidateMatch[] {
  if (depth > maxDepth || !data) return [];

  const results: CandidateMatch[] = [];
  const lowerHint = fieldHint.toLowerCase().replace(/_/g, "");

  if (Array.isArray(data)) {
    if (data.length > 0) {
      results.push(...findAllCandidates(data[0], fieldHint, `${currentPath}[0]`, depth + 1, maxDepth));
    }
    return results;
  }

  if (typeof data !== "object") return results;

  const obj = data as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase().replace(/_/g, "");
    const path = `${currentPath}.${key}`;

    // Match strategies:
    // 1. Exact (case-insensitive, ignore underscores): "portal_id" matches "portalId"
    // 2. Contains: "portalId" contains "portal"
    // 3. Ends with "id" when hint ends with "_id": "id" matches "portal_id" hint
    const isMatch =
      lowerKey === lowerHint ||
      lowerKey.includes(lowerHint) ||
      lowerHint.includes(lowerKey) ||
      (lowerHint.endsWith("id") && lowerKey === "id" && depth > 0);

    if (isMatch && value != null && value !== "" && typeof value !== "object") {
      results.push({ value, path, depth });
    }

    // Recurse into nested objects/arrays
    if (value && typeof value === "object") {
      results.push(...findAllCandidates(value, fieldHint, path, depth + 1, maxDepth));
    }
  }

  return results;
}

function isErrorResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.error != null ||
    obj.status === "error" ||
    obj.code === "ERROR" ||
    (typeof obj.message === "string" && obj.success === false)
  );
}

function extractFromPlainText(text: string, fieldHint: string): ExtractionResult | null {
  // Common patterns in plain text responses
  const patterns = [
    new RegExp(`${fieldHint}[:\\s=]+["']?([\\w-]+)["']?`, "i"),
    /\b[Ii][Dd][:\s=]+["']?([\w-]+)["']?/,
    /\b(\d{10,})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return { value: match[1], path: "plaintext", tier: 2 };
    }
  }

  return null;
}
