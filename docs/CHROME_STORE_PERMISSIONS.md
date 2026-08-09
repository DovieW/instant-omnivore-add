# Chrome Web Store — Permissions & disclosure notes

This extension is called **Instant Omnivore Add**.

It saves either:
- the **hovered link**, or
- the **current tab** (if you are not hovering a link)

…to an Omnivore server via its GraphQL API, and it can optionally open (and optionally remove) the oldest item from a slot.

Below are the permissions declared in `manifest.json`, what we use them for, and what you’ll typically disclose in the Chrome Web Store listing.

> Note: Chrome Web Store UI wording changes over time. Use this as a plain-English explanation you can paste into the “Justification” fields.

---

## `storage`

### Why it’s needed
We store your settings:
- Omnivore API server URL
- Omnivore web app URL
- Omnivore API key / Authorization token
- Slot → label mappings
- Behavior toggles (open original vs reader, delete-on-open, close-tab-after-save)
- Excluded domains list

### What the user should understand
Your token is stored in Chrome **local** extension storage and is not placed in Chrome sync. Non-authentication settings can sync between browsers when Chrome sync is enabled.

---

## `alarms`

### Why it’s needed
We show a small badge indicator (✓ / !) after actions. MV3 service workers can sleep, so we use alarms to reliably clear the badge after a short delay.

### What the user should understand
This does not run long background jobs; it’s only used for short UI feedback cleanup.

---

## `tabs`

### Why it’s needed
We need to:
- detect the active tab (to know what to save when you’re not hovering a link)
- open a new tab (when pulling/opening the oldest Omnivore item)
- optionally close the current tab after saving the **current tab** (never when saving hovered links)

### What the user should understand
We only act when you trigger a keyboard shortcut (or open/pull behavior). We are not reading your browsing history.

---

## Optional `bookmarks`

### Why it’s needed
We provide an optional “Bookmark folder → Label” helper in the popup:
- you paste a **bookmarks folder path** (or folder ID)
- you choose an **Omnivore label**
- the extension reads bookmark URLs inside that folder and saves them to Omnivore in bulk

### What the user should understand
Chrome asks for this optional permission only when you click the **Add** button in the popup. We then read the folder you identify and use its bookmark URLs solely to send them to your configured Omnivore server.

---

## `scripting`

### Why it’s needed
Omnivore saving uses `savePage`, which is more reliable when we include the page HTML. We use scripting to capture `document.documentElement.outerHTML` from the current page.

### What the user should understand
This capture is only used to send the page content to **your configured Omnivore server** when saving the current tab.

---

## Host permissions: `<all_urls>`

### Why it’s needed
Two reasons:
1. **Content script hover detection:** We inject a lightweight content script on pages so we can detect which link you’re hovering.
2. **Saving pages/links:** We may fetch the hovered URL (or the current page) to get HTML content for `savePage`.

### What the user should understand
- The extension only uses this to support “hovered link” saving and to collect HTML for saving to Omnivore.
- Hover tracking does not start until the user accepts the in-extension data disclosure.
- The excluded domains feature is specifically to prevent accidental saving/closing on sites like Gmail or Google Search when you are **not** hovering a link.

---

## Data handling summary (plain-English)

- **What data is collected?**
  - The URL you save (hovered link or current tab)
  - Page title
  - For current-tab saves, the page’s HTML (best-effort) to improve Omnivore save reliability
  - Your Omnivore API token and server URLs (as settings)
  - Bookmark URLs/titles from a user-selected folder when bookmark import is requested
  - Omnivore library metadata when the user requests an export or opens a queued item

- **Where does it go?**
  - Sent only to the Omnivore server you configure (GraphQL endpoint `/api/graphql`).

- **When does it run?**
  - Hovered-link detection runs after affirmative consent so keyboard shortcuts know which link is under the pointer.
  - Page capture, bookmark reads, API requests, and exports run only after the corresponding user action.
