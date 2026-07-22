import { browser } from 'wxt/browser';
import { translate, type ModelDownloadProgress } from './translator';
import { getDefaultWasmBaseUrl } from './engine-host';
import type {
  EngineBroadcast,
  TranslateErrorMessage,
  TranslateRequestMessage,
} from '@/lib/messaging/protocol';

export type BroadcastHandler = (message: EngineBroadcast) => void;

const defaultBroadcast: BroadcastHandler = (message) => {
  void browser.runtime.sendMessage(message).catch(() => {});
};

interface Job {
  requestId: string;
  text: string;
  srcLang: string;
  tgtLang: string;
  controller: AbortController;
}

/**
 * Serial translation queue. Inference is single-threaded (WASM, no
 * SharedArrayBuffer in extension pages), so jobs are processed one at a time
 * to avoid contention. Each job carries its own AbortController so it can be
 * cancelled individually, either while waiting in the queue or while running.
 */
export class TranslationQueue {
  private readonly active = new Map<string, AbortController>();
  private readonly pending: Job[] = [];
  private pumping = false;

  constructor(private readonly emit: BroadcastHandler = defaultBroadcast) {}

  enqueue(req: TranslateRequestMessage): { position: number } {
    const controller = new AbortController();
    const job: Job = {
      requestId: req.requestId,
      text: req.text,
      srcLang: req.srcLang,
      tgtLang: req.tgtLang,
      controller,
    };
    this.pending.push(job);
    this.broadcast({ type: 'translate:queued', requestId: job.requestId, position: this.pending.length });
    void this.pump();
    return { position: this.pending.length };
  }

  cancel(requestId: string): void {
    const idx = this.pending.findIndex((j) => j.requestId === requestId);
    if (idx >= 0) {
      const [job] = this.pending.splice(idx, 1);
      job.controller.abort();
      this.broadcastCancelled(requestId);
      return;
    }
    const controller = this.active.get(requestId);
    if (controller) {
      // The active job's pump iteration will observe the abort and emit the
      // cancelled error itself; nothing else to do here.
      controller.abort();
    }
  }

  cancelAll(): void {
    for (const job of this.pending) {
      job.controller.abort();
      this.broadcastCancelled(job.requestId);
    }
    this.pending.length = 0;
    for (const controller of this.active.values()) controller.abort();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift() as Job;
        if (job.controller.signal.aborted) continue;

        this.active.set(job.requestId, job.controller);
        try {
          const translation = await translate(job.text, job.srcLang, job.tgtLang, {
            wasmBaseUrl: getDefaultWasmBaseUrl(),
            signal: job.controller.signal,
            onProgress: (progress) => this.broadcastProgress(job.requestId, progress),
          });
          if (job.controller.signal.aborted) {
            this.broadcastCancelled(job.requestId);
          } else {
            this.broadcast({ type: 'translate:result', requestId: job.requestId, translation });
          }
        } catch (error) {
          const message: TranslateErrorMessage = {
            type: 'translate:error',
            requestId: job.requestId,
            error: error instanceof Error ? error.message : String(error),
            cancelled: job.controller.signal.aborted,
          };
          this.broadcast(message);
        } finally {
          this.active.delete(job.requestId);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private broadcast(msg: EngineBroadcast): void {
    this.emit(msg);
  }

  private broadcastProgress(requestId: string, progress: ModelDownloadProgress): void {
    this.broadcast({ type: 'translate:progress', requestId, ...progress });
  }

  private broadcastCancelled(requestId: string): void {
    this.broadcast({ type: 'translate:error', requestId, error: 'cancelled', cancelled: true });
  }
}
