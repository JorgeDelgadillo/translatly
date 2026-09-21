# Changelog

## [1.2.0] - 2026-09-21

### Security

- Model files download only from pinned Hugging Face commits and must match their recorded SHA-256.
- Network access is limited to `huggingface.co` and `*.hf.co`.
- Inline translation starts only from a real user gesture.
- Model management and cancelling every translation stay inside extension pages.
- Translation text is rejected above 5,000 characters.

### Fixed

- A model download is no longer cleared by a duplicate status response, so cancel works.
- Pipeline file checks use the pinned commit instead of `main`.
- The content script no longer crashes on pages that disallow Svelte's trusted-types policy.
- Restarting the service worker no longer reports a duplicate context-menu id.

### Changed

- Svelte 5.56.9, svelte-check 4.7.6, WXT 0.21.4, Vitest 4.1.11, and Playwright 1.62.1.
- GitHub Actions stay pinned to reviewed commits of their current major releases.

## [1.1.3] - 2026-08-18

### Added

- Translations preserve line breaks, blank lines, and paragraph structure; long lines are split at word boundaries.

### Fixed

- Inline translation now works on pages that block or intercept mouse events (for example LinkedIn), including content inside iframes.
- Right-click "Translate with Translatly" now always works: if the page's content script is not reachable, the selected text is read directly and opened in the full translator.

## [1.1.2] - 2026-08-18

### Changed

- Selecting text now shows a small translate icon instead of opening the translation bubble immediately; click the icon to translate, or use the right-click menu.

## [1.1.0] - 2026-08-17

### Added

- Local translation bubble for selected web-page text.
- Quick translation popup and full new-tab translation workspace.
- Local model manager with download progress, cancellation, deletion, and recovery.
- Chromium MV3 and Firefox MV2 packaging from the same codebase.
- Chrome Web Store listing assets and public privacy documentation.

### Changed

- Translation context is kept out of URLs and diagnostic output.
- Persisted settings and history validate malformed browser storage safely.
- Popup and translator surfaces share responsive light and dark visual themes.

### Security

- ONNX Runtime Web code and WebAssembly binaries ship inside the extension package.
- Remote access is limited to user-requested model data from Hugging Face.
