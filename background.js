const LABELS_KEY = "instantOmnivore.labels.v1";
const API_SERVER_URL_KEY = "instantOmnivore.apiServerUrl.v1";
const WEB_SERVER_URL_KEY = "instantOmnivore.webServerUrl.v1";
const API_KEY_KEY = "instantOmnivore.apiKey.v1";
// Legacy: when true, open pulled items in Omnivore reader.
const OPEN_IN_READER_KEY = "instantOmnivore.openPulledInReader.v1";
// New: when true, open pulled items in the original article URL.
const OPEN_IN_ORIGINAL_KEY = "instantOmnivore.openPulledInOriginal.v1";
const DELETE_ON_OPEN_KEY = "instantOmnivore.deleteOnOpen.v1";
const CLOSE_TAB_KEY = "instantOmnivore.closeTabAfterSave.v1";
const EXCLUDED_DOMAINS_KEY = "instantOmnivore.excludedDomains.v1";

const DEFAULT_EXCLUDED_DOMAINS = "mail.google.com, www.google.com";

const LAST_OUTCOME_KEY = "instantOmnivore.lastOutcome.v1";

const SLOT_COUNT = 7;

const BADGE_CLEAR_ALARM_NAME = "instant-omnivore:clearBadge";
const BADGE_CLEAR_DELAY_MS = 1200;

// Tracks the most recently hovered link reported by any frame in a tab.
// Key: tabId, Value: { url, title, ts }
const lastHoveredByTab = new Map();
const HOVER_FRESH_MS = 1200;

// In-memory caches (MV3 workers can be suspended; we keep best-effort caches and reload on-demand).
let cachedLabels = Array(SLOT_COUNT).fill("");
let cachedApiServerUrl = "";
let cachedWebServerUrl = "";
let cachedApiKey = "";
// Default OFF: open in the Omnivore reader unless explicitly enabled.
let cachedOpenInOriginal = false;
let cachedDeleteOnOpen = false;
let cachedCloseTabAfterSave = false;
let cachedExcludedDomainsRaw = "";
let cachedExcludedDomains = [];
let settingsLoaded = false;
let settingsLoadPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLabels(raw) {
  if (!Array.isArray(raw)) return Array(SLOT_COUNT).fill("");
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const v = raw[i];
    return typeof v === "string" ? v.trim() : "";
  });
}

