<div align="center">

<img src="icons/icon128.png" alt="NoCtrl logo" width="112" height="112" />

# NoCtrl

**Keep your keyboard shortcuts, clipboard and right-click yours — not the page's.**

A Manifest V3 browser extension that intercepts the shortcuts and events you choose
*before* a web page's scripts can see them, and lets the browser do its normal thing.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-0d9488?style=flat-square)
![Chromium](https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave%20%C2%B7%20Opera-supported-0f172a?style=flat-square)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2dd4bf?style=flat-square)
![Network](https://img.shields.io/badge/network%20requests-none-64748b?style=flat-square)

</div>

---

## Why

Some pages try to take over the things your browser already does: they block <kbd>Ctrl</kbd>+<kbd>C</kbd>,
swallow right-clicks, cancel paste, or react to every focus change and text selection.
NoCtrl hides those events from the page so that scripts can't observe or cancel them,
while the browser keeps copying, pasting, searching and opening menus as usual.

## Highlights

- **Invisible to page scripts.** Listeners run on `window` in the capture phase at `document_start`, ahead of anything the page registers.
- **Browser behaviour stays intact.** NoCtrl calls `stopImmediatePropagation()` and `stopPropagation()`, but never `preventDefault()`.
- **Layout-independent.** Shortcuts are matched by `event.code`, so <kbd>Ctrl</kbd>+<kbd>C</kbd> works the same on English, Ukrainian or any other layout.
- **Your own shortcuts.** Record any key or combination (`Ctrl + S`, `Alt + K`, `Ctrl + Enter`, `F12`, even a lone modifier) right in the popup.
- **Per-site control.** Pause protection on a domain (subdomains included) or switch everything off globally.
- **Works in frames.** Runs in all frames, including `about:blank`, and hooks iframes added later.
- **Live feedback.** A badge on the toolbar icon and a log of blocked events for the current tab.
- **Light and dark theme** that follows your system.

## Install

NoCtrl isn't on a web store yet, so load it as an unpacked extension:

1. Clone or download this repository.
2. Open your browser's extensions page:
   `chrome://extensions` · `edge://extensions` · `brave://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.

To use it on local `file://` pages, also enable **Allow access to file URLs** in the extension's details.

## Usage

Click the toolbar icon to open the popup.

| Area | What it does |
| --- | --- |
| **Site card** | Shows whether the current site is protected. One button pauses or resumes protection for that domain and its subdomains. |
| **Shortcuts** | Chips for every protected shortcut. Click a chip to switch it off or on, `×` to remove it. |
| **Record** | Press *Record new shortcut*, then the keys. Or open *Pick manually* to choose modifiers and a key from a list. |
| **Extra protection** | Four switches, described below. |
| **Blocked on this tab** | The latest intercepted events, with a counter that also appears on the toolbar badge. |
| Header toggle | Turns NoCtrl off everywhere. The ↗ button opens the popup in its own tab. |

**Default shortcuts:** `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`, `Ctrl+F`, `Ctrl+Shift+I`, `F12`.

### Extra protection

| Switch | Events hidden from the page | Default |
| --- | --- | :---: |
| Clipboard | `copy`, `cut`, `paste`, `selectstart`, paste/cut `beforeinput` | on |
| Context menu | `contextmenu` and right-button `mousedown` / `mouseup` / `auxclick` | on |
| Page focus | `blur`, `focus`, `visibilitychange`, `mouseleave` on the window and document only | on |
| Selection change | `selectionchange` | off |

Focus and hover events of *individual elements* are never touched, so inputs and hover menus keep working.
`selectionchange` is off by default because rich-text editors rely on it.

## How it works

```text
 keypress ──▶ window (capture) ──▶ NoCtrl ──✖── page scripts never see it
                                      │
                                      └──▶ browser default action runs normally
```

1. `content.js` is injected at `document_start` into every frame and attaches capture-phase listeners to the window and document, plus any iframe that appears.
2. Only trusted events (`event.isTrusted`) that match an enabled shortcut or an enabled protection switch are stopped.
3. `background.js` (service worker) keeps per-tab counters and the toolbar badge, and seeds default settings on install.
4. Settings live in `chrome.storage.local` and are applied live in open tabs through `storage.onChanged`.

## Limitations

- Until saved settings load (a few milliseconds after a page starts), defaults apply, so protection is on briefly even on a paused site.
- Protecting the clipboard also hides `paste` from the page's own handlers. Editors that implement paste in JavaScript may need protection paused for that site.
- Browsers don't run extensions on internal pages such as `chrome://` or the Web Store.
- The popup interface is currently in Ukrainian.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and per-tab counters. |
| `tabs` | Read the active tab's URL for the per-site switch and toolbar badge. |
| `scripting` | Inject the content script into tabs that were already open at install time. |
| `<all_urls>` | Run on any site you choose to protect. |

## Privacy

NoCtrl makes no network requests, has no analytics and no remote code. Settings stay in `chrome.storage.local`; the blocked-event log is kept in `chrome.storage.session` and cleared when the browser closes.

## Responsible use

NoCtrl restores control over your own browser. Some services, exams and workplaces forbid hiding your activity from them; check the rules that apply to you before using it there.

## Project layout

```text
manifest.json     Extension manifest (MV3)
shared.js         Default settings, normalisation, domain matching (single source of truth)
content.js        Event interception on the page
background.js     Service worker: counters, badge, defaults
popup.html/css/js Popup interface
icons/            Logo sources (SVG) and PNG icons
tests/            Automated tests
test-page.html    Hostile test page with trap listeners
```

## Development

No build step and no runtime dependencies. Tests need Node.js 20 or newer:

```powershell
npm test
```

The suite runs `content.js` and `background.js` inside Node's `vm` with a faked browser environment, and checks `shared.js`, the manifest and the popup's markup against its script. It doesn't launch a real browser, so before a release also open `test-page.html` (a page full of key, clipboard and right-click traps) with the extension loaded.

## Contributing

Issues and pull requests are welcome. Please run `npm test` first and keep defaults in `shared.js` only.
