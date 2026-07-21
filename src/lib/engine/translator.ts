import { env, pipeline, type TranslationPipeline } from '@huggingface/transformers';
import type { EngineProgressMessage } from './protocol';

export interface TranslateOptions {
  /** Base URL (with trailing slash) where the bundled ORT .wasm binaries live. */
  wasmBaseUrl: string;
  onProgress?: (progress: Omit<EngineProgressMessage, 'type'>) => void;
}

// Proof-of-concept model: single fixed pair, downloaded on first use.
const MODEL_ID = 'Xenova/opus-mt-en-es';

let translatorPromise: Promise<TranslationPipeline> | null = null;

function configureEnvironment(wasmBaseUrl: string): void {
  // Models come from the Hugging Face hub; nothing else may be loaded.
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  // The wasm backend options object is always present in browser builds;
  // the library types mark it optional and read-only, hence the assertion.
  const wasm = env.backends.onnx.wasm!;
  // Serve the ONNX Runtime WASM binaries from inside the extension package.
  wasm.wasmPaths = wasmBaseUrl;
  // SharedArrayBuffer is unavailable in extension pages (no cross-origin
  // isolation), so stick to a single WASM thread. SIMD stays enabled.
  wasm.numThreads = 1;
}

function getTranslator(options: TranslateOptions): Promise<TranslationPipeline> {
  configureEnvironment(options.wasmBaseUrl);
  translatorPromise ??= pipeline('translation', MODEL_ID, {
    dtype: 'q8',
    progress_callback: (progress) => options.onProgress?.(progress),
  });
  return translatorPromise;
}

/** Translates text with the proof-of-concept OPUS-MT model (en -> es). */
export async function translate(text: string, options: TranslateOptions): Promise<string> {
  const translator = await getTranslator(options);
  const [result] = await translator(text);
  return result.translation_text;
}