function normalizeUrl(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

function normalizeApiKey(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeExcludedDomainsRaw(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeDomainToken(token) {
  if (!token || typeof token !== "string") return null;
  let t = token.trim().toLowerCase();
  if (!t) return null;

  // Allow common patterns like "*.example.com" or ".example.com".
  t = t.replace(/^\*\./, "").replace(/^\.+/, "");

  // If user pasted a full URL, extract hostname.
  if (t.includes("://")) {
    try {
      const u = new URL(t);
      t = (u.hostname || "").toLowerCase();
    } catch {
      // fall through
    }
  }

  // Strip path/query/fragment and ports.
  t = t.split(/[/?#]/)[0];
  t = t.split(":")[0];
  t = t.replace(/^\.+/, "").trim();

  if (!t) return null;
  if (!/^[a-z0-9.-]+$/.test(t)) return null;
  if (t === "." || t === "-") return null;

  return t;
}

function parseExcludedDomains(raw) {
  if (!raw || typeof raw !== "string") return [];
  const parts = raw
    .split(",")
    .map((s) => normalizeDomainToken(s))
    .filter(Boolean);

  // De-dupe, keep stable order.
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function urlMatchesExcludedDomains(url, excludedDomains) {
  if (!url || typeof url !== "string") return false;
  if (!Array.isArray(excludedDomains) || excludedDomains.length === 0) return false;
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostname) return false;

  for (const d of excludedDomains) {
    if (!d) continue;
    if (hostname === d) return true;
    if (hostname.endsWith(`.${d}`)) return true;
  }
  return false;
}

async function recordLastOutcome(outcome) {
  try {
    await chrome.storage.local.set({
      [LAST_OUTCOME_KEY]: {
        ...outcome,
        ts: typeof outcome?.ts === "number" ? outcome.ts : Date.now(),
      },
    });
  } catch {
    // ignore
  }
}

async function ensureSettingsLoaded() {
  if (settingsLoaded) return;
  if (settingsLoadPromise) {
    await settingsLoadPromise;
    return;
  }

  settingsLoadPromise = (async () => {
    try {
      const out = await chrome.storage.sync.get([
        LABELS_KEY,
        API_SERVER_URL_KEY,
        WEB_SERVER_URL_KEY,
        API_KEY_KEY,
        OPEN_IN_ORIGINAL_KEY,
        OPEN_IN_READER_KEY,
        DELETE_ON_OPEN_KEY,
        CLOSE_TAB_KEY,
        EXCLUDED_DOMAINS_KEY,
      ]);

      cachedLabels = normalizeLabels(out[LABELS_KEY] ?? Array(SLOT_COUNT).fill(""));
      cachedApiServerUrl = normalizeUrl(out[API_SERVER_URL_KEY]);
      cachedWebServerUrl = normalizeUrl(out[WEB_SERVER_URL_KEY]);
      cachedApiKey = normalizeApiKey(out[API_KEY_KEY]);

      // Migration:
      // - New installs default to false (open reader).
      // - Existing installs that have OPEN_IN_READER_KEY keep their behavior by inverting.
      if (typeof out[OPEN_IN_ORIGINAL_KEY] === "boolean") {
        cachedOpenInOriginal = out[OPEN_IN_ORIGINAL_KEY];
      } else if (typeof out[OPEN_IN_READER_KEY] === "boolean") {
        cachedOpenInOriginal = !out[OPEN_IN_READER_KEY];
      } else {
        cachedOpenInOriginal = false;
      }

      cachedDeleteOnOpen = typeof out[DELETE_ON_OPEN_KEY] === "boolean" ? out[DELETE_ON_OPEN_KEY] : false;

      cachedCloseTabAfterSave = typeof out[CLOSE_TAB_KEY] === "boolean" ? out[CLOSE_TAB_KEY] : false;
      cachedExcludedDomainsRaw = normalizeExcludedDomainsRaw(out[EXCLUDED_DOMAINS_KEY] ?? DEFAULT_EXCLUDED_DOMAINS);
      cachedExcludedDomains = parseExcludedDomains(cachedExcludedDomainsRaw);
    } finally {
      settingsLoaded = true;
      settingsLoadPromise = null;
    }
  })();

  await settingsLoadPromise;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;

  if (changes?.[LABELS_KEY]) {
    cachedLabels = normalizeLabels(changes[LABELS_KEY].newValue);
  }
  if (changes?.[API_SERVER_URL_KEY]) {
    cachedApiServerUrl = normalizeUrl(changes[API_SERVER_URL_KEY].newValue);
  }
  if (changes?.[WEB_SERVER_URL_KEY]) {
    cachedWebServerUrl = normalizeUrl(changes[WEB_SERVER_URL_KEY].newValue);
  }
  if (changes?.[API_KEY_KEY]) {
    cachedApiKey = normalizeApiKey(changes[API_KEY_KEY].newValue);
  }
  if (changes?.[OPEN_IN_ORIGINAL_KEY]) {
    cachedOpenInOriginal = Boolean(changes[OPEN_IN_ORIGINAL_KEY].newValue);
  } else if (changes?.[OPEN_IN_READER_KEY]) {
    // Legacy updates: invert.
    cachedOpenInOriginal = !Boolean(changes[OPEN_IN_READER_KEY].newValue);
  }
  if (changes?.[DELETE_ON_OPEN_KEY]) {
    cachedDeleteOnOpen = Boolean(changes[DELETE_ON_OPEN_KEY].newValue);
  }

  if (changes?.[CLOSE_TAB_KEY]) {
    cachedCloseTabAfterSave = Boolean(changes[CLOSE_TAB_KEY].newValue);
  }

  if (changes?.[EXCLUDED_DOMAINS_KEY]) {
    cachedExcludedDomainsRaw = normalizeExcludedDomainsRaw(changes[EXCLUDED_DOMAINS_KEY].newValue);
    cachedExcludedDomains = parseExcludedDomains(cachedExcludedDomainsRaw);
  }

  settingsLoaded = true;
});

function scheduleBadgeClear() {
  try {
    chrome.alarms.create(BADGE_CLEAR_ALARM_NAME, { when: Date.now() + BADGE_CLEAR_DELAY_MS });
  } catch {
    // best-effort
  }
}

async function clearBadge() {
  try {
    await chrome.action.setBadgeText({ text: "" });
  } catch {
    // ignore
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== BADGE_CLEAR_ALARM_NAME) return;
  void clearBadge();
});

async function showOkBadge() {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
    await chrome.action.setBadgeText({ text: "✓" });
    scheduleBadgeClear();
  } catch {
    // ignore
  }
}

async function showWarnBadge() {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#ed6c02" });
    await chrome.action.setBadgeText({ text: "!" });
    scheduleBadgeClear();
  } catch {
    // ignore
  }
}

async function showErrorBadge() {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#c62828" });
    await chrome.action.setBadgeText({ text: "!" });
    scheduleBadgeClear();
  } catch {
    // ignore
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}

function isNewTabUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();

  if (u === "chrome://newtab/" || u === "chrome://newtab") return true;
  if (u === "chrome://new-tab-page/" || u === "chrome://new-tab-page") return true;
  if (u === "edge://newtab/" || u === "edge://newtab") return true;
  if (u === "about:newtab" || u === "about:home") return true;
  if (u === "about:blank") return true;

  return false;
}

