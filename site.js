/**
 * @fileoverview Site-wide bootstrap, loaded synchronously in <head> on
 * every page (classic script, no module semantics needed):
 *
 *   1. Theme — applies a persisted light/dark override before first paint
 *      to avoid a flash of the wrong theme, and wires the nav toggle.
 *   2. Service worker — registers sw.js for offline support.
 *   3. Analytics — optionally injects GoatCounter when a code is set.
 *
 * @version 2.0.0
 * @license MIT
 */

(function () {
  "use strict";

  /**
   * GoatCounter site code (e.g. "neredesin" for neredesin.goatcounter.com).
   * Leave empty to keep analytics fully disabled — nothing is injected
   * and no request leaves the page.
   * @type {string}
   */
  var GOATCOUNTER_CODE = "";

  /** localStorage key holding the manual theme override. */
  var THEME_KEY = "theme";

  var root = document.documentElement;

  /* ------------------------------------------------------------------
     Theme: apply the saved override immediately (pre-paint).
     ------------------------------------------------------------------ */

  var saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {
    /* Storage may be blocked; fall back to system preference. */
  }
  if (saved === "light" || saved === "dark") {
    root.setAttribute("data-theme", saved);
  }

  /**
   * Returns the currently effective theme, considering the manual
   * override first and the OS preference second.
   * @returns {"light"|"dark"}
   */
  function effectiveTheme() {
    var override = root.getAttribute("data-theme");
    if (override === "light" || override === "dark") return override;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  /**
   * Applies a theme override: sets the html attribute, persists it,
   * keeps the browser-chrome color in sync and notifies the giscus
   * iframe (if present) so comments follow the site theme.
   * @param {"light"|"dark"} theme
   */
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* Persisting is best-effort. */
    }

    var color = theme === "dark" ? "#000" : "#f5f5f7";
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute("content", color);
    });

    var giscus = document.querySelector("iframe.giscus-frame");
    if (giscus) {
      giscus.contentWindow.postMessage(
        { giscus: { setConfig: { theme: theme } } },
        "https://giscus.app",
      );
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector(".theme-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      applyTheme(effectiveTheme() === "dark" ? "light" : "dark");
    });
  });

  /* ------------------------------------------------------------------
     Service worker: offline support. Registered relative to this
     script's location so pages in subdirectories (en/) share the
     root-scoped worker.
     ------------------------------------------------------------------ */

  var scriptSrc = document.currentScript && document.currentScript.src;
  if ("serviceWorker" in navigator && scriptSrc) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register(new URL("sw.js", scriptSrc))
        .catch(function (err) {
          console.error("Service worker registration failed:", err);
        });
    });
  }

  /* ------------------------------------------------------------------
     Analytics: privacy-friendly, cookie-less GoatCounter — opt-in via
     GOATCOUNTER_CODE above. See README for setup.
     ------------------------------------------------------------------ */

  if (GOATCOUNTER_CODE) {
    var ga = document.createElement("script");
    ga.async = true;
    ga.src = "https://gc.zgo.at/count.js";
    ga.setAttribute(
      "data-goatcounter",
      "https://" + GOATCOUNTER_CODE + ".goatcounter.com/count",
    );
    document.head.appendChild(ga);
  }
})();
