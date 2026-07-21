# AGENTS.md

Project context and conventions for coding agents working on Translatly.

## What this is

Translatly is a cross-browser extension (Chromium MV3 + Firefox) for private,
fully local machine translation. Three UI surfaces:

1. **Selection bubble** (content script, Shadow DOM): translate selected text.
2. **Popup**: quick translations with default languages.
3. **Full page** (new tab): full translator with history, settings, model manager.

## Tech stack

- [WXT](https://wxt.dev) `^0.20` — extension framework (one codebase, Chrome MV3 + Firefox builds)
- Svelte 5 + TypeScript — UI
- pnpm — package manager (never use npm/yarn)
- Planned: `@huggingface/transformers` + ONNX Runtime Web for local inference
  (WASM SIMD/threads by default, WebGPU opt-in)

## Commands

All commands use pnpm:

```sh
pnpm install
pnpm dev / pnpm dev:firefox   # watch mode per browser
pnpm build / pnpm build:firefox
pnpm zip / pnpm zip:firefox   # store packages
pnpm check                    # svelte-check type checking
pnpm copy-ort-wasm            # copy ORT .wasm binaries into public/ort (runs on postinstall)
```

## Conventions (must follow)

- **Language**: every repository artifact is in English — code, comments, commit
  messages, docs, UI strings. (The maintainer's chat conversation may be in
  Spanish; repo content never is.)
- **Package manager**: pnpm only. Commit `pnpm-lock.yaml`. Build scripts that
  pnpm blocks must be allowlisted in `package.json > pnpm.onlyBuiltDependencies`.
- **Git workflow (checkpoint-driven)**: work happens in phases from the roadmap
  below. After each phase: create ONE commit (Conventional Commits style, e.g.
  `feat: add quick-translate popup`) and STOP for maintainer review. Never start
  the next phase without explicit approval. Never commit outside this flow
  without asking.
- Keep changes minimal and scoped to the current phase.

## Architecture decisions

- **Where models run**: Chrome MV3 service workers can be killed mid-inference,
  so the translation engine lives in an offscreen document (created on demand by
  the background coordinator). Firefox has no offscreen API, so the engine runs
  in the persistent background page (MV2) and answers requests directly.
- **Inference runtime**: `@huggingface/transformers` v4 + ONNX Runtime Web,
  WASM backend (SIMD, single thread — no SharedArrayBuffer in extension pages).
  The `.wasm` binaries are bundled into the extension (`public/ort`, copied from
  the nested `onnxruntime-web` dependency by `scripts/copy-ort-wasm.mjs`) because
  extensions must not load remote code. `wasmPaths` points at those files;
  models use `dtype: 'q8'`. WebGPU (`jsep` build) is a later-phase opt-in.
- **Message flow**: UI -> background (`translate:request`) -> engine host
  (`translate:request`). The engine owns a single `TranslationQueue` (serial
  execution, `AbortController` per job) and broadcasts lifecycle events:
  `translate:queued`, `translate:progress`, `translate:result`, `translate:error`.
  All messages are discriminated unions tagged by `type` and correlated by
  `requestId`. UI sends `translate:cancel` / `translate:cancelAll` to abort
  individual jobs or everything. On Chromium the background waits for an
  `engine:ready` handshake before forwarding the first request, avoiding a
  race with the offscreen document's load.
- **Model strategy (hybrid)**: per-pair OPUS-MT models (quantized int8, ~110 MB
  per direction) downloaded on demand by default; optional NLLB-200-distilled-600M
  (~900 MB) as fallback for uncovered pairs. Only one model kept in memory (LRU).
- **Content script UI**: Shadow DOM to isolate from page CSS.
- **Privacy**: no remote code; models are data fetched from Hugging Face CDN.
  Host permissions stay minimal (`huggingface.co` only).
- **Permissions**: added per phase as features land (`storage`, `contextMenus`,
  `unlimitedStorage`, `offscreen` on Chrome, ...). Do not add unused permissions.

## Roadmap (phase = commit + review stop)

1. ✅ Scaffold WXT + Svelte
2. ✅ Translation engine PoC (OPUS-MT en→es, WASM, download progress)
3. ✅ Typed messaging + translation queue with cancellation
4. Popup MVP (quick translation with default languages)
5. Selection bubble (Shadow DOM) + context menu
6. Full translator page + history + settings + default languages
7. Model manager + NLLB fallback + language auto-detection
8. Polish: i18n (en/es), theming, accessibility, onboarding
9. Tests: unit (Vitest) + e2e (Playwright)
10. Store release prep (Chrome Web Store + AMO)

## Notes

- Icons in `public/icon/` are WXT template placeholders; replace before release.
- WXT auto-imports extension APIs (`browser`, `defineBackground`,
  `defineContentScript`) in entrypoints — no explicit imports needed.