async function getHoveredLinkFromTab(tabId) {
  try {
    const res = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "instant-omnivore:getHovered" }),
      sleep(175).then(() => null),
    ]);
    if (!res || typeof res !== "object") return null;
    if (!res.url || typeof res.url !== "string") return null;
    return {
      url: res.url,
      title: typeof res.title === "string" && res.title.trim() ? res.title.trim() : res.url,
    };
  } catch {
    return null;
  }
}

function getRecentHoveredLinkFromCache(tabId) {
  const v = lastHoveredByTab.get(tabId);
  if (!v || typeof v !== "object") return null;
  if (!v.url || typeof v.url !== "string") return null;
  const ts = Number(v.ts);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > HOVER_FRESH_MS) return null;

  return {
    url: v.url,
    title: typeof v.title === "string" && v.title.trim() ? v.title.trim() : v.url,
  };
}

function graphqlEndpoint(apiServerUrl) {
  if (!apiServerUrl) return "";
  if (apiServerUrl.endsWith("/api/graphql")) return apiServerUrl;
  return `${apiServerUrl}/api/graphql`;
}

function isHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function asBearerToken(raw) {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t) return "";
  if (/^bearer\s+/i.test(t)) return t;
  return `Bearer ${t}`;
}

function normalizeBookmarkPath(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/^\s*\/+/, "")
    .replace(/\/+\s*$/, "")
    .replace(/\s*\/\s*/g, "/");
}

function extractBookmarkFolderId(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Accept plain numeric IDs.
  if (/^\d+$/.test(s)) return s;

  // Accept Chrome bookmark manager URLs like: chrome://bookmarks/?id=1118
  // (and tolerate users pasting just "?id=1118" or "id=1118").
  try {
    if (/^chrome:\/\/bookmarks\b/i.test(s)) {
      const u = new URL(s);
      const id = u.searchParams.get("id");
      if (id && /^\d+$/.test(id)) return id;
    }
  } catch {
    // fall through to regex parsing
  }

  const m = /(?:\?|&|^)id=(\d+)(?:&|$)/i.exec(s);
  if (m?.[1]) return m[1];
  return null;
}

function splitBookmarkPath(path) {
  const clean = normalizeBookmarkPath(path);
  if (!clean) return [];
  return clean
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function bookmarkTitleMatches(a, b) {
  return String(a || "")
    .trim()
    .toLowerCase() === String(b || "").trim().toLowerCase();
}

function walkBookmarkNodes(children, segments) {
  // Walk a *path* through the tree: each segment must match a direct child
  // folder of the previous segment.
  let curChildren = Array.isArray(children) ? children : [];
  let node = null;

  for (const seg of segments) {
    const found = curChildren.find((n) => n && !n.url && bookmarkTitleMatches(n.title, seg));
    if (!found) return null;
    node = found;
    curChildren = Array.isArray(found.children) ? found.children : [];
  }

  return node;
}

function findFoldersByTitle(rootNode, title) {
  const out = [];
  const stack = [rootNode];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    if (!n.url && bookmarkTitleMatches(n.title, title)) out.push(n);
    if (Array.isArray(n.children)) {
      for (const c of n.children) stack.push(c);
    }
  }
  return out;
}

