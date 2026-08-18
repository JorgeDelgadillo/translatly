# Changelog

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
