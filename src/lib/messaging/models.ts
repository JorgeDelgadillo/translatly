import { browser } from 'wxt/browser';
import { isModelBroadcast, type ModelBroadcast } from './protocol';

export function requestModelDownload(modelId: string): void {
  void browser.runtime.sendMessage({ type: 'model:download', modelId });
}

export function requestModelDelete(modelId: string): void {
  void browser.runtime.sendMessage({ type: 'model:delete', modelId });
}

export function requestModelStatus(modelId: string): void {
  void browser.runtime.sendMessage({ type: 'model:status:request', modelId });
}

export function onModelBroadcast(handler: (message: ModelBroadcast) => void): () => void {
  const listener = (message: unknown) => {
    if (isModelBroadcast(message)) handler(message);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
