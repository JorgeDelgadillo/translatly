import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser, manifestVersion }) => {
    const name = 'Translatly';
    const description =
      'Translate any language to any language with local models. 100% private: translations never leave your device.';
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
      // The full translator is also the browser's new-tab surface.
      chrome_url_overrides: {
        newtab: 'translator.html',
      },
    };
  },
});
