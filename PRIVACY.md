# Privacy Policy for Instant Omnivore Add

Effective date: August 9, 2026

Instant Omnivore Add is a browser client for an Omnivore server chosen and
configured by the user. Its single purpose is to let users save, label, open,
import, and export items in their own Omnivore library.

## Data the extension handles

After the user accepts the in-extension disclosure, the extension may handle:

- Hovered link URLs and titles, so a keyboard shortcut can save the link under
  the pointer. This information is kept temporarily in extension memory.
- The active tab URL and title when the user triggers a save shortcut.
- The active page HTML when the user triggers a current-page save and page HTML
  is needed by Omnivore's `savePage` operation.
- Bookmark URLs and titles from a folder selected by the user. Chrome asks for
  the optional `bookmarks` permission before the extension reads bookmarks.
- Omnivore library metadata returned by the user's server, including item IDs,
  URLs, titles, labels, state, and timestamps, when the user opens queued items,
  changes labels, or requests a JSON export.
- The Omnivore API and web server URLs entered by the user.
- The Omnivore API token entered by the user.
- Extension preferences, shortcut label mappings, excluded domains, consent
  status, and recent action status.

## How data is used

The extension uses this data only to provide its user-facing Omnivore features:

- save a hovered link or active page;
- create and apply Omnivore labels;
- open the oldest matching library item and optionally remove it;
- import a selected bookmark folder into an Omnivore label; and
- export Omnivore library metadata to a JSON file on the user's device.

The developer does not use the data for advertising, profiling, analytics,
credit decisions, or any unrelated purpose.

## Storage and retention

- The API token and consent record are stored in Chrome local extension storage
  on the user's device. The API token is not placed in Chrome sync storage.
- Server URLs, label mappings, import fields, and behavior preferences are
  stored in Chrome sync storage when Chrome sync is available.
- A recent action result may be stored briefly in Chrome local storage so the
  popup can show success or error feedback.
- Hovered link information is held only in memory and is replaced or cleared as
  the pointer and page state change.
- A requested library export is generated locally and downloaded as a JSON file
  chosen by the user.

Users can clear this data by removing the extension or clearing its extension
storage. Chrome controls the retention of settings copied through Chrome sync.

## Data transfer and sharing

Saved URLs, titles, page HTML, selected bookmark URLs, library requests, and the
API token are sent only to the Omnivore API server configured by the user. The
developer does not operate an intermediary service and does not receive this
data.

Non-authentication settings may be transferred by Chrome sync under the user's
Google Chrome account. The extension does not sell user data or transfer it to
advertisers, data brokers, or other third parties.

## Security

The extension uses the URL scheme selected by the user for their Omnivore
server. HTTPS is recommended. If a user intentionally configures an HTTP server,
the HTTP application traffic is not protected by TLS and should be used only on
a trusted private or otherwise encrypted network.

The extension includes all executable logic in its published package and does
not download or execute remote code.

## Chrome Web Store Limited Use

The use of information received from Chrome APIs adheres to the Chrome Web Store
User Data Policy, including the Limited Use requirements. Data access is limited
to what is necessary to provide the extension's disclosed single purpose and
user-facing features.

## Changes

Material changes to data handling will be disclosed in the extension before the
new handling begins, and this policy will be updated with a new effective date.

## Contact

Questions or privacy requests can be submitted through the public issue tracker:

<https://github.com/DovieW/instant-omnivore-add/issues>
