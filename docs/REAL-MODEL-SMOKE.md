# Real-model smoke test

The real-model smoke test downloads the direct English-to-Spanish OPUS-MT model
from Hugging Face, runs one translation in Chromium, and removes its temporary
browser profile afterward. It is intentionally not part of pull-request CI.

Requirements:

- Network access to the approved Hugging Face model origin.
- A graphical Chromium session.
- Playwright's Chromium browser installed.

Run it from the repository root:

```sh
pnpm run test:smoke:model
```

The default timeout is five minutes. Override it when a slower first download
needs more time:

```sh
REAL_MODEL_SMOKE_TIMEOUT_MS=900000 pnpm run test:smoke:model
```

The test uses a temporary profile and does not commit or retain model files.
