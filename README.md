# Translatly

Private, fully local translation extension for Chromium-based browsers and Firefox.
Translates any language to any language using small neural models that run 100% in
your browser — no servers, no tracking, no data leaving your device.

## Features

- **Selection translation**: translate selected text on any page via a floating bubble.
- **Quick translations**: popup with instant translation between your default languages.
- **Full translator**: local new-tab workspace with history, settings, and default language controls.
- Small local models (ONNX, quantized) designed to work on machines with integrated
  GPUs and low VRAM. WASM by default, WebGPU as opt-in acceleration.

## Requirements

- Node.js >= 22
- pnpm >= 10

## Development

```sh
pnpm install          # install dependencies
pnpm dev              # dev mode with HMR (Chrome)
pnpm dev:firefox      # dev mode with HMR (Firefox)
pnpm build            # production build (Chrome MV3) -> .output/chrome-mv3
pnpm build:firefox    # production build (Firefox)   -> .output/firefox-mv3
pnpm zip              # package Chrome build for store upload
pnpm zip:firefox      # package Firefox build for store upload
pnpm check            # type-check Svelte + TypeScript
pnpm test:unit        # run unit tests with Vitest
pnpm test:e2e         # build Chrome extension and run Playwright smoke tests
```

The first e2e run may require the Playwright browser binary:

```sh
pnpm exec playwright install chromium
```

After `pnpm dev`, load the extension from `.output/chrome-mv3` (or let WXT open the
browser automatically).

## Project structure

```
src/
├─ entrypoints/        # extension entrypoints (background, content, popup, ...)
│  ├─ background.ts    # coordinator: queue, context menus, messaging
│  ├─ content/         # selection translation bubble (Shadow DOM)
│  ├─ popup/           # quick-translate popup (Svelte)
│  ├─ translator/      # full-page translation desk (Svelte)
│  └─ offscreen/       # Chromium engine host
└─ lib/                # engine, messaging, settings, and local history
public/
└─ icon/               # extension icons (placeholders for now)
```

## Conventions

- All repository artifacts (code, comments, commits, docs) are written in English.
- pnpm is the only package manager.
- See [AGENTS.md](./AGENTS.md) for architecture decisions and workflow.

## Privacy

All inference runs locally. The only network traffic is downloading translation
models (from Hugging Face) on demand, and only when the user requests a new
language pair. Translation history stays in local extension storage and is never synced.
