// Message protocol between UI surfaces, the background coordinator and the
// translation engine host (offscreen document on Chromium, background page on
// Firefox). Kept intentionally small for the phase 2 proof of concept; the
// full typed protocol (queue, cancellation) lands in phase 3.

/** UI surface -> background: request a translation. */
export interface TranslateRequest {
  type: 'translate';
  text: string;
  srcLang: string;
  tgtLang: string;
}

/** Background -> engine host: forwarded translation request. */
export interface EngineTranslateRequest {
  type: 'engine:translate';
  text: string;
  srcLang: string;
  tgtLang: string;
}

/** Engine host -> broadcast: model download / load progress. */
export interface EngineProgressMessage {
  type: 'engine:progress';
  status: string;
  file?: string;
  /** Download progress for the current file, 0-100. */
  progress?: number;
  loaded?: number;
  total?: number;
}

export type TranslateResponse =
  | { ok: true; translation: string }
  | { ok: false; error: string };
