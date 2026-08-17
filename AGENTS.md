# AGENTS.md

Stable project context and engineering guidelines for agents working on
Translatly. This file is not a roadmap or status tracker.

## Sources of Truth

- `AGENTS.md` defines durable project conventions and architectural guardrails.
- `plan.md` defines project status, completed checkpoints, pending work, and the
  active implementation phase.
- `README.md` defines public development and usage documentation.
- The implementation and tests are authoritative when documentation disagrees
  with current behavior.

Do not add phase checklists, completion markers, current checkpoint hashes, or
temporary issue tracking to this file. Update `plan.md` when status changes.

## Product

Translatly is a private, local-first browser extension.

The current browser extension supports Chromium MV3 and Firefox MV2 from one
codebase. It has three user surfaces:

1. A selection bubble rendered by a content script inside Shadow DOM.
2. A popup for quick translation with saved default languages.
3. A full translator page with history, settings, onboarding, localization,
   themes, language detection, and model management.

This repository intentionally remains a single browser extension. Do not
introduce additional clients, a monorepo migration, or a separate shared core
without a new product decision recorded in `plan.md`.

## Privacy and Security Invariants

- Translation text, history, favorites, and preferences stay on the user's
  device.
- User text must never be sent to a translation API, analytics service, crash
  reporter, log collector, or URL.
- Network access is limited to explicit model-data downloads from approved
  origins.
- Do not load executable JavaScript, WASM, or native code from a remote source.
  Runtime code ships with the application; downloaded models are data.
- Do not add telemetry, accounts, cloud synchronization, or remote logging
  without an explicit product decision recorded in `plan.md`.
- Request the smallest browser permission that delivers the active feature. Do
  not add permissions for future work.
- Clipboard reads require an explicit user action. Shared text must not be placed
  in deep-link query strings or persistent logs.
- Credentials, signing keys, tokens, provisioning profiles, and store secrets
  must never be committed. CI secrets belong in the platform secret store.
- Treat downloaded model files as untrusted until expected size and integrity
  checks pass.

## Repository Conventions

- Every repository artifact is written in English: source, comments, UI strings,
  tests, documentation, and commit messages. Conversation with the maintainer may
  be in Spanish.
- Use pnpm only. Never use npm or Yarn for repository commands.
- Commit `pnpm-lock.yaml` whenever dependency resolution changes.
- Use strict TypeScript types and discriminated unions at process, platform, and
  persistence boundaries.
- Keep changes minimal and limited to the active phase.
- Preserve unrelated user changes in a dirty worktree.
- Do not perform speculative refactors, dependency upgrades, permission changes,
  or formatting outside the active scope.
- Prefer adapters and dependency injection where behavior differs by platform.
- Keep platform APIs out of shared domain modules.
- Add comments for architectural constraints and non-obvious workarounds, not for
  code that is already self-explanatory.

## Git and Checkpoint Workflow

Work is checkpoint-driven. `plan.md` identifies the active phase and its
acceptance criteria.

For every phase:

1. Read the complete active phase before changing files.
2. Implement only that phase.
3. Verify it in proportion to its risk, including all acceptance criteria.
4. Create exactly one Conventional Commit for the phase.
5. Stop and wait for maintainer review.

Never begin the next phase without explicit approval. Never combine multiple
phases in one commit. Never create extra cleanup or documentation commits outside
the checkpoint without asking.

Use Conventional Commit messages such as:

```text
fix: recover interrupted model downloads
feat: add extension translation history
test: add model lifecycle coverage
ci: validate Firefox release builds
docs: update project architecture guide
```

Before committing:

- Review the staged diff and confirm it contains only active-phase work.
- Run `git diff --check`.
- Run the relevant checks, tests, and builds.
- Confirm generated, downloaded, build, and secret files are not staged.

## Package and Script Security

- Installing dependencies must not execute a project `preinstall`, `install`,
  `postinstall`, or `prepare` lifecycle script.
- Project setup must be an explicit named command.
- Dependency build scripts blocked by pnpm must be reviewed and allowlisted by
  exact package name in `package.json > pnpm.onlyBuiltDependencies`.
- Do not broaden the allowlist to make an installation warning disappear.
- Pin the package manager through `packageManager` and use frozen lockfiles in CI.
- Review lifecycle scripts, native modules, binary downloads, permissions, and
  transitive impact before adding a dependency.
- Do not use runtime CDN imports or remote-code fallbacks.

## Current Extension Commands

All commands run with pnpm:

```sh
pnpm install
pnpm run setup:extension      # copy ORT artifacts and generate WXT types
pnpm run copy-ort-wasm        # copy ORT artifacts only
pnpm dev                      # Chromium watch mode
pnpm dev:firefox              # Firefox watch mode
pnpm build                    # Chromium production build
pnpm build:firefox            # Firefox production build
pnpm zip                      # Chromium package
pnpm zip:firefox              # Firefox package
pnpm check                    # Svelte and TypeScript diagnostics
pnpm test:unit                # Vitest unit suite
pnpm test:e2e                 # Chromium build and Playwright smoke suite
```

`pnpm install` does not run project setup. Commands that need public ORT assets
or generated WXT types invoke `pnpm run setup:extension` explicitly.

Keep repository commands at the extension root and use the scripts defined in
`package.json`.

## Browser Extension Architecture

### Framework and UI

- WXT `^0.20` provides one extension codebase for Chromium and Firefox.
- Svelte 5 and TypeScript implement extension UI surfaces.
- Use Svelte 5 runes and current project patterns for state and props.
- WXT auto-imports `browser`, `defineBackground`, and `defineContentScript` in
  entrypoints. Do not add redundant imports there.