async function resolveBookmarkFolder({ folderPath }) {
  const folderId = extractBookmarkFolderId(folderPath);
  if (folderId) {
    try {
      const sub = await chrome.bookmarks.getSubTree(folderId);
      const node = sub?.[0] ?? null;
      if (node && !node.url) return { ok: true, node };
      return { ok: false, error: "folder-not-found" };
    } catch {
      return { ok: false, error: "folder-not-found" };
    }
  }

  const cleanPath = normalizeBookmarkPath(folderPath);
  if (!cleanPath) return { ok: false, error: "missing-folder-path" };

  const segments = splitBookmarkPath(cleanPath);
  if (!segments.length) return { ok: false, error: "missing-folder-path" };

  try {
    const tree = await chrome.bookmarks.getTree();
    const rootChildren = tree?.[0]?.children ?? [];

    // 1) Exact path from root children.
    const direct = walkBookmarkNodes(rootChildren, segments);
    if (direct && !direct.url) return { ok: true, node: direct };

    // 2) If the user omitted the root (e.g. "Reading/Inbox"), try each root folder.
    const candidates = [];
    for (const root of rootChildren) {
      if (!root || root.url || !Array.isArray(root.children)) continue;
      const match = walkBookmarkNodes(root.children, segments);
      if (match && !match.url) candidates.push(match);
    }
    if (candidates.length === 1) return { ok: true, node: candidates[0] };

    // 3) If it's a single segment, allow a unique folder match anywhere.
    if (segments.length === 1) {
      const matches = findFoldersByTitle(tree?.[0], segments[0]);
      if (matches.length === 1) return { ok: true, node: matches[0] };
    }

    return { ok: false, error: "folder-not-found" };
  } catch (e) {
    console.error("[instant-omnivore-add] resolveBookmarkFolder failed", e);
    return { ok: false, error: "bookmarks-unavailable" };
  }
}

function collectBookmarkUrls(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    if (typeof n.url === "string" && n.url) {
      out.push({ url: n.url, title: typeof n.title === "string" ? n.title : "" });
      continue;
    }
    if (Array.isArray(n.children)) {
      for (const c of n.children) stack.push(c);
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchPageHtml(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      credentials: "include",
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) return null;

    // If the server provides a content-type and it's not HTML, bail.
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const text = await res.text();
    return typeof text === "string" && text ? text : null;
  } catch {
    return null;
  }
}

async function captureTabOuterHtml(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          return document?.documentElement?.outerHTML || "";
        } catch {
          return "";
        }
      },
    });
    const v = results?.[0]?.result;
    if (typeof v === "string" && v.trim()) return v;
    return null;
  } catch {
    return null;
  }
}

function newClientRequestId() {
  // Omnivore's own extension uses UUIDs.
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  // Fallback: still unique enough.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function omnivoreGraphQL({ apiServerUrl, apiKey, query, variables }) {
  const endpoint = graphqlEndpoint(apiServerUrl);
  if (!endpoint || !apiKey) {
    return { ok: false, error: "missing-config" };
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: apiKey,
    "X-OmnivoreClient": "instant-omnivore-add",
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      mode: "cors",
      credentials: "include",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (Array.isArray(json?.errors) && json.errors.map((e) => e?.message).filter(Boolean).join("; ")) ||
        (typeof json?.message === "string" ? json.message : "") ||
        `HTTP ${res.status}`;
      return { ok: false, error: "http", status: res.status, message: msg, json };
    }

    if (json?.errors?.length) {
      const msg = Array.isArray(json?.errors) ? json.errors.map((e) => e?.message).filter(Boolean).join("; ") : "";
      return { ok: false, error: "graphql", message: msg || "GraphQL error", json };
    }

    return { ok: true, data: json?.data ?? null, raw: json };
  } catch (e) {
    return { ok: false, error: "network", detail: String(e?.message || e) };
  }
}

const MUTATION_SAVE_URL = `
mutation SaveUrl($input: SaveUrlInput!) {
  saveUrl(input: $input) {
    __typename
    ... on SaveSuccess { clientRequestId url }
    ... on SaveError { errorCodes message }
  }
}
`;

// The official Omnivore browser extension uses savePage (not saveUrl) and sends
// the page HTML as originalContent. This appears to be more reliable than
// saveUrl across deployments.
const MUTATION_SAVE_PAGE = `
mutation SavePage($input: SavePageInput!) {
  savePage(input: $input) {
    __typename
    ... on SaveSuccess { clientRequestId url }
    ... on SaveError { errorCodes message }
  }
}
`;

