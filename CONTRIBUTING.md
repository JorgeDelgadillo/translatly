# Contributing to Translatly

Thanks for contributing to Translatly. The project is a single browser
extension built with WXT, Svelte 5, TypeScript, Transformers.js, and ONNX
Runtime Web.

## Before You Start

- Read the [README](./README.md) for the product scope and setup commands.
- Check existing issues and pull requests before starting a substantial change.
- For a security issue, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Local Setup

Requirements are Node.js 22 or newer and pnpm 10 or newer.

```sh
pnpm install
pnpm run setup:extension
```

Run Chromium development mode with `pnpm dev`, or Firefox development mode with
`pnpm dev:firefox`.

## Checks

Run the checks relevant to your change before opening a pull request:

```sh
pnpm check
pnpm test:unit
pnpm test:e2e
pnpm build
pnpm build:firefox
```

The real-model smoke test is optional and requires a graphical Chromium session
and network access to Hugging Face. See
[`docs/REAL-MODEL-SMOKE.md`](./docs/REAL-MODEL-SMOKE.md).

## Architecture Guidelines

- Keep translation text, history, and preferences on the user's device.
- Do not add telemetry, accounts, remote logging, or cloud translation.
- Do not load executable JavaScript, WebAssembly, or native code remotely.
- Keep browser APIs at extension boundaries and domain logic in `src/lib/`.
- Keep Chromium inference in the offscreen document and Firefox inference in the background page.
- Preserve accessible names, keyboard behavior, themes, localization, and reduced-motion support.
- Add tests for changes to messaging, storage, model lifecycle, or translation routing.

## Pull Requests

- Keep each pull request focused on one user-visible or maintenance outcome.
- Explain the behavior change and the verification you ran.
- Include screenshots for meaningful UI changes.
- Update public documentation when commands, permissions, supported languages, or user behavior change.
- Do not commit `.output`, `.wxt`, `public/ort`, downloaded models, test artifacts, credentials, or store secrets.
- Use a Conventional Commit-style title, for example `fix: recover interrupted model downloads`.

## Generated Assets

Run `pnpm run setup:extension` to generate local ORT assets and WXT types. These
files are intentionally ignored. Store listing assets in `store-assets/` are
reviewed source material and may be updated when the public UI changes.
