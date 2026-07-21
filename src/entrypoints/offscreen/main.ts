import { startEngineHost } from '@/lib/engine/engine-host';

// This page only exists to host the translation engine in a DOM-capable,
// long-lived context. On Chromium MV3 the service worker can be killed at any
// time, which would abort model downloads and mid-inference work.
startEngineHost();