async function savePageToOmnivoreForUrl({ url, title, label, source = "bookmark-import" }) {
  await ensureSettingsLoaded();

  if (!cachedApiServerUrl || !cachedApiKey) {
    return { ok: false, error: "missing-config" };
  }

  if (!isHttpUrl(url)) {
    return { ok: false, error: "unsupported-url" };
  }

  const cleanTitle = (title || "").trim() || url;

  // Best-effort: fetch HTML in the background. If it fails (CORS, blocked, non-HTML),
  // still send a minimal HTML shell.
  let originalContent = await fetchPageHtml(url);
  if (!originalContent) {
    originalContent = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      cleanTitle
    )}</title></head><body></body></html>`;
  }

  const clientRequestId = newClientRequestId();
  const input = {
    clientRequestId,
    source,
    url,
    title: cleanTitle,
    originalContent,
    ...(label ? { labels: [{ name: label }] } : {}),
  };

  const tryOnce = async (apiKey) =>
    omnivoreGraphQL({
      apiServerUrl: cachedApiServerUrl,
      apiKey,
      query: MUTATION_SAVE_PAGE,
      variables: { input },
    });

  let result = await tryOnce(cachedApiKey);
  if (!result.ok) return result;

  const saveResult = result.data?.savePage ?? null;
  const typename = saveResult?.__typename;

  if (typename === "SaveSuccess") return { ok: true };

  if (typename === "SaveError") {
    const errorCodes = Array.isArray(saveResult?.errorCodes) ? saveResult.errorCodes : [];
    const message = typeof saveResult?.message === "string" ? saveResult.message : "";
    return { ok: false, error: "save-error", errorCodes, message };
  }

  return { ok: false, error: "api-error", data: result.data, raw: result.raw };
}

async function saveUrlToOmnivore({ url, title, label }) {
  await ensureSettingsLoaded();

  if (!cachedApiServerUrl || !cachedApiKey) {
    return { ok: false, error: "missing-config" };
  }

  if (!isHttpUrl(url)) {
    return { ok: false, error: "unsupported-url" };
  }

  const clientRequestId = newClientRequestId();
  const input = {
    clientRequestId,
    source: "bookmark-import",
    url,
    title: (title || "").trim() || url,
    ...(label ? { labels: [{ name: label }] } : {}),
  };

  const tryOnce = async (apiKey) =>
    omnivoreGraphQL({
      apiServerUrl: cachedApiServerUrl,
      apiKey,
      query: MUTATION_SAVE_URL,
      variables: { input },
    });

  let result = await tryOnce(cachedApiKey);
  if (!result.ok) {
    // Some deployments occasionally return transient 5xx/GraphQL errors.
    // A single retry makes bulk imports much less flaky.
    const isRetryable =
      result.error === "network" ||
      result.error === "graphql" ||
      (result.error === "http" && Number(result.status) >= 500);

    if (isRetryable) {
      await sleep(220);
      result = await tryOnce(cachedApiKey);
    }

    if (!result.ok) return result;
  }

  const saveResult = result.data?.saveUrl ?? null;
  const typename = saveResult?.__typename;

  if (typename === "SaveSuccess") {
    return { ok: true };
  }

  if (typename === "SaveError") {
    const errorCodes = Array.isArray(saveResult?.errorCodes) ? saveResult.errorCodes : [];
    const message = typeof saveResult?.message === "string" ? saveResult.message : "";

    const shouldTryBearerFallback =
      !/^bearer\s+/i.test(cachedApiKey) && (errorCodes.includes("UNAUTHORIZED") || errorCodes.includes("UNKNOWN"));

    if (shouldTryBearerFallback) {
      const bearerKey = asBearerToken(cachedApiKey);
      if (bearerKey && bearerKey !== cachedApiKey) {
        const retry = await tryOnce(bearerKey);
        if (retry.ok) {
          const retrySave = retry.data?.saveUrl;
          if (retrySave?.__typename === "SaveSuccess") {
            console.info("[instant-omnivore-add] SaveUrl succeeded after Bearer fallback");
            return { ok: true };
          }
        }
      }
    }

    return { ok: false, error: "save-error", errorCodes, message };
  }

  return { ok: false, error: "api-error", data: result.data, raw: result.raw };
}

async function saveBookmarkToOmnivorePreferUrl({ url, title, label }) {
  // Prefer saveUrl for speed during imports, but fall back to savePage for reliability.
  // We only do the heavier savePage path when saveUrl fails.
  const r = await saveUrlToOmnivore({ url, title, label });
  if (r.ok) return r;

  const msg = typeof r.message === "string" ? r.message : "";
  const shouldFallback =
    r.error === "graphql" ||
    r.error === "network" ||
    (r.error === "http" && Number(r.status) >= 500) ||
    /unexpected server error/i.test(msg);

  if (!shouldFallback) return r;

  const fallback = await savePageToOmnivoreForUrl({ url, title, label, source: "bookmark-import" });
  if (fallback.ok) {
    console.info("[instant-omnivore-add] savePage fallback succeeded for import", url);
    return fallback;
  }

  // Return the fallback result only if it contains more useful information; otherwise keep original.
  const fbMsg = typeof fallback.message === "string" ? fallback.message : "";
  if (fbMsg && fbMsg !== msg) return fallback;
  return r;
}

function describeImportFailure(r) {
  if (!r || typeof r !== "object") return "unknown";
  if (r.error === "graphql" || r.error === "http") {
    const msg = typeof r.message === "string" ? r.message.trim() : "";
    return msg || r.error;
  }
  if (r.error === "save-error") {
    const codes = Array.isArray(r.errorCodes) ? r.errorCodes.filter(Boolean).join(", ") : "";
    const msg = typeof r.message === "string" ? r.message.trim() : "";
    return [codes, msg].filter(Boolean).join(" — ") || "save-error";
  }
  if (typeof r.error === "string") return r.error;
  return "unknown";
}

async function importBookmarksFromFolder({ folderPath, label }) {
  await ensureSettingsLoaded();

  if (!cachedApiServerUrl || !cachedApiKey) {
    return { ok: false, error: "missing-config" };
  }

  const cleanLabel = typeof label === "string" ? label.trim() : "";
  if (!cleanLabel) return { ok: false, error: "missing-label" };

  const folderRes = await resolveBookmarkFolder({ folderPath });
  if (!folderRes.ok) return folderRes;

  let subtree = null;
  try {
    const sub = await chrome.bookmarks.getSubTree(folderRes.node.id);
    subtree = sub?.[0] ?? folderRes.node;
  } catch {
    subtree = folderRes.node;
  }

  const collected = collectBookmarkUrls(subtree);
  const attemptedItems = collected.filter((b) => isHttpUrl(b.url));
  const skippedUnsupported = collected.length - attemptedItems.length;

  const attempted = attemptedItems.length;
  let added = 0;
  let failed = 0;
  const errors = [];

  for (const b of attemptedItems) {
    const r = await saveBookmarkToOmnivorePreferUrl({ url: b.url, title: b.title, label: cleanLabel });
    if (r.ok) {
      added += 1;
    } else {
      failed += 1;
      if (errors.length < 5) {
        errors.push({ url: b.url, error: r.error, message: describeImportFailure(r) });
      }
    }

    // Tiny delay to be friendly to self-hosted deployments.
    await sleep(50);
  }

  if (attempted > 0 && failed === 0) {
    await showOkBadge();
  } else if (attempted > 0 && added > 0) {
    await showWarnBadge();
  }

  // For backwards compatibility with earlier popup code:
  // - total = attempted (http/https only)
  // - skipped = failed
  return {
    ok: true,
    totalFound: collected.length,
    skippedUnsupported,
    attempted,
    total: attempted,
    added,
    failed,
    skipped: failed,
    errors,
  };
}

const QUERY_SEARCH_ONE = `
query Search($after: String, $first: Int, $query: String) {
  search(first: $first, after: $after, query: $query, includeContent: false) {
    ... on SearchSuccess {
      edges {
        cursor
        node { id title slug url }
      }
      pageInfo { hasNextPage endCursor }
    }
    ... on SearchError { errorCodes }
  }
}
`;

const MUTATION_REMOVE_BOOKMARK = `
mutation SetBookmarkArticle($input: SetBookmarkArticleInput!) {
  setBookmarkArticle(input: $input) {
    ... on SetBookmarkArticleSuccess { bookmarkedArticle { id } }
    ... on SetBookmarkArticleError { errorCodes }
  }
}
`;

async function saveToSlot(slotIndex) {
  await ensureSettingsLoaded();

  const label = (cachedLabels[slotIndex] || "").trim();

  if (!cachedApiServerUrl || !cachedApiKey) {
    await recordLastOutcome({ type: "missing-config" });
    await showWarnBadge();
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) return;

  const hovered = getRecentHoveredLinkFromCache(tab.id) ?? (await getHoveredLinkFromTab(tab.id));
  const usedHoveredLink = Boolean(hovered?.url);

  // Exclusions only apply to the *current tab* save (not hovered links).
  // This matches instant-bookmark behavior: hovered links still save.
  if (!usedHoveredLink && tab.url && urlMatchesExcludedDomains(tab.url, cachedExcludedDomains)) {
    await recordLastOutcome({ type: "excluded-tab", url: tab.url });
    await showWarnBadge();
    return;
  }

  const url = usedHoveredLink ? hovered.url : tab.url;
  if (!url || typeof url !== "string") return;

  // Omnivore only supports real web URLs. Avoid sending chrome://, file://, etc.

  if (!isHttpUrl(url)) {
    await recordLastOutcome({ type: "unsupported-url", url });
    await showWarnBadge();
    return;
  }

  const clientRequestId = newClientRequestId();
  const title = usedHoveredLink
    ? hovered.title
    : (typeof tab.title === "string" && tab.title.trim() ? tab.title.trim() : url);

  // Use savePage (official extension behavior). We try to get HTML content either
  // from the tab itself or via background fetch.
  let originalContent = null;

  if (!usedHoveredLink) {
    originalContent = await captureTabOuterHtml(tab.id);
  }

  if (!originalContent) {
    originalContent = await fetchPageHtml(url);
  }

  if (!originalContent) {
    // Still send a minimal HTML shell so SavePageInput requirements are satisfied.
    originalContent = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body></body></html>`;
  }

  const input = {
    clientRequestId,
    source: "extension",
    url,
    title,
    originalContent,
    ...(label ? { labels: [{ name: label }] } : {}),
  };

  const tryOnce = async (apiKey) =>
    omnivoreGraphQL({
      apiServerUrl: cachedApiServerUrl,
      apiKey,
      query: MUTATION_SAVE_PAGE,
      variables: { input },
    });

  let result = await tryOnce(cachedApiKey);

  if (!result.ok) {
    await recordLastOutcome({ type: "api-error", error: result.error, detail: result });
    // Also log to help debugging via service worker console.
    console.error("[instant-omnivore-add] SavePage request failed", result);
    await showErrorBadge();
    return;
  }

  const saveResult = result.data?.savePage ?? null;
  const typename = saveResult?.__typename;

  if (typename === "SaveSuccess" && typeof saveResult?.url === "string" && saveResult.url) {
    await showOkBadge();

    // Optional behavior: close the tab after saving the *current tab*.
    // Never closes when saving a hovered link.
    if (!usedHoveredLink && cachedCloseTabAfterSave && tab?.id && !isNewTabUrl(tab.url)) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // best-effort
      }
    }

    return;
  }

  if (typename === "SaveError") {
    const errorCodes = Array.isArray(saveResult?.errorCodes) ? saveResult.errorCodes : [];
    const message = typeof saveResult?.message === "string" ? saveResult.message : "";

    // Heuristic: if auth might need a Bearer prefix, retry once.
    // Some Omnivore deployments accept raw tokens, others expect `Bearer <token>`.
    const shouldTryBearerFallback =
      !/^bearer\s+/i.test(cachedApiKey) &&
      (errorCodes.includes("UNAUTHORIZED") || errorCodes.includes("UNKNOWN"));

    if (shouldTryBearerFallback) {
      const bearerKey = asBearerToken(cachedApiKey);
      if (bearerKey && bearerKey !== cachedApiKey) {
        const retry = await tryOnce(bearerKey);
        if (retry.ok) {
          const retrySave = retry.data?.savePage;
          if (retrySave?.__typename === "SaveSuccess" && typeof retrySave?.url === "string" && retrySave.url) {
            console.info("[instant-omnivore-add] SavePage succeeded after Bearer fallback");
            await showOkBadge();
            return;
          }
        }
      }
    }

    await recordLastOutcome({
      type: "save-error",
      errorCodes,
      message,
      slotIndex,
      url,
      source: input.source,
    });
    console.warn("[instant-omnivore-add] SavePage returned SaveError", { errorCodes, message, slotIndex });
    await showWarnBadge();
    return;
  }

  // Unexpected shape: treat as error but keep response for debugging.
  await recordLastOutcome({ type: "api-error", error: "save-unknown", data: result.data, raw: result.raw });
  console.error("[instant-omnivore-add] SavePage unexpected response shape", result);
  await showErrorBadge();
}

