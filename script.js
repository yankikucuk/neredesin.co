/**
 * @fileoverview Static markdown blog engine: frontmatter parsing, sanitized
 * markdown rendering (marked + DOMPurify), One Dark Pro syntax highlighting
 * (highlight.js core build with a curated language set), client-side search
 * and tag filtering, summary/single-post views over hash routing, custom
 * audio players and lazy-reveal animations.
 *
 * The module resolves content URLs against its own location
 * (`import.meta.url`), so localized pages in subdirectories (e.g. `en/`)
 * can reuse it unchanged.
 *
 * @module BlogEngine
 * @requires marked
 * @requires marked-highlight
 * @requires highlight.js
 * @requires dompurify
 * @version 2.0.0
 * @license MIT
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked@18.0.5/lib/marked.esm.js";
import { markedHighlight } from "https://cdn.jsdelivr.net/npm/marked-highlight@2.2.4/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.4.11/+esm";
import hljs from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/core.min.js";
import langJavascript from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/javascript.min.js";
import langTypescript from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/typescript.min.js";
import langPython from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/python.min.js";
import langBash from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/bash.min.js";
import langJson from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/json.min.js";
import langCss from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/css.min.js";
import langXml from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/xml.min.js";
import langYaml from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/yaml.min.js";
import langSql from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/sql.min.js";
import langMarkdown from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/markdown.min.js";
import langPlaintext from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es/languages/plaintext.min.js";

import {
  parseFrontmatter,
  parseTags,
  slugify,
  uniqueSlug,
  formatTime,
  formatDate,
  readingTime,
  firstParagraph,
} from "./lib/utils.js";

/* ==========================================================================
   Configuration
   ========================================================================== */

/** Site display name, used in document titles. @type {string} */
const SITE_NAME = "Neredesin Co?";

/** Posts rendered per batch before the "load more" button. @type {number} */
const POSTS_PER_PAGE = 5;

/** Seconds skipped by one arrow-key press on the audio slider. @type {number} */
const SEEK_STEP_SECONDS = 5;

/** Base URL for content fetches, anchored to this module's location. */
const BASE_URL = new URL(".", import.meta.url);

/**
 * UI strings, keyed by page language (`<html lang>`); Turkish is the
 * default, `en/` pages get English chrome around the same content.
 */
const STRINGS = {
  tr: {
    searchPlaceholder: "Yazılarda ara…",
    searchLabel: "Blog yazılarında ara",
    allTag: "Tümü",
    readMore: "Devamını oku →",
    back: "← Tüm yazılar",
    loadMore: "Daha Fazla",
    minRead: (n) => `${n} dk okuma`,
    noResults: "Aramanla eşleşen yazı bulunamadı.",
    loadError:
      "Yazılar yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.",
    copy: "Kopyala",
    copied: "Kopyalandı",
    play: "Oynat",
    pause: "Duraklat",
    audioPosition: "Ses konumu",
    audioError: "Ses dosyası yüklenemedi.",
    permalink: "Bu yazının bağlantısı",
  },
  en: {
    searchPlaceholder: "Search posts…",
    searchLabel: "Search blog posts",
    allTag: "All",
    readMore: "Read more →",
    back: "← All posts",
    loadMore: "Load More",
    minRead: (n) => `${n} min read`,
    noResults: "No posts match your search.",
    loadError: "Something went wrong while loading posts. Please refresh.",
    copy: "Copy",
    copied: "Copied",
    play: "Play",
    pause: "Pause",
    audioPosition: "Audio position",
    audioError: "Audio file could not be loaded.",
    permalink: "Permalink to this post",
  },
};

/** Active string table for the current page language. */
const L =
  STRINGS[(document.documentElement.lang || "tr").slice(0, 2)] || STRINGS.tr;

/* ==========================================================================
   Markdown pipeline
   ========================================================================== */

for (const [name, lang] of Object.entries({
  javascript: langJavascript,
  typescript: langTypescript,
  python: langPython,
  bash: langBash,
  json: langJson,
  css: langCss,
  xml: langXml,
  yaml: langYaml,
  sql: langSql,
  markdown: langMarkdown,
  plaintext: langPlaintext,
})) {
  hljs.registerLanguage(name, lang);
}

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
  {
    // Demote every heading one level (h1→h2, …) so post markdown can use
    // "# Title" naturally while the page keeps a single top-level <h1>.
    walkTokens(token) {
      if (token.type === "heading" && token.depth < 6) token.depth += 1;
    },
  },
);

