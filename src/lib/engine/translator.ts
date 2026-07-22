import { env, pipeline, type TranslationPipeline } from '@huggingface/transformers';
import { getPair, pairKey } from './registry';

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
// budget of low-VRAM / integrated-GPU machines. When a different pair is
// requested, the previous model is disposed before the new one loads.
const MAX_MODELS_IN_MEMORY = 1;
const cache = new Map<string, TranslationPipeline>();

function configureEnvironment(wasmBaseUrl: string): void {
  // Models come from the Hugging Face hub; nothing else may be loaded.
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  // The wasm backend options object is always present in browser builds; the
  // library types mark it optional and read-only, hence the assertion.
  const wasm = env.backends.onnx.wasm!;
  // Serve the ONNX Runtime WASM binaries from inside the extension package.
  wasm.wasmPaths = wasmBaseUrl;
  // SharedArrayBuffer is unavailable in extension pages (no cross-origin
  // isolation), so stick to a single WASM thread. SIMD stays enabled.
  wasm.numThreads = 1;
}

async function getTranslator(
  key: string,
  modelId: string,
  options: TranslateOptions,
): Promise<TranslationPipeline> {
  configureEnvironment(options.wasmBaseUrl);
  const cached = cache.get(key);
  if (cached) return cached;

  if (cache.size >= MAX_MODELS_IN_MEMORY) {
    const oldest = cache.entries().next().value as [string, TranslationPipeline] | undefined;
    if (oldest) {
      cache.delete(oldest[0]);
      try {
        (oldest[1] as unknown as { dispose?: () => void }).dispose?.();
      } catch {
        // Disposal is best-effort; rely on GC if the runtime has no dispose hook.
      }
    }
  }

  const pipe = await pipeline('translation', modelId, {
    dtype: 'int8',
    // The OPUS-MT merged decoder trips an ORT 1.26-dev graph optimizer bug:
    // the `DQ -> MatMul` -> `MatMulNBits` fusion (extended level) aborts with
    // "Missing required scale" for the shared embedding. Pinning the level to
    // 'basic' skips that fusion while keeping the cheap optimizations.
    // Verified locally against the real model files with onnxruntime-web.
    session_options: { graphOptimizationLevel: 'basic' },
    progress_callback: (progress) => options.onProgress?.(progress as ModelDownloadProgress),
  });
  cache.set(key, pipe);
  return pipe;
}

/** Translates text with the OPUS-MT model registered for the given pair. */
export async function translate(
  text: string,
  srcLang: string,
  tgtLang: string,
  options: TranslateOptions,
): Promise<string> {
  const entry = getPair(srcLang, tgtLang);
  if (!entry) throw new Error(`Unsupported language pair: ${srcLang} -> ${tgtLang}`);

  const translator = await getTranslator(pairKey(srcLang, tgtLang), entry.modelId, options);
  const callOptions = options.signal ? { signal: options.signal } : undefined;
  const [result] = await translator(text, callOptions as never);
  return result.translation_text;
}