function buildSearchQueryForSlot(label) {
  // Default behavior: pull from inbox.
  // Use the oldest saved first so it behaves like a queue.
  let q = "in:inbox sort:saved-ASC";
  const cleanLabel = (label || "").trim();
  if (cleanLabel) {
    q += ` label:${cleanLabel}`;
  }
  return q;
}

function buildOpenUrl({ webServerUrl, openInOriginal, slug, originalUrl }) {
  if (openInOriginal) return originalUrl;
  if (webServerUrl && slug) return `${webServerUrl}/me/${slug}`;
  return originalUrl;
}

async function openOldestThenRemove(slotIndex) {
  await ensureSettingsLoaded();

  if (!cachedApiServerUrl || !cachedApiKey) {
    await recordLastOutcome({ type: "missing-config" });
    await showWarnBadge();
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) return;

  const label = (cachedLabels[slotIndex] || "").trim();
  const queryString = buildSearchQueryForSlot(label);

  const searchRes = await omnivoreGraphQL({
    apiServerUrl: cachedApiServerUrl,
    apiKey: cachedApiKey,
    query: QUERY_SEARCH_ONE,
    variables: { first: 1, after: null, query: queryString },
  });

  if (!searchRes.ok) {
    await recordLastOutcome({ type: "api-error", error: searchRes.error });
    await showErrorBadge();
    return;
  }

  const edge = searchRes.data?.search?.edges?.[0] ?? null;
  const node = edge?.node ?? null;
  const articleId = node?.id;
  const slug = node?.slug;
  const originalUrl = node?.url;

  if (!articleId || !originalUrl) {
    await recordLastOutcome({ type: "empty-slot", slotIndex, query: queryString });
    await showWarnBadge();
    return;
  }

  const openUrl = buildOpenUrl({
    webServerUrl: cachedWebServerUrl,
    openInOriginal: cachedOpenInOriginal,
    slug,
    originalUrl,
  });

  try {
    if (isNewTabUrl(tab.url)) {
      await chrome.tabs.update(tab.id, { url: openUrl, active: true });
    } else {
      await chrome.tabs.create({
        url: openUrl,
        active: true,
        index: typeof tab.index === "number" ? tab.index + 1 : undefined,
        openerTabId: tab.id,
      });
    }
  } catch {
    await showErrorBadge();
    return;
  }

  // Default is OFF: only delete if the user explicitly enabled it.
  if (!cachedDeleteOnOpen) {
    await showOkBadge();
    return;
  }

  const deleteRes = await omnivoreGraphQL({
    apiServerUrl: cachedApiServerUrl,
    apiKey: cachedApiKey,
    query: MUTATION_REMOVE_BOOKMARK,
    variables: { input: { articleID: articleId, bookmark: false } },
  });

  if (!deleteRes.ok) {
    await recordLastOutcome({ type: "api-error", error: deleteRes.error });
    // Opening succeeded but deletion failed; still show a warning.
    await showWarnBadge();
    return;
  }

  const deletedId = deleteRes.data?.setBookmarkArticle?.bookmarkedArticle?.id;
  if (!deletedId) {
    await recordLastOutcome({ type: "api-error", error: "delete-failed", data: deleteRes.data });
    await showWarnBadge();
    return;
  }

  await showOkBadge();
}

