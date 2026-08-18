import { env, ModelRegistry, pipeline, type TranslationPipeline } from '@huggingface/transformers';
import {
  getModelDescriptor,
  getTranslationRoute,
  type TranslationRoute,
} from './registry';

export interface ModelDownloadProgress {
  status: string;
  file?: string;
  /** 0-100, present for `status === 'progress'`. */
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface TranslateOptions {
  /** Base URL (with trailing slash) where the bundled ORT .wasm binaries live. */
  wasmBaseUrl: string;
  /** Cancels the in-flight inference when aborted. */
  signal?: AbortSignal;
  onProgress?: (progress: ModelDownloadProgress) => void;
}

// Only one model is kept in memory at a time to stay within the memory
// budget of low-VRAM / integrated-GPU machines. When a different model is
// requested, the previous model is disposed before the new one loads.
const MAX_MODELS_IN_MEMORY = 1;
const cache = new Map<string, TranslationPipeline>();
const defaultFetch = env.fetch;

function createAbortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function configureEnvironment(wasmBaseUrl: string, signal?: AbortSignal): void {
  // Models come from the Hugging Face hub; nothing else may be loaded.
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.fetch = signal
    ? (input, init = {}) => {
        if (signal.aborted) return Promise.reject(createAbortError());
        return defaultFetch(input, { ...init, signal: init.signal ?? signal });
      }
    : defaultFetch;
  // The wasm backend options object is always present in browser builds; the
  // library types mark it optional and read-only, hence the assertion.
  const wasm = env.backends.onnx.wasm!;
  // Serve the ONNX Runtime WASM binaries from inside the extension package.
  wasm.wasmPaths = wasmBaseUrl;
  // SharedArrayBuffer is unavailable in extension pages (no cross-origin
  // isolation), so stick to a single WASM thread. SIMD stays enabled.
  wasm.numThreads = 1;
}

function disposeTranslator(translator: TranslationPipeline): void {
  try {
    (translator as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // Disposal is best-effort; rely on GC if the runtime has no dispose hook.
  }
}

async function getTranslator(
  modelId: string,
  options: TranslateOptions,
): Promise<TranslationPipeline> {
  configureEnvironment(options.wasmBaseUrl, options.signal);
  if (options.signal?.aborted) throw createAbortError();
  const cached = cache.get(modelId);
  if (cached) return cached;

  if (cache.size >= MAX_MODELS_IN_MEMORY) {
    const oldest = cache.entries().next().value as [string, TranslationPipeline] | undefined;
    if (oldest) {
      cache.delete(oldest[0]);
      disposeTranslator(oldest[1]);
    }
  }

  const translator = await pipeline('translation', modelId, {
    dtype: 'int8',
    // The OPUS-MT merged decoder trips an ORT 1.26-dev graph optimizer bug:
    // the `DQ -> MatMul` -> `MatMulNBits` fusion (extended level) aborts with
    // "Missing required scale" for the shared embedding. Pinning the level to
    // 'basic' skips that fusion while keeping the cheap optimizations.
    session_options: { graphOptimizationLevel: 'basic' },
    progress_callback: (progress) => options.onProgress?.(progress as ModelDownloadProgress),
  });
  if (options.signal?.aborted) {
    disposeTranslator(translator);
    throw createAbortError();
  }
  cache.set(modelId, translator);
  return translator;
}

function translationCallOptions(route: TranslationRoute, signal?: AbortSignal): Record<string, unknown> {
  const callOptions: Record<string, unknown> = {};
  if (signal) callOptions.signal = signal;
  if (route.kind === 'nllb') {
    callOptions.src_lang = route.srcModelCode;
    callOptions.tgt_lang = route.tgtModelCode;
  }
  return callOptions;
}

/** Translates text using the direct OPUS model or the NLLB fallback route. */
export async function translate(
  text: string,
  srcLang: string,
  tgtLang: string,
  options: TranslateOptions,
): Promise<string> {
  const route = getTranslationRoute(srcLang, tgtLang);
  if (!route) throw new Error(`Unsupported language pair: ${srcLang} -> ${tgtLang}`);

  const translator = await getTranslator(route.modelId, options);
  const [result] = await translator(text, translationCallOptions(route, options.signal) as never);
  return result.translation_text;
}

/** Downloads and warms a registered model in the engine host. */
export async function preloadModel(modelId: string, options: TranslateOptions): Promise<void> {
  if (!getModelDescriptor(modelId)) throw new Error(`Unknown translation model: ${modelId}`);
  const wasCached = await isModelCached(modelId, options);
  try {
    await getTranslator(modelId, options);
  } catch (error) {
    if (options.signal?.aborted && !wasCached) {
      await removeModel(modelId, { ...options, signal: undefined }).catch(() => {});
    }
    throw error;
  }
}

/** Checks the Transformers.js pipeline cache without loading model weights. */
export async function isModelCached(modelId: string, options: TranslateOptions): Promise<boolean> {
  if (!getModelDescriptor(modelId)) throw new Error(`Unknown translation model: ${modelId}`);
  configureEnvironment(options.wasmBaseUrl);
  return ModelRegistry.is_pipeline_cached('translation', modelId, { dtype: 'int8' });
}

/** Disposes the in-memory pipeline and clears its on-device cache entries. */
export async function removeModel(modelId: string, options: TranslateOptions): Promise<void> {
  if (!getModelDescriptor(modelId)) throw new Error(`Unknown translation model: ${modelId}`);
  configureEnvironment(options.wasmBaseUrl);
  const cached = cache.get(modelId);
  if (cached) {
    cache.delete(modelId);
    disposeTranslator(cached);
  }
  await ModelRegistry.clear_pipeline_cache('translation', modelId, { dtype: 'int8' });
}