/**
 * Renders markdown to sanitized HTML. All rendered post content passes
 * through DOMPurify, per marked's own security guidance — marked does not
 * sanitize its output.
 *
 * @param {string} md - Markdown source.
 * @param {boolean} [inline=false] - Render as inline (no <p> wrapper).
 * @returns {string} Sanitized HTML.
 */
function renderMarkdown(md, inline = false) {
  const html = inline ? marked.parseInline(md) : marked.parse(md);
  return DOMPurify.sanitize(html);
}

/**
 * Replaces `@audio:<path>` directives in markdown with custom HTML audio
 * player markup before the markdown is parsed by marked.js.
 *
 * Each player includes a play/pause toggle button, a seekable/keyboard
 * operable progress bar (`role="slider"`), and a time display.
 *
 * @param {string} md - Markdown string containing `@audio:` directives.
 * @returns {string} Markdown with audio directives replaced by player HTML.
 */
function processAudio(md) {
  return md.replace(/@audio:(.+)/g, (_, src) => {
    const file = new URL(src.trim(), BASE_URL).href;

    return `<div class="ap" data-src="${file}">
      <button class="ap-btn" aria-label="${L.play}" aria-pressed="false">
        <svg class="ap-icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="6,3 20,12 6,21"/>
        </svg>
        <svg class="ap-icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="5" y="3" width="4" height="18"/>
          <rect x="15" y="3" width="4" height="18"/>
        </svg>
      </button>
      <div class="ap-track" role="slider" tabindex="0" aria-label="${L.audioPosition}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="ap-progress"><div class="ap-fill"></div></div>
      </div>
      <span class="ap-time">0:00</span>
    </div>`;
  });
}

/* ==========================================================================
   Audio players
   ========================================================================== */

/**
 * Initializes `.ap` audio player elements found within a given root.
 *
 * Wires up play/pause toggling (with `aria-pressed`/`aria-label` state),
 * progress updates, mouse seeking, keyboard seeking (arrows/Home/End),
 * exclusive playback across players, and load-failure reporting.
 *
 * @param {ParentNode} [root=document] - Element to search for `.ap` players.
 */
function initAudioPlayers(root = document) {
  root.querySelectorAll(".ap").forEach((el) => {
    const audio = new Audio();
    audio.preload = "none";
    audio.src = el.dataset.src;

    const btn = el.querySelector(".ap-btn");
    const fill = el.querySelector(".ap-fill");
    const track = el.querySelector(".ap-track");
    const time = el.querySelector(".ap-time");

    /**
     * Syncs the play/pause button's visual and accessible state.
     * @param {boolean} isPlaying
     */
    function setPlayingState(isPlaying) {
      el.classList.toggle("playing", isPlaying);
      btn.setAttribute("aria-pressed", String(isPlaying));
      btn.setAttribute("aria-label", isPlaying ? L.pause : L.play);
    }

    audio.addEventListener("error", () => {
      el.classList.add("ap-error");
      time.textContent = "--:--";
      const note = document.createElement("span");
      note.className = "ap-error-note";
      note.textContent = L.audioError;
      track.replaceWith(note);
      btn.disabled = true;
    });

    btn.addEventListener("click", () => {
      if (audio.paused) {
        document.querySelectorAll(".ap.playing").forEach((other) => {
          if (other !== el) other.querySelector(".ap-btn").click();
        });
        audio.play();
        setPlayingState(true);
      } else {
        audio.pause();
        setPlayingState(false);
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (!Number.isFinite(audio.duration) || !audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      fill.style.width = `${pct}%`;
      track.setAttribute("aria-valuenow", String(Math.round(pct)));
      time.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setPlayingState(false);
      fill.style.width = "0%";
      track.setAttribute("aria-valuenow", "0");
      time.textContent = formatTime(audio.duration);
    });

    audio.addEventListener("loadedmetadata", () => {
      time.textContent = formatTime(audio.duration);
    });

    track.addEventListener("click", (e) => {
      if (!Number.isFinite(audio.duration) || !audio.duration) return;
      const rect = track.getBoundingClientRect();
      audio.currentTime =
        ((e.clientX - rect.left) / rect.width) * audio.duration;
    });

    track.addEventListener("keydown", (e) => {
      if (!Number.isFinite(audio.duration) || !audio.duration) return;
      switch (e.key) {
        case "ArrowRight":
          audio.currentTime = Math.min(
            audio.duration,
            audio.currentTime + SEEK_STEP_SECONDS,
          );
          break;
        case "ArrowLeft":
          audio.currentTime = Math.max(
            0,
            audio.currentTime - SEEK_STEP_SECONDS,
          );
          break;
        case "Home":
          audio.currentTime = 0;
          break;
        case "End":
          audio.currentTime = audio.duration;
          break;
        default:
          return;
      }
      e.preventDefault();
    });
  });
}

/* ==========================================================================
   Presentation helpers
   ========================================================================== */

/** True when the user asks for reduced motion; disables smooth scrolls. */
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

/**
 * Observes elements and swaps `lazy-hidden` → `lazy-visible` as they
 * enter the viewport, driving the fade-in animation in CSS.
 *
 * @type {IntersectionObserver}
 */
const lazyObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.replace("lazy-hidden", "lazy-visible");
        lazyObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.1 },
);

