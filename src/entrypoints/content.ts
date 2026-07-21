export default defineContentScript({
  matches: ['*://*.google.com/*'],
  main() {
    // Selection translation bubble will be implemented in a later phase.
  },
});
