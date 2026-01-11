# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` defines the Chrome extension (MV3) entry points and permissions.
- `background/` contains the service worker (`background.js`) for lifecycle and download monitoring.
- `content/` hosts content scripts and injected helpers for Telegram Web (`content.js`, `telegram_download_helper.js`, `web_telegram_inject_for_download.js`).
- `popup/` contains the extension UI (`popup.html`, `popup.css`, `popup.js`).
- `_locales/` stores i18n strings per locale (e.g., `_locales/en/messages.json`).
- `images/` contains extension icons.
- `test_version_detection.html` is a lightweight manual test page for version detection logic.

## Build, Test, and Development Commands
This repository is a browser extension and does not use a build step.
- Load unpacked: `chrome://extensions` → enable Developer Mode → “Load unpacked” → select the repo root.
- Reload after changes: click the extension’s “Reload” button in `chrome://extensions`.
- Debug: use Chrome DevTools for the background service worker, popup, and content scripts.

## Coding Style & Naming Conventions
- Indentation: 4 spaces in JavaScript and CSS (match existing files).
- Naming: `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants where used.
- Keep user-facing strings in `_locales/*/messages.json` and access via the i18n API.
- Prefer small, targeted changes in content scripts to avoid breaking Telegram Web selectors.

## Testing Guidelines
- No automated test framework is configured.
- Manual checks: load the extension, open Telegram Web `/k` and `/a`, and verify download button injection and progress UI.
- Optional helper: open `test_version_detection.html` in a browser to validate version detection logic.

## Commit & Pull Request Guidelines
- Commit messages are short and imperative; type prefixes like `feat:` and `fix:` appear in history.
- PRs should include: a clear description, steps to verify (or “manual test only”), and screenshots/GIFs for popup/UI changes.
- Link relevant issues if applicable.

## Security & Configuration Tips
- Keep host permissions scoped to Telegram Web domains (see `manifest.json`).
- Avoid storing sensitive data; use `chrome.storage` only for user preferences (e.g., concurrency limit).