/**
 * Copies text to the clipboard, preferring the async Clipboard API and
 * falling back to a hidden-textarea `execCommand("copy")` for contexts
 * where the API is unavailable or denied (unfocused document, older
 * browsers).
 *
 * @param {string} text - Text to place on the clipboard.
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Adds a copy-to-clipboard button to every fenced code block under root.
 *
 * @param {ParentNode} root - Container holding rendered `<pre>` blocks.
 */
function addCopyButtons(root) {
  root.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code || pre.querySelector(".copy-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = L.copy;
    btn.addEventListener("click", async () => {
      if (!(await copyText(code.textContent))) return;
      btn.textContent = L.copied;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = L.copy;
        btn.classList.remove("copied");
      }, 2000);
    });
    pre.appendChild(btn);
  });
}

/* ==========================================================================
   Post loading & views
   ========================================================================== */

/**
 * A fully prepared blog post.
 * @typedef {Object} Post
 * @property {string} slug - Unique URL-safe identifier.
 * @property {string} title - Display title (frontmatter or filename).
 * @property {string} [date] - ISO date from frontmatter.
 * @property {string[]} tags - Tag names from frontmatter.
 * @property {number} minutes - Estimated reading time.
 * @property {string} summaryHtml - Sanitized inline HTML of the summary.
 * @property {string} fullHtml - Sanitized HTML of the whole post.
 */

/** @type {Post[]} */
let posts = [];

/** Current search query (lowercased, Turkish locale). @type {string} */
let query = "";

/** Currently active tag filter, or null for all. @type {?string} */
let activeTag = null;

const content = document.getElementById("content");

/**
 * Fetches and prepares all posts listed in posts/index.json, in parallel.
 *
 * @async
 * @returns {Promise<Post[]>}
 */
async function fetchPosts() {
  const indexRes = await fetch(new URL("posts/index.json", BASE_URL));
  if (!indexRes.ok) {
    throw new Error(`index.json: HTTP ${indexRes.status}`);
  }
  const files = await indexRes.json();

  const sources = await Promise.all(
    files.map(async (file) => {
      const res = await fetch(new URL(`posts/${file}`, BASE_URL));
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      return { file, text: await res.text() };
    }),
  );

  const usedSlugs = new Set();
  return sources.map(({ file, text }) => {
    const { meta, body } = parseFrontmatter(text);
    const title = meta.title || file.replace(/\.md$/, "");
    const slug = uniqueSlug(slugify(title), usedSlugs);
    const summary = firstParagraph(body);

    return {
      slug,
      title,
      date: meta.date,
      tags: parseTags(meta.tags),
      minutes: readingTime(body),
      summaryHtml: summary ? renderMarkdown(summary, true) : "",
      fullHtml: renderMarkdown(processAudio(body)),
      searchText: `${title} ${meta.tags || ""} ${body}`.toLocaleLowerCase("tr"),
    };
  });
}

/**
 * Builds the date + reading-time meta row markup for a post.
 *
 * @param {Post} post
 * @param {boolean} linked - Wrap the date in a permalink anchor.
 * @returns {string} HTML fragment.
 */
function metaRow(post, linked) {
  const date = post.date
    ? `<time datetime="${post.date}">${formatDate(post.date)}</time>`
    : "";
  const wrapped = linked
    ? `<a href="#${post.slug}" class="post-permalink" aria-label="${L.permalink}">${date}</a>`
    : date;
  return `<div class="post-meta">${wrapped}<span class="reading-time">${L.minRead(post.minutes)}</span></div>`;
}

/**
 * Returns posts matching the active search query and tag filter.
 * @returns {Post[]}
 */
function filteredPosts() {
  return posts.filter((p) => {
    if (activeTag && !p.tags.includes(activeTag)) return false;
    if (query && !p.searchText.includes(query)) return false;
    return true;
  });
}

