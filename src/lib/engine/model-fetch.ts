import { getModelPin, type ModelPin } from './model-pins';

export interface PinnedModelRequest {
  modelId: string;
  revision: string;
  file: string;
}

/** SHA-256 hex digest of a downloaded model file. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Accepts only `https://huggingface.co/{model}/resolve/{pinned-commit}/{file}`.
 * The commit must be the one recorded for that model.
 */
export function parsePinnedModelUrl(raw: string): PinnedModelRequest | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || url.port !== '') {
    return undefined;
  }

  const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/resolve\/([0-9a-f]{40})\/(.+)$/);
  if (!match) return undefined;

  const modelId = match[1]!;
  const revision = match[2]!;
  let file: string;
  try {
    file = decodeURIComponent(match[3]!);
  } catch {
    return undefined;
  }
  if (file.includes('..') || file.startsWith('/') || file.includes('\\') || file.includes('\0')) {
    return undefined;
  }

  const pin = getModelPin(modelId);
  if (!pin || pin.revision !== revision) return undefined;
  return { modelId, revision, file };
}

/**
 * Fetches one pinned model file and checks a full 200 response against the
 * manifest. Partial and error responses are returned only for that same pinned
 * URL; every other destination is rejected before the request is sent.
 */
export async function fetchPinnedModelFile(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fetcher: typeof fetch,
  pins?: Record<string, ModelPin>,
): Promise<Response> {
  const parsed = parsePinnedModelUrl(requestUrl(input));
  if (!parsed) throw new Error('Blocked untrusted model download');

  const pin = pins?.[parsed.modelId] ?? getModelPin(parsed.modelId);
  const response = await fetcher(input, init);
  // Probes and range metadata are not the file bytes the runtime will execute.
  if (response.status !== 200) return response;

  const expected = pin?.files[parsed.file];
  if (!expected) throw new Error(`Blocked unexpected model file: ${parsed.file}`);

  const buffer = await response.arrayBuffer();
  const actual = await sha256Hex(buffer);
  if (actual !== expected) throw new Error(`Model file hash mismatch: ${parsed.file}`);

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.set('content-length', String(buffer.byteLength));
  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
