let lastGoodHover = null;

let lastSentUrl = null;
let lastSentAt = 0;
const HOVER_SEND_MIN_INTERVAL_MS = 200;

function sendHoverClear(reason) {
  const now = Date.now();

  // Avoid spamming the service worker.
  if (now - lastSentAt < HOVER_SEND_MIN_INTERVAL_MS) return;

  // Only send a clear if we previously sent a URL.
  if (!lastSentUrl) return;

  lastSentUrl = null;
  lastSentAt = now;

  try {
    chrome.runtime.sendMessage({
      type: "instant-omnivore:hoverClear",
      ts: now,
      reason: typeof reason === "string" ? reason : "",
    });
  } catch {
    // ignore
  }
}

function isProbablyUsefulUrl(url, rawHref) {
  if (!url || typeof url !== "string") return false;

  // Some sites (notably Gmail) can populate `a.href` without an `href` attribute,
  // so `getAttribute('href')` may be null/empty even when a real URL exists.
  // Prefer the raw attribute when present, but fall back to the resolved URL.
  const raw = (rawHref || url || "").trim().toLowerCase();
  if (!raw) return false;

  // Ignore JS pseudo-links and empty anchors.
  if (raw === "#" || raw.startsWith("javascript:") || raw.startsWith("void(") || raw.startsWith("about:")) {
    return false;
  }

  // Ignore same-page fragments where the raw href is only a fragment.
  if (raw.startsWith("#")) return false;

  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAnchorFromElement(el) {
  if (!el) return null;

  const a = el.closest?.("a[href]");
  if (!a) return null;

  const url = a.href;
  const rawHref = a.getAttribute("href");
  if (!isProbablyUsefulUrl(url, rawHref)) return null;

  const text = (a.getAttribute("title") || a.textContent || "").trim();

  return {
    url,
    title: text,
    ts: Date.now(),
  };
}

function getLiveHoveredAnchor() {
  try {
    const hovered = document.querySelectorAll(":hover");
    const el = hovered?.[hovered.length - 1];
    return normalizeAnchorFromElement(el);
  } catch {
    return null;
  }
}

function onPointerMove() {
  const live = getLiveHoveredAnchor();
  if (live) {
    lastGoodHover = live;

    // Push updates to the service worker so it can use hovered links even when
    // on-demand frame messaging is unreliable (e.g. Gmail iframes).
    const now = Date.now();
    const shouldSend = live.url && (live.url !== lastSentUrl || now - lastSentAt >= HOVER_SEND_MIN_INTERVAL_MS);

    if (shouldSend) {
      lastSentUrl = live.url;
      lastSentAt = now;
      try {
        chrome.runtime.sendMessage({
          type: "instant-omnivore:hoverUpdate",
          url: live.url,
          title: live.title,
          ts: live.ts,
        });
      } catch {
        // ignore
      }
    }
  } else {
    lastGoodHover = null;
    sendHoverClear("no-hovered-link");
  }
}

window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
window.addEventListener("mousemove", onPointerMove, { capture: true, passive: true });

window.addEventListener(
  "pointerleave",
  () => {
    lastGoodHover = null;
    sendHoverClear("pointerleave");
  },
  { capture: true, passive: true }
);

window.addEventListener(
  "mouseleave",
  () => {
    lastGoodHover = null;
    sendHoverClear("mouseleave");
  },
  { capture: true, passive: true }
);

window.addEventListener(
  "blur",
  () => {
    lastGoodHover = null;
    sendHoverClear("blur");
  },
  { capture: true, passive: true }
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.visibilityState !== "visible") {
      lastGoodHover = null;
      sendHoverClear("hidden");
    }
  },
  { capture: true, passive: true }
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "instant-omnivore:getHovered") {
    const live = getLiveHoveredAnchor();
    if (live) {
      lastGoodHover = live;
      sendResponse({ url: live.url, title: live.title });
      return;
    }

    // Important: do NOT respond with `null` (iframe race behavior).
    if (lastGoodHover && Date.now() - lastGoodHover.ts < 2500) {
      sendResponse({ url: lastGoodHover.url, title: lastGoodHover.title });
      return;
    }

    return;
  }
});
