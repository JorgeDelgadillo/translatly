import { browser } from 'wxt/browser';
import { startEngineHost } from '@/lib/engine/engine-host';

// This page only exists to host the translation engine in a DOM-capable,
// long-lived context. On Chromium MV3 the service worker can be killed at any
// time, which would abort model downloads and mid-inference work.
startEngineHost();

// Signal to the background that the engine host's message listener is in
// place. The background holds the first relayed request back until it sees
// this broadcast, closing a race with the offscreen document's load.
void browser.runtime.sendMessage({ type: 'engine:ready' });