- The selection bubble uses Shadow DOM to isolate it from host-page styles.

### Engine Hosting

- Chromium MV3 service workers can terminate during inference. Chromium runs the
  engine in an on-demand offscreen document.
- Firefox MV2 has no offscreen API. Firefox runs the engine in its persistent
  background page.
- Do not move long-running inference into the Chromium service worker.
- Chromium must wait for the `engine:ready` handshake before forwarding the
  first request to a newly created offscreen document.

### Messaging

The extension flow is:

```text
UI -> background coordinator -> engine host -> lifecycle broadcasts -> UI
```

- Messages are discriminated unions tagged by `type`.
- Translation requests and results are correlated by `requestId`.
- The queue executes inference serially and owns an `AbortController` per job.
- UIs cancel work with `translate:cancel` or `translate:cancelAll`.
- Lifecycle events are `translate:queued`, `translate:progress`,
  `translate:result`, and `translate:error`.
- Runtime broadcasts do not automatically reach content scripts. The background
  coordinator must forward engine events to tabs.

### Web Inference Runtime

- The extension uses `@huggingface/transformers` v4 and ONNX Runtime Web.
- ORT `.mjs` and `.wasm` artifacts are copied from the nested compatible
  `onnxruntime-web` dependency into `public/ort`.
- Extension packages must include all required ORT artifacts; they cannot fetch
  runtime code from a CDN.
- WASM uses SIMD with one thread because extension pages do not have the required
  cross-origin isolation for `SharedArrayBuffer`.
- Models use `dtype: 'int8'`.
- Keep `graphOptimizationLevel: 'basic'` unless the current OPUS/ORT optimizer
  incompatibility is proven fixed by tests with real models.
- Keep at most one model in memory and call `dispose()` on eviction when the
  runtime exposes it.

### Model Strategy

- Prefer direct, quantized OPUS-MT models for supported pairs.
- Use NLLB only as the optional fallback defined by the registry and product
  plan.
- The language and model registry is the source of truth for supported routes.
- Model download, status, deletion, and inference operations share the serial
  engine lane to avoid cache and memory races.
- Model progress must be observable and cancellation-safe.

### Browser Persistence

- Default languages and preferences use extension sync storage.
- Translation history uses extension local storage and never syncs.
- Validate persisted values before use and fall back to safe defaults.
- Keep storage migrations backward-compatible when stored shapes change.

## Extension Scope

Keep language routing, model descriptors, detection, queueing, messaging, and
persistence adapters inside the extension architecture until a concrete browser
platform need requires a new boundary. Do not extract speculative cross-platform
abstractions.

Changes to shared public contracts must be verified against every consumer in
the same phase. Do not expose browser wire messages as the universal domain API;
map them at the extension boundary.

## Design and Accessibility

- Preserve the Translatly visual identity rather than copying another product's
  branding or proprietary assets.
- Current Translatly anchors are warm sand `#f2eee4`, ink `#112337`, coral
  `#ed7259`, and dark background `#101a24`.
- Support system, light, and dark appearance.
- All interactive controls require accessible names, states, focus behavior, and
  adequate touch/click targets.
- Support screen readers, keyboard navigation where applicable, scalable text,
  high contrast, and reduced motion.
- Do not communicate status or errors through color alone.

## Testing and Verification

Choose verification based on the affected boundary:

- **Domain:** unit tests for success, invalid input, cancellation, and
  failure paths.
- **Storage:** defaults, validation, migrations, persistence, limits, deletion,
  and corruption recovery.
- **Messaging:** type guards, request correlation, forwarding, lifecycle order,
  and disconnected receivers.
- **Inference:** cached/offline behavior, progress, cancellation, model switching,
  deletion, and real-model smoke tests.
- **UI:** component states, keyboard and screen-reader behavior, themes,
  localization, empty states, errors, and recovery actions.
- **Extension integration:** Chrome and Firefox builds plus relevant Playwright
  scenarios.
- **Release:** version/tag consistency, manifests, signing, artifact names,
  checksums, and release-only triggers.

Tests that download large production models should not run on every pull request.
Use deterministic fixtures in automated CI and keep documented real-device model
checks as release gates.

## CI and Release Rules

- Pull requests and pushes to `main` run checks and tests; they do not create
  public release packages.
- Extension packages are generated only by the extension release workflow.
- Required checks must pass before packaging starts.
- A failed build must not publish partial or misleading release assets.
- Store submission is always a separate, explicitly approved action.

## Documentation Rules

- Keep `README.md` focused on public setup and usage.
- Keep `AGENTS.md` focused on stable context and engineering rules.
- Keep roadmap state, phase acceptance criteria, experiment gates, and deferred
  work in `plan.md`.
- Update architecture documentation in the same phase that changes the
  architecture.
- Remove obsolete debugging instructions after the issue is resolved.
- Document security-sensitive exceptions, package script allowlists, permissions,
  release secrets, and native configuration changes.

## Practical Notes

- Generated WXT types, public ORT copies, build outputs, downloaded models, test
  artifacts, and signing files must remain untracked unless a phase explicitly
  defines a reviewed exception.
- WXT entrypoint behavior can differ during pre-rendering; browser-only UI may
  need lazy loading.
- Browser service workers and interrupted model downloads are expected lifecycle
  conditions and must be handled as normal recoverable states.
- Placeholder release assets must not be treated as final store assets.
