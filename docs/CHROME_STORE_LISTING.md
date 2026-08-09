# Chrome Web Store listing

Use this sheet when creating the Chrome Web Store item for Instant Omnivore Add.

## Product details

- **Name:** Instant Omnivore Add
- **Category:** Productivity
- **Language:** English
- **Homepage URL:** <https://github.com/DovieW/instant-omnivore-add>
- **Support URL:** <https://github.com/DovieW/instant-omnivore-add/issues>
- **Privacy policy URL:** <https://github.com/DovieW/instant-omnivore-add/blob/master/PRIVACY.md>

### Short description

Save links to Omnivore with label shortcuts, import bookmarks, pull queued items,
and export your library.

### Detailed description

Instant Omnivore Add is a keyboard-first companion for an Omnivore library that
you configure.

Use seven shortcut slots to save the link under your pointer or the active page
and apply an Omnivore label. Matching labels are created when needed. A second
set of shortcuts opens the oldest item from a slot, turning labeled Omnivore
items into lightweight reading queues.

The popup also lets you:

- configure your self-hosted or other Omnivore API and web URLs;
- import one selected Chrome bookmark folder into an Omnivore label;
- change labels on an Omnivore reader page;
- optionally remove an item after opening it; and
- export your Omnivore library metadata as JSON.

The extension connects directly to the Omnivore server you choose. The developer
does not operate an intermediary service and does not receive your browsing or
library data.

## Single purpose

Provide keyboard-first saving, labeling, queue access, bookmark import, and
library export for the user's configured Omnivore library.

## Permission justifications

### `storage`

Stores server URLs, label mappings, behavior settings, the local consent record,
and the API token. The API token stays in local extension storage and is not
stored in Chrome sync.

### `alarms`

Clears short-lived success and error badge feedback reliably after a command,
including when the Manifest V3 service worker sleeps.

### `tabs`

Reads the active tab when a save command is triggered, opens a queued Omnivore
item, and optionally closes the current tab after a successful current-page
save. It does not read browsing history.

### `scripting`

Captures the active page's HTML only when the user triggers a current-page save,
so the extension can call Omnivore's `savePage` operation.

### Optional `bookmarks`

Requested only when the user clicks the bookmark import button. Reads URLs and
titles from the folder the user identifies and sends those items to the user's
configured Omnivore server.

### Host permission `<all_urls>`

Required because shortcut-based hover detection must work on arbitrary pages and
because a user may save a link from any HTTP or HTTPS site. The content script
does not start hover tracking until the user accepts the in-extension data
disclosure. Page data is used only for a user-triggered Omnivore feature.

## Privacy-practices disclosures

Disclose at least these handled data categories in the Developer Dashboard,
using the dashboard's current labels:

- authentication information (the user-provided Omnivore API token);
- website content (page title and user-triggered page HTML capture);
- web browsing activity (active-page and hovered-link URLs/titles);
- user-provided content (bookmark selections, labels, preferences, and exported
  Omnivore library metadata).

Certify that:

- the data is used only for the extension's disclosed single purpose;
- the data is not sold or used for advertising, profiling, or credit decisions;
- the developer does not permit humans to read the data except where the Chrome
  Web Store Limited Use policy permits it; and
- the extension connects directly to the server selected by the user.

The dashboard answers, store description, in-product disclosure, and
[`PRIVACY.md`](../PRIVACY.md) must remain consistent.

## Reviewer instructions

1. Install the submitted ZIP and open the extension popup.
2. Confirm that the first screen discloses data handling and requires an explicit
   checkbox plus **Agree and continue** action.
3. Configure an Omnivore-compatible API base URL, web URL, and API token.
4. Configure a shortcut at `chrome://extensions/shortcuts`.
5. Hover an HTTP/HTTPS link and trigger the save shortcut, or trigger it without
   hovering to save the active page.
6. Bookmark access is optional and is requested only after clicking **Add** in
   the bookmark-import section.

The extension has no developer-operated backend. Testing API-dependent features
requires an Omnivore-compatible server and account supplied by the reviewer.
