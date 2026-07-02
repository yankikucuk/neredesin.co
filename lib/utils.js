/**
 * @fileoverview Pure, dependency-free text utilities for the blog engine.
 *
 * Everything in this module is a side-effect-free function of its inputs,
 * which keeps it importable both from the browser (script.js) and from
 * Node's built-in test runner (tests/utils.test.js) without a build step.
 *
 * @module BlogUtils
 * @version 2.0.0
 * @license MIT
 */

/**
 * Parses YAML-like frontmatter delimited by `---` from a markdown string.
 *
 * Values may contain colons (e.g. URLs); only the first colon on a line
 * separates key from value. Unknown lines without a key are ignored.
 *
 * @param {string} text - Raw markdown text potentially containing frontmatter.
 * @returns {{ meta: Object<string, string>, body: string }}
 *   Parsed metadata key-value pairs and the remaining markdown body.
 *
 * @example
 * const { meta, body } = parseFrontmatter("---\ntitle: Hello\ndate: 2025-01-01\n---\n# Content");
 * // meta = { title: "Hello", date: "2025-01-01" }
 * // body = "# Content"
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim();
  }

  return { meta, body: match[2] };
}

/**
 * Splits a comma-separated frontmatter tag value into a clean array.
 *
 * @param {string|undefined} value - Raw `tags:` frontmatter value.
 * @returns {string[]} Trimmed, non-empty tag names (original casing kept).
 *
 * @example
 * parseTags("javascript,  notlar , "); // ["javascript", "notlar"]
 */
export function parseTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Converts a title string into a URL-safe slug, correctly folding Turkish
 * characters (İ/ı, ğ, ü, ş, ö, ç) to their ASCII equivalents.
 *
 * @param {string} title - Human-readable title.
 * @returns {string} URL-safe slug (e.g. "ilk-yazim").
 *
 * @example
 * slugify("İlk Yazım"); // "ilk-yazim"
 */
export function slugify(title) {
  return title
    .replace(/İ/g, "I")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns a slug guaranteed to be unique within the given set, appending
 * `-2`, `-3`, … on collision. The chosen slug is added to the set.
 *
 * @param {string} base - Candidate slug (already slugified).
 * @param {Set<string>} used - Slugs taken so far; mutated with the result.
 * @returns {string} Unique slug.
 *
 * @example
 * const used = new Set(["not"]);
 * uniqueSlug("not", used); // "not-2"
 */
export function uniqueSlug(base, used) {
  let slug = base || "yazi";
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/**
 * Formats a duration in seconds to `m:ss` display format. Non-finite
 * values (streams reporting `Infinity`, or `NaN` before metadata loads)
 * render as a placeholder instead of `NaN:NaN`.
 *
 * @param {number} seconds - Time value in seconds.
 * @returns {string} Formatted time string (e.g. "3:07"), or "--:--".
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD/MM/YYYY display format.
 *
 * @param {string} isoDate - Date string in "YYYY-MM-DD" format.
 * @returns {string} Formatted date string (e.g. "28/06/2025").
 */
export function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Estimates reading time in whole minutes from a markdown body.
 *
 * Fenced code blocks and `@audio:` directives are excluded from the word
 * count; the estimate assumes ~200 words per minute and never reports
 * less than one minute.
 *
 * @param {string} markdown - Markdown body (frontmatter already removed).
 * @returns {number} Estimated reading time in minutes (>= 1).
 */
export function readingTime(markdown) {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^@audio:.*$/gm, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Extracts the first plain-prose paragraph from a markdown body, for use
 * as a list-view summary. Headings, fenced code, blockquotes, lists,
 * `@audio:` directives and blank lines are skipped.
 *
 * @param {string} markdown - Markdown body (frontmatter already removed).
 * @returns {string} Raw markdown of the first paragraph, or "" if none.
 */
export function firstParagraph(markdown) {
  const blocks = markdown.replace(/```[\s\S]*?```/g, " ").split(/\n{2,}/);

  for (const block of blocks) {
    const t = block.trim();
    if (
      !t ||
      t.startsWith("#") ||
      t.startsWith(">") ||
      t.startsWith("@audio:") ||
      /^([-*+]|\d+\.)\s/.test(t)
    ) {
      continue;
    }
    return t.replace(/\s+/g, " ");
  }
  return "";
}
