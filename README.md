# instant-omnivore-add

Manifest V3 Chrome extension to instantly add links to an Omnivore library using keyboard shortcuts.

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

## Configure

Open the extension popup:

- **API server URL**: your Omnivore API base (the extension calls `/api/graphql`)
- **Web app URL**: used to open items in the reader (`/me/<slug>`)
- **API key / Authorization**: whatever you paste is sent as the `Authorization` header
- **Slot labels**: label name per number shortcut (optional)

If a label doesn’t exist, Omnivore will create it when saving.

## Keyboard shortcuts

Suggested defaults:

- Slot 1 → `Alt+1`
- Slot 2 → `Alt+2`

Pull+remove:

- Slot 1 → `Alt+Shift+1`
- Slot 2 → `Alt+Shift+2`

Slots 3–7 have no suggested default. Set them manually in:

- `chrome://extensions/shortcuts`
