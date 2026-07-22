import { describe, expect, it, vi } from 'vitest';
import type { TranslateRequestMessage } from '@/lib/messaging/protocol';

const translateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/engine/translator', () => ({
  translate: translateMock,
}));

vi.mock('@/lib/engine/engine-host', () => ({
  getDefaultWasmBaseUrl: () => 'https://example.test/ort/',
}));

import { TranslationQueue } from '@/lib/engine/queue';

const request = (requestId: string): TranslateRequestMessage => ({
  type: 'translate:request',
  requestId,
  text: `Text ${requestId}`,
  srcLang: 'en',
  tgtLang: 'es',
});

describe('translation queue', () => {
  it('serializes inference and broadcasts lifecycle events', async () => {
    const events: unknown[] = [];
    const started: string[] = [];
    let releaseFirst!: () => void;
    const firstJob = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    translateMock
      .mockImplementationOnce(async () => {
        started.push('one');
        await firstJob;
        return 'Uno';
      })
      .mockImplementationOnce(async () => {
        started.push('two');
        return 'Dos';
      });

    const queue = new TranslationQueue((event) => events.push(event));
    expect(queue.enqueue(request('one'))).toEqual({ position: 1 });
    await vi.waitFor(() => expect(started).toEqual(['one']));
    expect(queue.enqueue(request('two'))).toEqual({ position: 1 });

    expect(events.filter((event) => (event as { type: string }).type === 'translate:queued')).toEqual([
      { type: 'translate:queued', requestId: 'one', position: 1 },
      { type: 'translate:queued', requestId: 'two', position: 1 },
    ]);
    expect(translateMock).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(() => expect(started).toEqual(['one', 'two']));
    await vi.waitFor(() =>
      expect(
        events.filter((event) => (event as { type: string }).type === 'translate:result'),
      ).toHaveLength(2),
    );
    expect(events).toContainEqual({ type: 'translate:result', requestId: 'one', translation: 'Uno' });
    expect(events).toContainEqual({ type: 'translate:result', requestId: 'two', translation: 'Dos' });
  });

  it('cancels queued work without starting it', async () => {
    const events: unknown[] = [];
    let releaseFirst!: () => void;
    const firstJob = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    translateMock.mockImplementationOnce(async () => {
      await firstJob;
      return 'Uno';
    });

    const queue = new TranslationQueue((event) => events.push(event));
    queue.enqueue(request('one'));
    await vi.waitFor(() => expect(translateMock).toHaveBeenCalledTimes(1));
    queue.enqueue(request('two'));
    queue.cancel('two');

    expect(events).toContainEqual({
      type: 'translate:error',
      requestId: 'two',
      error: 'cancelled',
      cancelled: true,
    });
    releaseFirst();
    await vi.waitFor(() =>
      expect(events).toContainEqual({ type: 'translate:result', requestId: 'one', translation: 'Uno' }),
    );
    expect(translateMock).toHaveBeenCalledTimes(1);
  });
});
