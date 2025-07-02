# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome browser extension for downloading videos from Telegram Web. The extension adds download buttons to video messages in Telegram group chats and provides a popup interface to monitor download progress.

## Architecture

### Core Components

- **Background Script** (`background/background.js`): Service worker that handles installation events and download error monitoring
- **Content Scripts**: 
  - `content/content.js`: Main content script that injects download buttons and manages UI interactions
  - `content/telegram_download_helper.js`: Helper script injected into the page context for download functionality
- **Popup Interface** (`popup/`): Extension popup with tabs for download progress, settings, and about information
- **Localization** (`_locales/`): Internationalization support for English and Chinese

### Key Technical Details

**Manifest V3 Structure**: Uses service worker background script with content scripts and web accessible resources.

**Content Script Injection Pattern**: The main content script (`content.js`) injects the helper script (`telegram_download_helper.js`) into the page context to access Telegram's video resources that are restricted by CORS.

**Communication Flow**: 
1. Content script ↔ Background script via `chrome.runtime` messaging
2. Content script ↔ Helper script via `window.postMessage`
3. Popup ↔ Content script via `chrome.tabs.sendMessage`

**Download State Management**: Uses a global `window.downloadStates` Map to track download progress, with state broadcasting between scripts.

**Video Detection**: Monitors DOM for `video[src*="stream"]` elements and adds download buttons with hover visibility.

## Development Commands

Since this is a browser extension, there are no build commands. Development workflow:

1. **Load Extension**: Load unpacked extension in Chrome developer mode from the project root
2. **Test Changes**: Reload extension in Chrome after making changes
3. **Debug**: Use Chrome DevTools for popup, content scripts, and background script debugging

## Extension Permissions

- `activeTab`: Access current Telegram Web tab
- `downloads`: Trigger file downloads
- `storage`: Store user preferences (max concurrent downloads)
- Host permissions limited to `https://web.telegram.org/*` and `https://*.telegram.org/*`

## Internationalization

All user-facing strings use Chrome's i18n API with message keys defined in `_locales/[locale]/messages.json`. Helper script includes translation caching mechanism for page context access.

## State Management

Download states include: `pending`, `in_progress`, `completed`, `error`, `queued`, `starting`. The extension supports concurrent downloads with user-configurable limits (1-5 simultaneous downloads).