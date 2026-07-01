/**
 * @fileoverview Static markdown blog engine with frontmatter parsing,
 * custom audio player embedding, and client-side rendering via marked.js.
 *
 * @module BlogEngine
 * @requires marked
 * @version 1.1.0
 * @license MIT
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js";
import { markedHighlight } from "https://cdn.jsdelivr.net/npm/marked-highlight@2.1.1/+esm";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

/**
 * Wires marked's fenced-code-block rendering through highlight.js so
 * code samples get One Dark Pro syntax highlighting (see the "Syntax
 * Highlighting" section of style.css for the color mapping). Falls back
 * to automatic language detection when a fence has no language hint.
 */
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
);

/**
 * Main content container element.
 * @type {HTMLElement}
 */
const content = document.getElementById("content");

/**
 * Number of posts to display per batch before showing the "load more" button.
 * @type {number}
 */
const POSTS_PER_PAGE = 5;

/**
 * Number of seconds an audio seek key press (arrow keys) skips.
 * @type {number}
 */
const SEEK_STEP_SECONDS = 5;

/**
 * Parses YAML-like frontmatter delimited by `---` from a markdown string.
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
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key) meta[key.trim()] = rest.join(":").trim();
  }

  return { meta, body: match[2] };
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
function slugify(title) {
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
 * Shifts every heading tag in a rendered HTML fragment down by one level
 * (h1→h2, h2→h3, …), so post content never competes with the page's own
 * top-level `<h1>` for document outline purposes.
 *
 * @param {string} html - Rendered HTML fragment, as produced by marked.js.
 * @returns {string} HTML with all heading levels demoted by one.
 */
function demoteHeadings(html) {
  return html.replace(/<(\/?)h([1-5])([^>]*)>/g, (_, close, level, attrs) => {
    const demoted = Number(level) + 1;
    return `<${close}h${demoted}${close ? "" : attrs}>`;
  });
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
 *
 * @example
 * processAudio("Some text\n@audio:sounds/track.mp3\nMore text");
 */
function processAudio(md) {
  return md.replace(/@audio:(.+)/g, (_, src) => {
    const file = src.trim();

    return `<div class="ap" data-src="${file}">
      <button class="ap-btn" aria-label="Oynat" aria-pressed="false">
        <svg class="ap-icon-play" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6,3 20,12 6,21"/>
        </svg>
        <svg class="ap-icon-pause" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="3" width="4" height="18"/>
          <rect x="15" y="3" width="4" height="18"/>
        </svg>
      </button>
      <div class="ap-track" role="slider" tabindex="0" aria-label="Ses konumu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="ap-progress"><div class="ap-fill"></div></div>
      </div>
      <span class="ap-time">0:00</span>
    </div>`;
  });
}

/**
 * Formats a duration in seconds to `m:ss` display format.
 *
 * @param {number} seconds - Time value in seconds.
 * @returns {string} Formatted time string (e.g. "3:07").
 */
function formatTime(seconds) {
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
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Initializes `.ap` audio player elements found within a given root.
 *
 * Wires up play/pause toggling (with `aria-pressed`/`aria-label` state),
 * progress bar updates, mouse seeking, keyboard seeking (arrow/home/end),
 * and exclusive playback (pausing other players when one starts).
 *
 * Scoping the query to `root` (rather than the whole document) prevents
 * re-initializing players that were already wired up in a previous batch.
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
      btn.setAttribute("aria-label", isPlaying ? "Duraklat" : "Oynat");
    }

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
      if (!audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      fill.style.width = `${pct}%`;
      track.setAttribute("aria-valuenow", String(Math.round(pct)));
      time.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setPlayingState(false);
      fill.style.width = "0%";
      track.setAttribute("aria-valuenow", "0");
      time.textContent = formatTime(audio.duration || 0);
    });

    audio.addEventListener("loadedmetadata", () => {
      time.textContent = formatTime(audio.duration);
    });

    track.addEventListener("click", (e) => {
      if (!audio.duration) return;
      const rect = track.getBoundingClientRect();
      audio.currentTime =
        ((e.clientX - rect.left) / rect.width) * audio.duration;
    });

    track.addEventListener("keydown", (e) => {
      if (!audio.duration) return;
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

/**
 * Observes article elements and applies a fade-in animation
 * when they enter the viewport.
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
 * Fetches the post index and all referenced markdown files, parses
 * frontmatter and audio directives, renders HTML via marked.js, and
 * injects the result into the content container.
 *
 * Posts are loaded in batches defined by {@link POSTS_PER_PAGE}; a
 * "load more" button appends further batches on demand. Each article
 * gets a slug-based `id` so it can be deep-linked via `blog.html#slug`
 * and fades in via IntersectionObserver as it enters the viewport.
 *
 * Network or parsing failures are caught and surfaced as an inline
 * error message rather than left as an unhandled rejection.
 *
 * @async
 */
async function loadPosts() {
  content.innerHTML = "<h1>Blog</h1>";

  try {
    const indexRes = await fetch("posts/index.json");
    if (!indexRes.ok) {
      throw new Error(`Yazı listesi yüklenemedi (HTTP ${indexRes.status})`);
    }
    const files = await indexRes.json();

    const posts = [];
    for (const file of files) {
      const postRes = await fetch(`posts/${file}`);
      if (!postRes.ok) {
        throw new Error(`"${file}" yüklenemedi (HTTP ${postRes.status})`);
      }
      const text = await postRes.text();
      const { meta, body } = parseFrontmatter(text);
      const slug = meta.title ? slugify(meta.title) : file.replace(/\.md$/, "");

      let postHtml = `<a href="#${slug}" class="post-permalink" aria-label="Bu yazının bağlantısı">`;
      if (meta.date) {
        postHtml += `<time datetime="${meta.date}">${formatDate(meta.date)}</time>`;
      }
      postHtml += `</a>`;
      postHtml += demoteHeadings(marked.parse(processAudio(body)));

      posts.push({ slug, html: postHtml });
    }

    let shown = 0;

    /**
     * Renders the next batch of posts into the content container.
     */
    function showBatch() {
      const batch = posts.slice(shown, shown + POSTS_PER_PAGE);
      for (const post of batch) {
        const article = document.createElement("article");
        article.id = post.slug;
        article.className = "lazy-hidden";
        article.innerHTML = post.html;
        content.appendChild(article);
        lazyObserver.observe(article);
        initAudioPlayers(article);
      }
      shown += batch.length;

      const existingBtn = content.querySelector(".load-more-btn");
      if (existingBtn) existingBtn.remove();

      if (shown < posts.length) {
        const btn = document.createElement("button");
        btn.className = "load-more-btn";
        btn.textContent = "Daha Fazla";
        btn.addEventListener("click", showBatch);
        content.appendChild(btn);
      }
    }

    showBatch();

    if (location.hash) {
      const targetSlug = decodeURIComponent(location.hash.slice(1));
      const targetIndex = posts.findIndex((p) => p.slug === targetSlug);
      while (targetIndex >= shown && shown < posts.length) showBatch();

      const target = document.getElementById(targetSlug);
      if (target) {
        target.classList.replace("lazy-hidden", "lazy-visible");
        lazyObserver.unobserve(target);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        const heading = target.querySelector("h2");
        if (heading) document.title = `${heading.textContent} — Neredesin Co?`;
      }
    }
  } catch (err) {
    console.error(err);
    const notice = document.createElement("p");
    notice.className = "load-error";
    notice.textContent =
      "Yazılar yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.";
    content.appendChild(notice);
  }
}

loadPosts();
