import { describe, expect, it } from 'vitest';
import {
  isEngineBroadcast,
  isEngineInternalMessage,
  isModelBroadcast,
  isModelManagerMessage,
  isOpenTranslatorMessage,
  isUiToEngineMessage,
} from '@/lib/messaging/protocol';

describe('typed message guards', () => {
  it('recognizes UI-to-engine messages by discriminant', () => {
    expect(isUiToEngineMessage({ type: 'translate:request' })).toBe(true);
    expect(isUiToEngineMessage({ type: 'model:delete' })).toBe(true);
    expect(isUiToEngineMessage({ type: 'model:cancel' })).toBe(true);
    expect(isUiToEngineMessage({ type: 'unknown' })).toBe(false);
    expect(isUiToEngineMessage(null)).toBe(false);
  });

  it('separates translation and model broadcasts', () => {
    expect(isEngineBroadcast({ type: 'translate:result' })).toBe(true);
    expect(isEngineBroadcast({ type: 'model:ready' })).toBe(false);
    expect(isModelBroadcast({ type: 'model:ready' })).toBe(true);
    expect(isModelBroadcast({ type: 'translate:error' })).toBe(false);
    expect(isModelManagerMessage({ type: 'model:status:request' })).toBe(true);
    expect(isModelManagerMessage({ type: 'model:cancel' })).toBe(true);
  });

  it('recognizes internal readiness and navigation messages', () => {
    expect(isEngineInternalMessage({ type: 'engine:ready' })).toBe(true);
    expect(isEngineInternalMessage({ type: 'translate:queued' })).toBe(false);
    expect(isOpenTranslatorMessage({ type: 'translator:open', text: 'Hello' })).toBe(true);
    expect(isOpenTranslatorMessage({ type: 'translator:close' })).toBe(false);
  });
});
