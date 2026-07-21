import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Translatly',
    description:
      'Translate any language to any language with local models. 100% private: translations never leave your device.',
  },
});