/**
 * Renders the list view: toolbar (search + tag chips), summary cards in
 * batches of {@link POSTS_PER_PAGE}, and a "load more" button.
 */
function renderList() {
  document.title = `Blog — ${SITE_NAME}`;
  content.innerHTML = "<h1>Blog</h1>";

  const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort((a, b) =>
    a.localeCompare(b, "tr"),
  );

  const toolbar = document.createElement("div");
  toolbar.className = "blog-toolbar";
  toolbar.innerHTML = `
    <input type="search" class="post-search" placeholder="${L.searchPlaceholder}"
      aria-label="${L.searchLabel}" value="${query.replace(/"/g, "&quot;")}" />
    <div class="tag-filter" role="group" aria-label="Tag filter"></div>`;

  const tagWrap = toolbar.querySelector(".tag-filter");
  const mkChip = (label, tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag tag-chip" + (activeTag === tag ? " active" : "");
    chip.setAttribute("aria-pressed", String(activeTag === tag));
    chip.textContent = label;
    chip.addEventListener("click", () => {
      activeTag = tag;
      renderList();
    });
    return chip;
  };
  tagWrap.appendChild(mkChip(L.allTag, null));
  allTags.forEach((t) => tagWrap.appendChild(mkChip(t, t)));

  let searchDebounce;
  toolbar.querySelector(".post-search").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      query = e.target.value.trim().toLocaleLowerCase("tr");
      renderListBody(list);
    }, 150);
  });

  content.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "post-list";
  content.appendChild(list);
  renderListBody(list);

  // Restore focus to the search box after a filter re-render.
  if (query) {
    const box = toolbar.querySelector(".post-search");
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

/**
 * (Re)renders the card list portion of the list view for the current
 * filters, with batch pagination.
 *
 * @param {HTMLElement} list - The `.post-list` container.
 */
function renderListBody(list) {
  const matches = filteredPosts();
  let shown = 0;
  list.innerHTML = "";

  if (!matches.length) {
    list.innerHTML = `<p class="load-error">${L.noResults}</p>`;
    return;
  }

  function showBatch() {
    for (const post of matches.slice(shown, shown + POSTS_PER_PAGE)) {
      const card = document.createElement("article");
      card.className = "post-card lazy-hidden";
      card.innerHTML = `
        ${metaRow(post, true)}
        <h2 class="post-card-title"><a href="#${post.slug}">${post.title}</a></h2>
        ${post.tags.length ? `<div class="tag-list">${post.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}
        ${post.summaryHtml ? `<p class="post-summary">${post.summaryHtml}</p>` : ""}
        <a class="read-more" href="#${post.slug}">${L.readMore}</a>`;
      list.appendChild(card);
      lazyObserver.observe(card);
    }
    shown = Math.min(shown + POSTS_PER_PAGE, matches.length);

    list.querySelector(".load-more-btn")?.remove();
    if (shown < matches.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "load-more-btn";
      btn.textContent = L.loadMore;
      btn.addEventListener("click", showBatch);
      list.appendChild(btn);
    }
  }

  showBatch();
}

/**
 * Renders the single-post view for a slug: back link, full article,
 * copy buttons and audio players.
 *
 * @param {Post} post
 */
function renderPost(post) {
  document.title = `${post.title} — ${SITE_NAME}`;
  content.innerHTML = "";

  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "#";
  back.textContent = L.back;
  content.appendChild(back);

  const article = document.createElement("article");
  article.id = post.slug;
  article.className = "post-full lazy-visible";
  article.innerHTML = `
    ${metaRow(post, false)}
    ${post.fullHtml}
    ${post.tags.length ? `<div class="tag-list post-full-tags">${post.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}`;
  content.appendChild(article);

  addCopyButtons(article);
  initAudioPlayers(article);

  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}

/** Routes to the view matching the current location hash. */
function route() {
  const slug = decodeURIComponent(location.hash.slice(1));
  const post = slug && posts.find((p) => p.slug === slug);
  if (post) {
    renderPost(post);
  } else {
    renderList();
  }
}

/**
 * Entry point: fetches posts, then wires hash routing. Failures surface
 * as an inline error message instead of an unhandled rejection.
 *
 * @async
 */
async function main() {
  content.innerHTML = "<h1>Blog</h1>";
  try {
    posts = await fetchPosts();
    window.addEventListener("hashchange", route);
    route();
  } catch (err) {
    console.error(err);
    const notice = document.createElement("p");
    notice.className = "load-error";
    notice.textContent = L.loadError;
    content.appendChild(notice);
  }
}

main();
