# Translatly Development Plan

## Product Scope

Translatly is a private, local-first browser extension for Chromium MV3 and
Firefox MV2. This repository remains a single WXT application with its existing
popup, selection bubble, full translator page, local engine, model manager, and
extension storage.

Additional clients, a monorepo migration, and a separate cross-platform core are
out of scope. Future work should improve the browser extension as one focused
product.

## Current Position

The extension implementation covers the original feature checkpoints through
distribution automation: local WASM inference, typed messaging, serial
queueing, cancellation, model management, language detection, history,
localization, themes, onboarding, accessibility, unit tests, Chromium smoke
tests, and Chrome/Firefox packaging.

The next focus is extension production hardening before store submission.

The current language scope is six curated languages. Direct OPUS-MT models cover
four directions; the remaining curated pairs use the larger NLLB fallback.
Expanding the registry is deferred until model size, quality, and download-time
tradeoffs are evaluated.

## Next Checkpoint

### Extension Production Hardening

Status: in progress.

Acceptance criteria:

- [x] User text is never written to URLs or diagnostic logs.
- [x] Persisted preferences and history reject malformed values and recover safely.
- [x] Selection-bubble request delivery and viewport positioning are reliable.
- [x] Translation and model lifecycle behavior has targeted unit coverage.
- [x] Chromium and Firefox builds are verified with release metadata and manifest
  checks.
- [x] Real-model smoke verification is documented without adding large model
  files to continuous integration.

Do not begin another product direction until this checkpoint is reviewed.
