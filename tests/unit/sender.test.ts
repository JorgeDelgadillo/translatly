import { describe, expect, it } from 'vitest';
import { isExtensionPageSender, isPrivilegedEngineMessage } from '@/lib/messaging/sender';

const extensionRoot = 'chrome-extension://abcdefghijklmnop/';

describe('extension message senders', () => {
  it('accepts extension pages and rejects content scripts', () => {
    expect(isExtensionPageSender(`${extensionRoot}translator.html`, extensionRoot)).toBe(true);
    expect(isExtensionPageSender('https://example.test/inbox', extensionRoot)).toBe(false);
    expect(isExtensionPageSender(undefined, extensionRoot)).toBe(false);
    expect(isExtensionPageSender('not a url', extensionRoot)).toBe(false);
  });

  it('treats model control and cancel-all as privileged', () => {
    expect(isPrivilegedEngineMessage({ type: 'model:delete', modelId: 'x' })).toBe(true);
    expect(isPrivilegedEngineMessage({ type: 'model:download', modelId: 'x', requestId: '1' })).toBe(true);
    expect(isPrivilegedEngineMessage({ type: 'translate:cancelAll' })).toBe(true);
    expect(isPrivilegedEngineMessage({ type: 'translate:request', requestId: '1' })).toBe(false);
    expect(isPrivilegedEngineMessage({ type: 'translate:cancel', requestId: '1' })).toBe(false);
    expect(isPrivilegedEngineMessage(null)).toBe(false);
  });
});
