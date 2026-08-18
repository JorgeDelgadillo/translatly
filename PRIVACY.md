# Translatly Privacy Policy

Last updated: 2026-08-17

Translatly is a local-first browser extension for Chromium and Firefox. This
policy describes how Translatly handles information when you use the extension.

## Information Handled

When you explicitly request a translation, Translatly may handle:

- Text that you enter in the popup or full translator.
- Text that you select on a web page and send to the translation bubble.
- Translation results and history that you choose to save locally.

This information is processed on your device by bundled ONNX Runtime Web and
local translation models. Translatly does not send translation text, selected
text, translation results, or history to the developer, an analytics service, a
remote translation API, or an advertising service.

Language preferences and other non-text preferences are stored through the
browser's extension storage. Translation history remains in local extension
storage and is not synchronized by Translatly.

## Model Downloads

When you request a model, Translatly downloads model data from the approved
Hugging Face origin. These downloads contain model files, not your translation
text. Hugging Face may process ordinary network information according to its
own [Privacy Policy](https://huggingface.co/privacy).

Translatly does not download or execute JavaScript, WebAssembly, native code,
or other executable program code at runtime. Runtime code and ONNX Runtime
WebAssembly files are included in the extension package.

## How Information Is Used

Information handled by Translatly is used only to:

- Provide the translation that you explicitly request.
- Display and maintain history that you choose to keep locally.
- Store your language and appearance preferences.
- Download and manage local translation models.

Translatly does not sell, rent, or transfer user information to third parties.
It does not use user information for advertising, profiling, creditworthiness,
or unrelated purposes. The developer does not read user translation content.

## Retention and Deletion

You can clear translation history from the full translator. You can remove
downloaded models from the model manager, and uninstalling the extension removes
its stored extension data according to the browser's extension behavior.

## Permissions

Translatly uses the following permissions to provide its user-facing features:

- `storage`: save preferences and local translation history.
- `contextMenus`: provide the user-invoked translation context-menu action.
- `offscreen` on Chromium: host local inference outside the service worker.
- `<all_urls>`: detect explicit text selections and show the translation bubble
  on supported web pages.
- `https://huggingface.co/*`: download requested model data.

The extension does not collect browsing history, page contents in the
background, credentials, payment information, location, or identifying account
information.

## Limited Use Disclosure

Translatly's use of website content is limited to the user-facing translation
feature that the user explicitly starts. Website content is not sold or
transferred, is not used for advertising or profiling, and is not accessed by
humans. Translation text remains on the user's device.

## Changes to This Policy

If this policy changes, the updated version will be published at this URL with
a new revision date.

## Contact

For privacy questions or requests, open an issue in the
[Translatly repository](https://github.com/JorgeDelgadillo/translatly/issues).
