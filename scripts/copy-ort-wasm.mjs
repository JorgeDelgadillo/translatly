// Copies the ONNX Runtime Web WASM binaries used by @huggingface/transformers
// into public/ort so they are bundled inside the extension package.
//
// Why: extensions must not fetch executable code (including .wasm) from remote
// CDNs, both for store policy compliance and for Translatly's privacy model.
//
// The binaries are resolved from the onnxruntime-web copy that
// @huggingface/transformers depends on, guaranteeing loader/binary ABI match.

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ort-wasm-simd-threaded.wasm: default CPU build (SIMD, threads when available).
// ort-wasm-simd-threaded.asyncify.wasm: used by transformers.js for proxied/worker inference.
// (ort-wasm-simd-threaded.jsep.wasm is only needed for the WebGPU backend - later phase.)
const WASM_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.wasm'];

const require = createRequire(import.meta.url);
const transformersEntry = require.resolve('@huggingface/transformers');
const transformersRequire = createRequire(transformersEntry);
const ortDist = dirname(transformersRequire.resolve('onnxruntime-web'));

const outDir = fileURLToPath(new URL('../public/ort/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const file of WASM_FILES) {
  copyFileSync(join(ortDist, file), join(outDir, file));
  console.log(`[copy-ort-wasm] copied ${file}`);
}
