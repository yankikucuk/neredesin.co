/**
 * @fileoverview Unit tests for lib/utils.js, runnable with Node's
 * built-in test runner — no dependencies, no build step:
 *
 *     node --test tests/
 *
 * @license MIT
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  parseTags,
  slugify,
  uniqueSlug,
  formatTime,
  formatDate,
  readingTime,
  firstParagraph,
} from "../lib/utils.js";

test("parseFrontmatter: extracts meta and body", () => {
  const { meta, body } = parseFrontmatter(
    "---\ntitle: Merhaba\ndate: 2026-01-05\n---\n# İçerik",
  );
  assert.equal(meta.title, "Merhaba");
  assert.equal(meta.date, "2026-01-05");
  assert.equal(body, "# İçerik");
});

test("parseFrontmatter: keeps colons inside values", () => {
  const { meta } = parseFrontmatter("---\nlink: https://a.b/c\n---\nx");
  assert.equal(meta.link, "https://a.b/c");
});

test("parseFrontmatter: returns full text as body when no frontmatter", () => {
  const { meta, body } = parseFrontmatter("# Sadece içerik");
  assert.deepEqual(meta, {});
  assert.equal(body, "# Sadece içerik");
});

test("parseTags: splits, trims and drops empties", () => {
  assert.deepEqual(parseTags("javascript,  notlar , "), [
    "javascript",
    "notlar",
  ]);
  assert.deepEqual(parseTags(undefined), []);
  assert.deepEqual(parseTags(""), []);
});

test("slugify: folds Turkish characters correctly", () => {
  assert.equal(slugify("İlk Yazım"), "ilk-yazim");
  assert.equal(slugify("Değişkenler ve Şablonlar"), "degiskenler-ve-sablonlar");
  assert.equal(slugify("Çok Güzel Öğüt"), "cok-guzel-ogut");
});

test("slugify: strips punctuation and squeezes dashes", () => {
  assert.equal(slugify("  Hello,   World!  "), "hello-world");
  assert.equal(slugify("a---b"), "a-b");
  assert.equal(slugify("!!!"), "");
});

test("uniqueSlug: appends -2, -3 on collision and records use", () => {
  const used = new Set();
  assert.equal(uniqueSlug("not", used), "not");
  assert.equal(uniqueSlug("not", used), "not-2");
  assert.equal(uniqueSlug("not", used), "not-3");
  assert.equal(used.size, 3);
});

test("uniqueSlug: falls back for empty base", () => {
  const used = new Set();
  assert.equal(uniqueSlug("", used), "yazi");
});

test("formatTime: renders m:ss and guards non-finite values", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(67), "1:07");
  assert.equal(formatTime(600), "10:00");
  assert.equal(formatTime(Infinity), "--:--");
  assert.equal(formatTime(NaN), "--:--");
  assert.equal(formatTime(-5), "--:--");
});

test("formatDate: ISO to DD/MM/YYYY", () => {
  assert.equal(formatDate("2026-07-02"), "02/07/2026");
});

test("readingTime: ~200 wpm, min 1, ignores code and audio", () => {
  assert.equal(readingTime("kısa metin"), 1);
  const words400 = Array(400).fill("kelime").join(" ");
  assert.equal(readingTime(words400), 2);
  const codeOnly = "```js\n" + Array(500).fill("x").join(" ") + "\n```";
  assert.equal(readingTime(codeOnly), 1);
  assert.equal(readingTime("@audio:sounds/a.mp3"), 1);
});

test("firstParagraph: returns first prose block only", () => {
  const md =
    "# Başlık\n\n> alıntı satırı\n\n- madde\n\n@audio:sounds/a.mp3\n\nGerçek özet paragrafı\nikinci satırıyla.\n\nSonraki paragraf.";
  assert.equal(firstParagraph(md), "Gerçek özet paragrafı ikinci satırıyla.");
});

test("firstParagraph: skips fenced code and handles empty input", () => {
  assert.equal(firstParagraph("```\nkod\n```\n\nÖzet."), "Özet.");
  assert.equal(firstParagraph("# Sadece başlık"), "");
  assert.equal(firstParagraph(""), "");
});
