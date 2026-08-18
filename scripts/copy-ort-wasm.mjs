// Copies the ONNX Runtime Web artifacts used by @huggingface/transformers
// into public/ort so they are bundled inside the extension package.
//
// Why: extensions must not fetch executable code (including .wasm/.mjs) from
// remote CDNs, both for store policy compliance and for Translatly's privacy
// model.
//
// At runtime ORT dynamic-imports a per-feature `.mjs` glue module from the
// configured `wasmPaths` directory, which in turn loads the matching `.wasm`
// binary. Both the glue and the binary must be present locally.
//
// The artifacts are resolved from the onnxruntime-web copy that
// @huggingface/transformers depends on, guaranteeing loader/binary ABI match.

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The extension currently ships the WASM backend only. The `jsep` (WebGPU) and
// `jspi` (JS promise integration) variants are not wired into the extension.
// Ship the threaded base build plus the asyncify variant that transformers.js
// v4 selects for proxied/worker inference.
const ORT_ARTIFACTS = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
];

const require = createRequire(import.meta.url);
const transformersEntry = require.resolve('@huggingface/transformers');
const transformersRequire = createRequire(transformersEntry);
const ortDist = dirname(transformersRequire.resolve('onnxruntime-web'));

const outDir = fileURLToPath(new URL('../public/ort/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const file of ORT_ARTIFACTS) {
  copyFileSync(join(ortDist, file), join(outDir, file));
  console.log(`[copy-ort-wasm] copied ${file}`);
}
