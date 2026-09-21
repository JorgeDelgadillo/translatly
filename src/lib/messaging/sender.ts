import { isModelManagerMessage, isUiToEngineMessage } from './protocol';

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
