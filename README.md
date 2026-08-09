# instant-omnivore-add

Manifest V3 Chrome extension to instantly add links to an Omnivore library using keyboard shortcuts.

[Download the latest release](https://github.com/DovieW/instant-omnivore-add/releases/latest) ·
[Privacy policy](./PRIVACY.md) ·
[Chrome Web Store listing sheet](./docs/CHROME_STORE_LISTING.md)

You configure **7 slots → 7 label names**. When you press a shortcut:

- If your mouse is hovering a link, the extension saves **that link**.
- Otherwise, it saves the **current tab**.

There are also **7 additional shortcuts** (one per slot) that:

- fetch the **oldest matching item** from Omnivore (defaults to inbox)
- open it (in the Omnivore reader if configured)
- remove it from Omnivore

## Install (Load unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder
5. Review and accept the in-extension data disclosure

## Configure

Open the extension popup:

- **API server URL**: your Omnivore API base (the extension calls `/api/graphql`)
- **Web app URL**: used to open items in the reader (`/me/<slug>`)
- **API key / Authorization**: whatever you paste is sent as the `Authorization` header
- **Slot labels**: label name per number shortcut (optional)

If a label doesn’t exist, Omnivore will create it when saving.

The API token is stored only in Chrome local extension storage. Other settings
may use Chrome sync. Bookmark permission is requested only when you use bookmark
folder import. See the [privacy policy](./PRIVACY.md) for the complete data flow.

## Package a release

Run:

```bash
./scripts/package-release.sh
```

The reviewed Chrome Web Store ZIP is written to `dist/` with `manifest.json` at
its root. The script prints the artifact's SHA-256 digest after validation.

## Keyboard shortcuts

Suggested defaults:

- Slot 1 → `Alt+1`
- Slot 2 → `Alt+2`

Pull+remove:

- Slot 1 → `Alt+Shift+1`
- Slot 2 → `Alt+Shift+2`

Slots 3–7 have no suggested default. Set them manually in:

- `chrome://extensions/shortcuts`
