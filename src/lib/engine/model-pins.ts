// Reviewed Hugging Face commits and SHA-256 digests for every file in those
// snapshots. Downloads must match this manifest; `main` is not a stable target.
// Regenerate from the Hub tree API: LFS `oid` values are the file SHA-256, and
// non-LFS files are hashed from the bytes at the same commit.

import pins from './model-pins.json';

export interface ModelPin {
  revision: string;
  files: Record<string, string>;
}

export const MODEL_PINS: Record<string, ModelPin> = pins;

export function getModelPin(modelId: string): ModelPin | undefined {
  return MODEL_PINS[modelId];
}
