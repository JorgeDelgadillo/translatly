import { browser } from 'wxt/browser';
import { TranslationQueue } from './queue';
import {
  isModelManagerMessage,
  isUiToEngineMessage,
  type EngineBroadcast,
  type ModelBroadcast,
  type ModelDownloadRequestMessage,
  type ModelDeleteRequestMessage,
  type ModelStatusRequestMessage,
} from '@/lib/messaging/protocol';
import {
  getModelDescriptor,
  type ModelDescriptor,
} from './registry';
import {
  isModelCached,
  preloadModel,
  removeModel,
  type ModelDownloadProgress,
} from './translator';

export interface EngineHostOptions {
  onBroadcast?: (message: EngineBroadcast) => void;
}

/**
 * Returns the directory URL where the bundled ONNX Runtime WASM binaries are
 * served. `runtime.getURL` only accepts typed file paths, so the URL is
 * derived from one of the known files and trimmed to its directory.
 */
export function getDefaultWasmBaseUrl(): string {
  return browser.runtime.getURL('/ort/ort-wasm-simd-threaded.wasm').replace(/[^/]+$/, '');
}

function publishModelBroadcast(message: ModelBroadcast): void {
  void browser.runtime.sendMessage(message).catch(() => {});
}

function modelOptions(onProgress?: (progress: ModelDownloadProgress) => void) {
  return { wasmBaseUrl: getDefaultWasmBaseUrl(), onProgress };
}

async function handleModelRequest(
  message: ModelDownloadRequestMessage | ModelDeleteRequestMessage | ModelStatusRequestMessage,
): Promise<void> {
  const descriptor: ModelDescriptor | undefined = getModelDescriptor(message.modelId);
  if (!descriptor) {
    publishModelBroadcast({
      type: 'model:error',
      modelId: message.modelId,
      error: `Unknown translation model: ${message.modelId}`,
    });
    return;
  }

  try {
    switch (message.type) {
      case 'model:status:request':
        publishModelBroadcast({
          type: 'model:status',
          modelId: descriptor.modelId,
          cached: await isModelCached(descriptor.modelId, modelOptions()),
          estimatedBytes: descriptor.estimatedBytes,
        });
        break;
      case 'model:download':
        await preloadModel(
          descriptor.modelId,
          modelOptions((progress) =>
            publishModelBroadcast({
              type: 'model:progress',
              modelId: descriptor.modelId,
              ...progress,
            }),
          ),
        );
        publishModelBroadcast({
          type: 'model:ready',
          modelId: descriptor.modelId,
          estimatedBytes: descriptor.estimatedBytes,
        });
        break;
      case 'model:delete':
        await removeModel(descriptor.modelId, modelOptions());
        publishModelBroadcast({ type: 'model:deleted', modelId: descriptor.modelId });
        break;
    }
  } catch (error) {
    publishModelBroadcast({
      type: 'model:error',
      modelId: descriptor.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Registers the engine message listener. Must run inside the engine host
 * context (the offscreen document on Chromium; the background page on Firefox).
 */
export function startEngineHost(options: EngineHostOptions = {}): void {
  const queue = new TranslationQueue(options.onBroadcast);

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (isModelManagerMessage(msg)) {
      queue.enqueueModelOperation(() => handleModelRequest(msg));
      return undefined;
    }
    if (!isUiToEngineMessage(msg)) return undefined;
    switch (msg.type) {
      case 'translate:request':
        queue.enqueue(msg);
        break;
      case 'translate:cancel':
        queue.cancel(msg.requestId);
        break;
      case 'translate:cancelAll':
        queue.cancelAll();
        break;
    }
    return undefined;
  });
}
