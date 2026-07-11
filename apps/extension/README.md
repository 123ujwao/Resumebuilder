# @resume-forge/extension

Manifest V3 Chrome extension for ResumeForge. Reuses `@resume-forge/core` for
the shared data model and (later) tailoring logic.

## What's here (Task 16.1)

- **manifest.json** (`public/manifest.json`) — Manifest V3 with a background
  service worker, a content script scoped to the supported job sites, and a
  popup action.
- **Background service worker** (`src/background/service-worker.ts`) — MV3
  lifecycle entry point.
- **Content script** (`src/content/content-script.ts`) — loads on supported
  posting pages and answers the typed `chrome.runtime` messages. JD extraction
  and autofill land in 16.2 / 16.3.
- **Popup** (`src/popup/`) — a light React UI that reads shared resume data from
  `chrome.storage.local` and shows whether a resume is available, with
  placeholders for "Tailor" and "Autofill".
- **Shared data layer** (`src/shared/`) — `storage.ts` wraps
  `chrome.storage.local` (Req 11.2) using `@resume-forge/core` types;
  `messages.ts` / `fields.ts` define the typed messaging contract (Req 11.1).

The extension **never** auto-submits an application (Req 11.6, enforced in 16.4).

## Data sharing (Req 11.2)

The extension reads/writes a shared snapshot in `chrome.storage.local` (scoped
to the same browser profile as the web app):

- `rf.resume_state` — the `PersistedResumeState` (versions + active selection +
  template) shape used by the web app.
- `rf.auth` — a minimal auth snapshot (`{ signedIn, email? }`), no tokens.

This task establishes the bridge and shape. Populating it from the web app can
be added later; today the extension reads whatever is present and offers typed
setters (used by tests and manual seeding).

## Build

```bash
npm run build --workspace @resume-forge/core   # produces core/dist (dependency)
npm run build --workspace @resume-forge/extension
```

The build type-checks, then produces `dist/` containing `manifest.json`,
`popup` HTML/JS, `background.js`, and `content.js`.

## Load the unpacked extension

1. Build the extension (see above) so `apps/extension/dist` exists.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select `apps/extension/dist`.
5. The ResumeForge icon appears in the toolbar; click it to open the popup.

Re-run the build after changes and click **Reload** on the extension card.

## Test

```bash
npm run test --workspace @resume-forge/extension
```

Unit tests cover the storage bridge (with a mocked `chrome.storage.local`) and
the message-contract helpers.
