import { isModelManagerMessage, isUiToEngineMessage } from './protocol';

export interface EngineRelayEnvelope {
  type: 'engine:relay';
  message: unknown;
}

/** True when the background wrapped a UI command for the offscreen engine. */
export function isEngineRelayEnvelope(message: unknown): message is EngineRelayEnvelope {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'engine:relay' &&
    'message' in message
  );
}

/**
 * Chromium delivers a runtime message to the offscreen document and the
 * service worker. The worker relays one copy so the engine still starts if
 * the document was not loaded yet. The offscreen host must run only that
 * copy; otherwise every download and status check happens twice.
 */
export function engineCommandFrom(message: unknown, relayedOnly: boolean): unknown | undefined {
  if (!relayedOnly) return message;
  if (!isEngineRelayEnvelope(message)) return undefined;
  return message.message;
}

/** True when the sender is an extension page, not a content script on a site. */
export function isExtensionPageSender(senderUrl: string | undefined, extensionRootUrl: string): boolean {
  if (!senderUrl) return false;
  try {
    return new URL(senderUrl).origin === new URL(extensionRootUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Model management and cancelling every job can change the user's local models
 * or drop in-flight work. Content scripts may translate and cancel their own
 * request, but they may not perform these operations.
 */
export function isPrivilegedEngineMessage(message: unknown): boolean {
  if (isModelManagerMessage(message)) return true;
  return isUiToEngineMessage(message) && message.type === 'translate:cancelAll';
}
