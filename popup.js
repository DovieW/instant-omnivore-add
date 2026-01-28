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

const BOOKMARK_IMPORT_FOLDER_KEY = "instantOmnivore.bookmarkImportFolderPath.v1";
const BOOKMARK_IMPORT_LABEL_KEY = "instantOmnivore.bookmarkImportLabel.v1";

const DEFAULT_EXCLUDED_DOMAINS = "mail.google.com, www.google.com";

const LAST_OUTCOME_KEY = "instantOmnivore.lastOutcome.v1";

const SLOT_COUNT = 7;

const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const openShortcutsBtn = document.getElementById("openShortcuts");

const configAccordionEl = document.getElementById("configAccordion");

const apiServerUrlEl = document.getElementById("apiServerUrl");
const webServerUrlEl = document.getElementById("webServerUrl");
const apiKeyEl = document.getElementById("apiKey");
const openPulledInOriginalEl = document.getElementById("openPulledInOriginal");
const closeTabAfterSaveEl = document.getElementById("closeTabAfterSave");
const excludedDomainsEl = document.getElementById("excludedDomains");
const deleteOnOpenEl = document.getElementById("deleteOnOpen");

const bookmarkFolderPathEl = document.getElementById("bookmarkFolderPath");
const bookmarkImportLabelEl = document.getElementById("bookmarkImportLabel");
const importBookmarksBtn = document.getElementById("importBookmarks");

const inputs = Array.from({ length: SLOT_COUNT }, (_, i) => document.getElementById(`slot${i + 1}`));

let statusTimer = null;
function setStatus(text, { clearAfterMs = 1400 } = {}) {
  if (statusTimer) window.clearTimeout(statusTimer);
  statusEl.textContent = text;
  if (text && Number.isFinite(clearAfterMs) && clearAfterMs > 0) {
    statusTimer = window.setTimeout(() => (statusEl.textContent = ""), clearAfterMs);
  }
}

function normalizeLabels(raw) {
  if (!Array.isArray(raw)) return Array(SLOT_COUNT).fill("");
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const v = raw[i];
    return typeof v === "string" ? v.trim() : "";
  });
}

function readUI() {
  return inputs.map((i) => (i.value || "").trim());
}

function writeUI(values) {
  for (let i = 0; i < inputs.length; i++) {
    inputs[i].value = typeof values?.[i] === "string" ? values[i] : "";
  }
}

