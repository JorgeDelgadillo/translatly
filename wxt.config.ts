import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: ({ browser }) => ({
    build: {
      // Transformers.js is bundled as an IIFE for Firefox MV2. Its web build
      // intentionally falls back to an empty import.meta object in that format.
      rolldownOptions: {
        transform: {
          define: { 'import.meta': '{}' },
        },
      },
      // The Chromium offscreen engine is ~527 kB after minification; keep the
      // limit just above it so future unexpected growth remains visible.
      ...(browser === 'chrome' ? { chunkSizeWarningLimit: 600 } : {}),
    },
  }),
  hooks: {
    'entrypoints:found': (wxt, entrypoints) => {
      if (wxt.config.browser !== 'firefox') return;
      // Firefox hosts the engine in its background page and does not need the
      // Chromium-only offscreen document in the package.
      const offscreenIndex = entrypoints.findIndex(
        (entrypoint) => entrypoint.name === 'offscreen',
      );
      if (offscreenIndex !== -1) entrypoints.splice(offscreenIndex, 1);
    },
  },
  manifest: ({ browser, manifestVersion }) => {
    const name = 'Translatly';
    const description =
      'Translate curated languages with local models. 100% private: translations never leave your device.';
    // 'wasm-unsafe-eval' is required to instantiate the ONNX Runtime WASM
    // binaries inside extension pages.
    const csp = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";
    return {
      name,
      description,
      // The offscreen API only exists on Chromium. Firefox MV2 runs the
      // engine in the persistent background page instead.
      // `storage` holds the user's default language pair.
      // `contextMenus` enables the "Translate with Translatly" right-click menu.
      permissions:
        browser === 'firefox'
          ? ['storage', 'contextMenus']
          : ['offscreen', 'storage', 'contextMenus'],
      // Models are downloaded on demand from the Hugging Face CDN. This is
      // the only remote origin the extension ever talks to.
      // `<all_urls>` is required so the content script can run on any page
      // to detect text selection and show the translation bubble.
      host_permissions: ['https://huggingface.co/*', '<all_urls>'],
      content_security_policy:
        manifestVersion === 2 ? csp : { extension_pages: csp },
      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'translatly@jdelgadillo.dev',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : {}),
      // The full translator is also the browser's new-tab surface.
      chrome_url_overrides: {
        newtab: 'translator.html',
      },
    };
  },
});
