// Wire protocol between UI surfaces, the background coordinator and the
// translation engine host. Every message traveling on the wire is a member of
// a discriminated union tagged by `type`. All request/result messages carry
// a `requestId` so multiple in-flight jobs can be correlated across surfaces.

/** UI surface -> engine: ask for a translation. */
export interface TranslateRequestMessage {
  type: 'translate:request';
  requestId: string;
  text: string;
  srcLang: string;
  tgtLang: string;
}

/** UI surface -> engine: cancel one in-flight or queued job. */
export interface TranslateCancelMessage {
  type: 'translate:cancel';
  requestId: string;
}

/** UI surface -> engine: cancel every in-flight and queued job. */
export interface TranslateCancelAllMessage {
  type: 'translate:cancelAll';
}

export type UiToEngineMessage =
  | TranslateRequestMessage
  | TranslateCancelMessage
  | TranslateCancelAllMessage;

/** Engine -> broadcast: job was accepted into the queue. */
export interface TranslateQueuedMessage {
  type: 'translate:queued';
  requestId: string;
  /** 1-based position in the queue (1 = next to run). */
  position: number;
}

/** Engine -> broadcast: model/download progress for a job. */
export interface TranslateProgressMessage {
  type: 'translate:progress';
  requestId: string;
  status: string;
  file?: string;
  /** 0-100, present for `status === 'progress'`. */
  progress?: number;
  loaded?: number;
  total?: number;
}

/** Engine -> broadcast: job completed successfully. */
export interface TranslateResultMessage {
  type: 'translate:result';
  requestId: string;
  translation: string;
}

/** Engine -> broadcast: job failed or was cancelled. */
export interface TranslateErrorMessage {
  type: 'translate:error';
  requestId: string;
  error: string;
  cancelled?: boolean;
}

export type EngineBroadcast =
  | TranslateQueuedMessage
  | TranslateProgressMessage
  | TranslateResultMessage
  | TranslateErrorMessage;

/**
 * Engine -> broadcast (internal): signals that the engine host has registered
 * its message listener and is ready to process requests. Used by the
 * background coordinator to avoid a race where the first request arrives
 * before the offscreen document's script has finished loading.
 */
export interface EngineReadyMessage {
  type: 'engine:ready';
}

export type EngineInternalMessage = EngineReadyMessage;

// ---- Type guards ---------------------------------------------------------

export function isUiToEngineMessage(msg: unknown): msg is UiToEngineMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return t === 'translate:request' || t === 'translate:cancel' || t === 'translate:cancelAll';
}

export function isEngineBroadcast(msg: unknown): msg is EngineBroadcast {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return (
    t === 'translate:queued' ||
    t === 'translate:progress' ||
    t === 'translate:result' ||
    t === 'translate:error'
  );
}

export function isEngineInternalMessage(msg: unknown): msg is EngineInternalMessage {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'engine:ready';
}
