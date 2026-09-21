import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY } from '@/lib/engine/registry';
import { fetchPinnedModelFile, parsePinnedModelUrl, sha256Hex } from '@/lib/engine/model-fetch';
import { getModelPin, MODEL_PINS } from '@/lib/engine/model-pins';

const modelId = 'Xenova/opus-mt-en-es';
const pin = getModelPin(modelId)!;
const fileUrl = `https://huggingface.co/${modelId}/resolve/${pin.revision}/config.json`;

describe('pinned model downloads', () => {
  it('pins every registered model to a commit and a hashed file tree', () => {
    for (const model of MODEL_REGISTRY) {
      const modelPin = getModelPin(model.modelId);
      expect(modelPin?.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(modelPin?.files['config.json']).toMatch(/^[0-9a-f]{64}$/);
      expect(modelPin?.files['onnx/encoder_model_quantized.onnx']).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(Object.keys(MODEL_PINS)).toHaveLength(MODEL_REGISTRY.length);
  });

  it('accepts only the pinned Hugging Face commit for a known model', () => {
    expect(parsePinnedModelUrl(fileUrl)).toEqual({
      modelId,
      revision: pin.revision,
      file: 'config.json',
    });
    expect(parsePinnedModelUrl(fileUrl.replace(pin.revision, 'main'))).toBeUndefined();
    expect(parsePinnedModelUrl(fileUrl.replace('https://huggingface.co', 'https://example.test'))).toBeUndefined();
    expect(parsePinnedModelUrl(fileUrl.replace('config.json', 'onnx/../../config.json'))).toBeUndefined();
    expect(parsePinnedModelUrl('http://huggingface.co/Xenova/opus-mt-en-es/resolve/' + pin.revision + '/config.json')).toBeUndefined();
  });

  it('returns a full download only when the body matches the pinned digest', async () => {
    const body = new TextEncoder().encode('pinned-bytes');
    const digest = await sha256Hex(body);
    const fetcher = async () => new Response(body, { status: 200, headers: { 'content-encoding': 'gzip' } });

    const response = await fetchPinnedModelFile(fileUrl, undefined, fetcher, {
      [modelId]: { revision: pin.revision, files: { 'config.json': digest } },
    });

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBe(String(body.byteLength));
  });

  it('rejects a full download whose bytes do not match the pin', async () => {
    const fetcher = async () => new Response('tampered', { status: 200 });
    await expect(fetchPinnedModelFile(fileUrl, undefined, fetcher)).rejects.toThrow(/hash mismatch/);
  });

  it('rejects an unlisted file and any URL outside the pinned commits', async () => {
    const fetcher = async () => new Response('nope', { status: 200 });
    const extra = fileUrl.replace('config.json', 'extra.bin');
    await expect(fetchPinnedModelFile(extra, undefined, fetcher)).rejects.toThrow(/unexpected model file/);
    await expect(fetchPinnedModelFile('https://example.test/model.onnx', undefined, fetcher)).rejects.toThrow(
      /untrusted model download/,
    );
  });

  it('lets missing-file probes and range metadata through without treating them as weights', async () => {
    const missing = await fetchPinnedModelFile(
      fileUrl.replace('config.json', 'missing.bin'),
      undefined,
      async () => new Response('missing', { status: 404 }),
    );
    expect(missing.status).toBe(404);

    const partial = await fetchPinnedModelFile(fileUrl, undefined, async () => new Response('x', { status: 206 }));
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe('x');
  });
});