async function handleCommand(command) {
  const saveMatch = /^save_to_label_(\d+)$/.exec(command);
  if (saveMatch) {
    const n = Number(saveMatch[1]);
    if (!Number.isFinite(n) || n < 1 || n > SLOT_COUNT) return;
    await saveToSlot(n - 1);
    return;
  }

  const openMatch = /^open_oldest_then_remove_(\d+)$/.exec(command);
  if (openMatch) {
    const n = Number(openMatch[1]);
    if (!Number.isFinite(n) || n < 1 || n > SLOT_COUNT) return;
    await openOldestThenRemove(n - 1);
    return;
  }
}

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "instant-omnivore:hoverUpdate") {
    const tabId = sender?.tab?.id;
    if (!Number.isFinite(tabId)) return;

    const url = typeof msg.url === "string" ? msg.url : "";
    if (!url) return;

    lastHoveredByTab.set(tabId, {
      url,
      title: typeof msg.title === "string" ? msg.title : "",
      ts: typeof msg.ts === "number" ? msg.ts : Date.now(),
    });
  }

  if (msg.type === "instant-omnivore:hoverClear") {
    const tabId = sender?.tab?.id;
    if (!Number.isFinite(tabId)) return;

    const ts = typeof msg.ts === "number" ? msg.ts : Date.now();
    const cur = lastHoveredByTab.get(tabId);

    if (!cur || typeof cur !== "object") {
      lastHoveredByTab.delete(tabId);
      return;
    }

    const curTs = Number(cur.ts);
    if (!Number.isFinite(curTs) || ts >= curTs) {
      lastHoveredByTab.delete(tabId);
    }
  }

  if (msg.type === "instant-omnivore:importBookmarks") {
    // Popup action: import all bookmarks in a folder to a single label.
    const folderPath = typeof msg.folderPath === "string" ? msg.folderPath : "";
    const label = typeof msg.label === "string" ? msg.label : "";
    (async () => {
      try {
        const res = await importBookmarksFromFolder({ folderPath, label });
        sendResponse(res);
      } catch (e) {
        console.error("[instant-omnivore-add] importBookmarks crashed", e);
        sendResponse({ ok: false, error: "exception" });
      }
    })();
    return true;
  }
});

void ensureSettingsLoaded();