async function load() {
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
    BOOKMARK_IMPORT_FOLDER_KEY,
    BOOKMARK_IMPORT_LABEL_KEY,
  ]);

  const labels = normalizeLabels(out[LABELS_KEY] ?? Array(SLOT_COUNT).fill(""));
  const apiServerUrl = typeof out[API_SERVER_URL_KEY] === "string" ? out[API_SERVER_URL_KEY] : "";
  const webServerUrl = typeof out[WEB_SERVER_URL_KEY] === "string" ? out[WEB_SERVER_URL_KEY] : "";
  const apiKey = typeof out[API_KEY_KEY] === "string" ? out[API_KEY_KEY] : "";

  // Migration:
  // - New installs default to false (open reader).
  // - Existing installs that have OPEN_IN_READER_KEY keep their behavior by inverting.
  let openInOriginal = false;
  if (typeof out[OPEN_IN_ORIGINAL_KEY] === "boolean") {
    openInOriginal = out[OPEN_IN_ORIGINAL_KEY];
  } else if (typeof out[OPEN_IN_READER_KEY] === "boolean") {
    openInOriginal = !out[OPEN_IN_READER_KEY];
  }

  const deleteOnOpen = typeof out[DELETE_ON_OPEN_KEY] === "boolean" ? out[DELETE_ON_OPEN_KEY] : false;
  const closeTabAfterSave = typeof out[CLOSE_TAB_KEY] === "boolean" ? out[CLOSE_TAB_KEY] : false;
  const excludedDomains = typeof out[EXCLUDED_DOMAINS_KEY] === "string" ? out[EXCLUDED_DOMAINS_KEY] : DEFAULT_EXCLUDED_DOMAINS;
  const bookmarkFolderPath = typeof out[BOOKMARK_IMPORT_FOLDER_KEY] === "string" ? out[BOOKMARK_IMPORT_FOLDER_KEY] : "";
  const bookmarkImportLabel = typeof out[BOOKMARK_IMPORT_LABEL_KEY] === "string" ? out[BOOKMARK_IMPORT_LABEL_KEY] : "";

  writeUI(labels);
  apiServerUrlEl.value = apiServerUrl;
  webServerUrlEl.value = webServerUrl;
  apiKeyEl.value = apiKey;
  openPulledInOriginalEl.checked = Boolean(openInOriginal);
  closeTabAfterSaveEl.checked = Boolean(closeTabAfterSave);
  excludedDomainsEl.value = excludedDomains;
  deleteOnOpenEl.checked = Boolean(deleteOnOpen);

  if (bookmarkFolderPathEl) bookmarkFolderPathEl.value = bookmarkFolderPath;
  if (bookmarkImportLabelEl) bookmarkImportLabelEl.value = bookmarkImportLabel;

  // Keep the connection settings collapsed by default, but open it on brand-new installs
  // where none of the required config fields are filled out yet.
  if (configAccordionEl) {
    const isBlankConfig = !apiServerUrl && !webServerUrl && !apiKey;
    configAccordionEl.open = Boolean(isBlankConfig);
  }

  // Show recent action feedback (best-effort).
  try {
    const local = await chrome.storage.local.get({ [LAST_OUTCOME_KEY]: null });
    const last = local[LAST_OUTCOME_KEY];
    if (last && typeof last === "object") {
      if (last.type === "missing-config") {
        setStatus("⚠️ Set API server + key", { clearAfterMs: 4500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }
      if (last.type === "empty-slot") {
        const slotNumber = Number.isFinite(Number(last.slotIndex)) ? Number(last.slotIndex) + 1 : null;
        const suffix = slotNumber ? ` (slot ${slotNumber})` : "";
        setStatus(`⚠️ No matching item${suffix}`, { clearAfterMs: 4500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }
      if (last.type === "api-error") {
        setStatus("⛔ Omnivore API error", { clearAfterMs: 4500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }

      if (last.type === "excluded-tab") {
        setStatus("⛔ Blocked by exclusions", { clearAfterMs: 4500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }

      if (last.type === "unsupported-url") {
        setStatus("⚠️ Can only save http/https pages", { clearAfterMs: 6500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }

      if (last.type === "save-error") {
        const codes = Array.isArray(last.errorCodes) ? last.errorCodes.join(", ") : "";
        const msg = typeof last.message === "string" ? last.message : "";
        const detail = [codes, msg].filter(Boolean).join(" — ");
        setStatus(`⚠️ Save failed${detail ? ": " + detail : ""}`, { clearAfterMs: 6500 });
        await chrome.storage.local.remove(LAST_OUTCOME_KEY);
      }
    }
  } catch {
    // ignore
  }
}

async function save({ silent = false } = {}) {
  const labels = readUI();

  const openInOriginal = Boolean(openPulledInOriginalEl.checked);

  await chrome.storage.sync.set({
    [LABELS_KEY]: normalizeLabels(labels),
    [API_SERVER_URL_KEY]: (apiServerUrlEl.value || "").trim(),
    [WEB_SERVER_URL_KEY]: (webServerUrlEl.value || "").trim(),
    [API_KEY_KEY]: (apiKeyEl.value || "").trim(),
    // Write both keys so older versions stay coherent.
    [OPEN_IN_ORIGINAL_KEY]: openInOriginal,
    [OPEN_IN_READER_KEY]: !openInOriginal,
    [CLOSE_TAB_KEY]: Boolean(closeTabAfterSaveEl.checked),
    [EXCLUDED_DOMAINS_KEY]: (excludedDomainsEl.value || "").trim(),
    [DELETE_ON_OPEN_KEY]: Boolean(deleteOnOpenEl.checked),
    [BOOKMARK_IMPORT_FOLDER_KEY]: (bookmarkFolderPathEl?.value || "").trim(),
    [BOOKMARK_IMPORT_LABEL_KEY]: (bookmarkImportLabelEl?.value || "").trim(),
  });

  if (!silent) setStatus("Saved");
}

let debounceId = null;
function queueAutosave() {
  if (debounceId) window.clearTimeout(debounceId);
  debounceId = window.setTimeout(() => {
    void save();
  }, 450);
}

saveBtn.addEventListener("click", () => void save());

openShortcutsBtn.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  } catch {
    setStatus("Open chrome://extensions/shortcuts manually");
  }
});

for (const input of inputs) {
  input.addEventListener("input", queueAutosave);
}
apiServerUrlEl.addEventListener("input", queueAutosave);
webServerUrlEl.addEventListener("input", queueAutosave);
apiKeyEl.addEventListener("input", queueAutosave);
openPulledInOriginalEl.addEventListener("change", queueAutosave);
closeTabAfterSaveEl.addEventListener("change", queueAutosave);
excludedDomainsEl.addEventListener("input", queueAutosave);
deleteOnOpenEl.addEventListener("change", queueAutosave);

bookmarkFolderPathEl?.addEventListener("input", queueAutosave);
bookmarkImportLabelEl?.addEventListener("input", queueAutosave);

importBookmarksBtn?.addEventListener("click", async () => {
  const folderPath = (bookmarkFolderPathEl?.value || "").trim();
  const label = (bookmarkImportLabelEl?.value || "").trim();

  if (!folderPath || !label) {
    setStatus("⚠️ Enter folder path + label", { clearAfterMs: 4500 });
    return;
  }

  // Persist inputs (and any other changes) before running.
  await save({ silent: true });

  try {
    importBookmarksBtn.disabled = true;
    setStatus("Adding bookmarks…", { clearAfterMs: 0 });

    const res = await chrome.runtime.sendMessage({
      type: "instant-omnivore:importBookmarks",
      folderPath,
      label,
    });

    if (!res || typeof res !== "object") {
      setStatus("⛔ Import failed", { clearAfterMs: 6500 });
      return;
    }

    if (res.ok) {
      const added = Number.isFinite(Number(res.added)) ? Number(res.added) : 0;

      // Newer background returns attempted/failed/skippedUnsupported.
      const attempted = Number.isFinite(Number(res.attempted)) ? Number(res.attempted) : (Number.isFinite(Number(res.total)) ? Number(res.total) : 0);
      const failed = Number.isFinite(Number(res.failed)) ? Number(res.failed) : (Number.isFinite(Number(res.skipped)) ? Number(res.skipped) : 0);
      const skippedUnsupported = Number.isFinite(Number(res.skippedUnsupported)) ? Number(res.skippedUnsupported) : 0;

      const parts = [`✓ Added ${added}/${attempted || 0}`];
      if (failed) {
        const firstMsg = Array.isArray(res.errors) && res.errors[0] && typeof res.errors[0].message === "string" ? res.errors[0].message : "";
        parts.push(`failed ${failed}${firstMsg ? `: ${firstMsg}` : ""}`);
      }
      if (skippedUnsupported) parts.push(`skipped ${skippedUnsupported} non-web URLs`);

      setStatus(parts.join(" • "), { clearAfterMs: 9000 });
      return;
    }

    const reason = typeof res.error === "string" ? res.error : "unknown";
    setStatus(`⚠️ Import: ${reason}`, { clearAfterMs: 6500 });
  } catch (e) {
    setStatus("⛔ Import error", { clearAfterMs: 6500 });
    console.error("[instant-omnivore-add] importBookmarks failed", e);
  } finally {
    if (importBookmarksBtn) importBookmarksBtn.disabled = false;
  }
});

// Hide API key by default (password field), but reveal while focused.
apiKeyEl.addEventListener("focus", () => {
  apiKeyEl.type = "text";
});
apiKeyEl.addEventListener("blur", () => {
  apiKeyEl.type = "password";
});

void load();
