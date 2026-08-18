<script lang="ts">
  import { onMount } from 'svelte';
  import { MODEL_REGISTRY, type ModelDescriptor } from '@/lib/engine/registry';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';
  import type { Locale } from '@/lib/settings';
  import {
    onModelBroadcast,
    requestModelDelete,
    requestModelCancel,
    requestModelDownload,
    requestModelStatus,
  } from '@/lib/messaging/models';

  interface Props {
    locale: Locale;
  }

  let { locale }: Props = $props();

  type ModelState =
    | { status: 'checking' }
    | { status: 'ready'; estimatedBytes: number }
    | { status: 'not-installed'; estimatedBytes: number }
    | { status: 'downloading'; progress?: number; text: string }
    | { status: 'cancelling' }
    | { status: 'deleting' }
    | { status: 'error'; text: string };

  let states = $state<Record<string, ModelState>>({});
  let activeModelId = $state<string | null>(null);
  let activeRequestId = $state<string | null>(null);

  const storedBytes = $derived(
    MODEL_REGISTRY.reduce((total, model) => {
      const state = states[model.modelId];
      return total + (state?.status === 'ready' ? state.estimatedBytes : 0);
    }, 0),
  );
  const readyCount = $derived(
    MODEL_REGISTRY.filter((model) => states[model.modelId]?.status === 'ready').length,
  );

  function tx(key: MessageKey, values: Record<string, string | number> = {}): string {
    return translate(key, locale, values);
  }

  onMount(() => {
    const off = onModelBroadcast((message) => {
      switch (message.type) {
        case 'model:status':
          states[message.modelId] = {
            status: message.cached ? 'ready' : 'not-installed',
            estimatedBytes: message.estimatedBytes,
          };
          if (activeModelId === message.modelId && activeRequestId === null) activeModelId = null;
          break;
        case 'model:progress':
          if (activeRequestId !== message.requestId || states[message.modelId]?.status === 'cancelling') break;
          states[message.modelId] = {
            status: 'downloading',
            progress: message.progress,
            text: message.file ?? message.status,
          };
          break;
        case 'model:ready':
          states[message.modelId] = {
            status: 'ready',
            estimatedBytes: message.estimatedBytes,
          };
          if (activeModelId === message.modelId) activeModelId = null;
          if (activeRequestId === message.requestId) activeRequestId = null;
          break;
        case 'model:deleted':
          states[message.modelId] = {
            status: 'not-installed',
            estimatedBytes: modelById(message.modelId)?.estimatedBytes ?? 0,
          };
          if (activeModelId === message.modelId) activeModelId = null;
          activeRequestId = null;
          break;
        case 'model:error':
          if (message.requestId && activeRequestId !== message.requestId) break;
          states[message.modelId] = message.cancelled
            ? { status: 'not-installed', estimatedBytes: modelById(message.modelId)?.estimatedBytes ?? 0 }
            : { status: 'error', text: message.error };
          if (activeModelId === message.modelId) activeModelId = null;
          if (!message.requestId || activeRequestId === message.requestId) activeRequestId = null;
          break;
      }
    });

    for (const model of MODEL_REGISTRY) {
      states[model.modelId] = { status: 'checking' };
      requestModelStatus(model.modelId);
    }

    return off;
  });

  function modelById(modelId: string): ModelDescriptor | undefined {
    return MODEL_REGISTRY.find((model) => model.modelId === modelId);
  }

  function download(model: ModelDescriptor): void {
    if (activeModelId) return;
    activeModelId = model.modelId;
    states[model.modelId] = { status: 'downloading', text: tx('startingDownload') };
    activeRequestId = requestModelDownload(model.modelId);
  }

  function cancelDownload(model: ModelDescriptor): void {
    if (activeModelId !== model.modelId || !activeRequestId) return;
    states[model.modelId] = { status: 'cancelling' };
    requestModelCancel(model.modelId, activeRequestId);
  }

  function remove(model: ModelDescriptor): void {
    if (activeModelId || !window.confirm(tx('removeModelConfirm', { model: modelLabel(model) }))) return;
    activeModelId = model.modelId;
    activeRequestId = null;
    states[model.modelId] = { status: 'deleting' };
    requestModelDelete(model.modelId);
  }

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
    return Math.round(bytes / 1024 ** 2) + ' MB';
  }

  function languageSummary(model: ModelDescriptor): string {
    return model.languageCodes.map((code) => languageLabel(code, locale)).join(' · ');
  }

  function modelLabel(model: ModelDescriptor): string {
    return model.kind === 'nllb'
      ? tx('universalFallback')
      : model.languageCodes.map((code) => languageLabel(code, locale)).join(' → ');
  }

  function stateLabel(state: ModelState | undefined): string {
    if (!state || state.status === 'checking') return tx('checkingCache');
    if (state.status === 'ready') return tx('readyOnDevice');
    if (state.status === 'not-installed') return tx('notDownloaded');
    if (state.status === 'downloading') {
      return state.progress == null
        ? state.text
        : state.progress.toFixed(0) + '% · ' + state.text;
    }
    if (state.status === 'cancelling') return tx('cancelling');
    if (state.status === 'deleting') return tx('removingFiles');
    return state.text;
  }
</script>

<section class="models-panel" aria-labelledby="models-title">
  <div class="models-heading">
    <div>
      <p class="eyebrow">{tx('localStorageEyebrow')}</p>
      <h2 id="models-title">{tx('modelManager')}</h2>
    </div>
    <div class="storage-summary">
      <strong>{formatBytes(storedBytes)}</strong>
      <span>{tx('storageSummary', { size: formatBytes(storedBytes), ready: readyCount, total: MODEL_REGISTRY.length })}</span>
    </div>
  </div>

  <p class="models-intro">
    {tx('modelIntro')}
  </p>

  <div class="model-list">
    {#each MODEL_REGISTRY as model (model.modelId)}
      {@const state = states[model.modelId]}
      <article class="model-row">
        <div class="model-copy">
          <div class="model-title-line">
            <h3>{modelLabel(model)}</h3>
            <span class:universal={model.kind === 'nllb'} class="model-kind">
              {model.kind === 'nllb' ? tx('fallback') : tx('pairModel')}
            </span>
          </div>
          <p>{model.kind === 'nllb' ? tx('universalDescription') : tx('fastCompact')}</p>
          <span class="model-languages">{languageSummary(model)} · ~{formatBytes(model.estimatedBytes)}</span>
          {#if state?.status === 'downloading' && state.progress != null}
            <div
              class="progress-track"
              aria-label={tx('downloading', { model: modelLabel(model) })}
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={state.progress}
            >
              <span style={'width: ' + state.progress + '%'}></span>
            </div>
          {/if}
        </div>
        <div class="model-action">
          <span class:error={state?.status === 'error'} class="model-status" aria-live="polite">{stateLabel(state)}</span>
          {#if state?.status === 'ready'}
            <button class="model-button remove" onclick={() => remove(model)} disabled={activeModelId !== null}>
              {tx('remove')}
            </button>
          {:else if state?.status === 'downloading' && activeModelId === model.modelId}
            <button class="model-button remove" onclick={() => cancelDownload(model)}>
              {tx('cancel')}
            </button>
          {:else}
            <button
              class="model-button"
              onclick={() => download(model)}
              disabled={
                !state ||
                activeModelId !== null ||
                state.status === 'checking' ||
                state.status === 'downloading' ||
                state.status === 'cancelling' ||
                state.status === 'deleting'
              }
            >
              {tx('download')}
            </button>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .models-panel {
    margin-bottom: 2rem;
    padding: 1.5rem 1.65rem 1.65rem;
    border: 1px solid rgba(21, 26, 33, 0.15);
    border-radius: 0.45rem;
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 1.4rem 3.8rem rgba(21, 26, 33, 0.06);
    animation: panel-in 220ms ease both;
  }

  @keyframes panel-in {
    from { opacity: 0; transform: translateY(-0.5rem); }
    to { opacity: 1; transform: translateY(0); }
  }

  .models-heading,
  .model-title-line,
  .model-action {
    display: flex;
    align-items: center;
  }

  .models-heading {
    justify-content: space-between;
    gap: 2rem;
  }

  .eyebrow {
    margin: 0 0 0.85rem;
    color: #315cff;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.66rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h2,
  h3,
  p {
    margin-top: 0;
  }

  h2,
  h3 {
    color: #151a21;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-weight: 400;
    letter-spacing: -0.04em;
  }

  h2 {
    margin-bottom: 0;
    font-size: 1.8rem;
  }

  h3 {
    margin-bottom: 0;
    font-size: 1.15rem;
  }

  .storage-summary {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: #687381;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.63rem;
    line-height: 1.6;
    text-align: right;
    text-transform: uppercase;
  }

  .storage-summary strong {
    color: #151a21;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 1.65rem;
    font-weight: 400;
    letter-spacing: -0.04em;
    text-transform: none;
  }

  .models-intro {
    max-width: 620px;
    margin: 1rem 0 1.35rem;
    color: #687381;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .model-list {
    border-top: 1px solid rgba(21, 26, 33, 0.12);
  }

  .model-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2rem;
    padding: 1.15rem 0;
    border-bottom: 1px solid rgba(21, 26, 33, 0.12);
  }

  .model-title-line {
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .model-kind {
    padding: 0.24rem 0.4rem;
    border-radius: 999px;
    background: #eef1f4;
    color: #687381;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.57rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .model-kind.universal {
    background: #e8edff;
    color: #315cff;
  }

  .model-copy > p {
    margin: 0.45rem 0 0.35rem;
    color: #687381;
    font-size: 0.79rem;
  }

  .model-languages,
  .model-status {
    color: #687381;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.62rem;
    line-height: 1.5;
  }

  .model-action {
    min-width: 165px;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    gap: 0.65rem;
  }

  .model-status {
    max-width: 190px;
    text-align: right;
  }

  .model-status.error {
    color: #b4233c;
  }

  .model-button {
    padding: 0.55rem 0.8rem;
    border: 1px solid #315cff;
    border-radius: 999px;
    background: #315cff;
    color: #ffffff;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .model-button.remove {
    border-color: rgba(21, 26, 33, 0.2);
    background: transparent;
    color: #151a21;
  }

  .model-button:disabled {
    cursor: wait;
    opacity: 0.45;
  }

  .progress-track {
    width: min(100%, 420px);
    height: 0.25rem;
    margin-top: 0.75rem;
    overflow: hidden;
    border-radius: 999px;
    background: #eef1f4;
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #315cff;
    transition: width 180ms ease;
  }

  @media (max-width: 680px) {
    .models-heading,
    .model-row {
      grid-template-columns: 1fr;
      display: grid;
    }

    .storage-summary,
    .model-action {
      align-items: flex-start;
      text-align: left;
    }

    .model-action {
      min-width: 0;
    }
  }

  :global(html[data-theme='dark']) .models-panel {
    border-color: rgba(243, 245, 247, 0.2);
    background: #1a2029;
    color: #f3f5f7;
  }

  :global(html[data-theme='dark']) .models-panel h2,
  :global(html[data-theme='dark']) .models-panel h3,
  :global(html[data-theme='dark']) .storage-summary strong {
    color: #f3f5f7;
  }

  :global(html[data-theme='dark']) .models-panel .model-list,
  :global(html[data-theme='dark']) .models-panel .model-row {
    border-color: rgba(243, 245, 247, 0.18);
  }

  :global(html[data-theme='dark']) .models-panel .models-intro,
  :global(html[data-theme='dark']) .models-panel .model-copy > p,
  :global(html[data-theme='dark']) .models-panel .model-languages,
  :global(html[data-theme='dark']) .models-panel .model-status,
  :global(html[data-theme='dark']) .models-panel .storage-summary {
    color: #aeb8c4;
  }

  :global(html[data-theme='dark']) .models-panel .model-kind {
    background: #242c36;
    color: #f3f5f7;
  }

  :global(html[data-theme='dark']) .models-panel .model-kind.universal {
    background: #202b4e;
    color: #7d96ff;
  }

  :global(html[data-theme='dark']) .models-panel .model-button.remove {
    border-color: rgba(243, 245, 247, 0.24);
    color: #f3f5f7;
  }

  @media (prefers-color-scheme: dark) {
    :global(html[data-theme='system']) .models-panel {
      border-color: rgba(243, 245, 247, 0.2);
      background: #1a2029;
      color: #f3f5f7;
    }

    :global(html[data-theme='system']) .models-panel h2,
    :global(html[data-theme='system']) .models-panel h3,
    :global(html[data-theme='system']) .storage-summary strong {
      color: #f3f5f7;
    }

    :global(html[data-theme='system']) .models-panel .model-list,
    :global(html[data-theme='system']) .models-panel .model-row {
      border-color: rgba(243, 245, 247, 0.18);
    }

    :global(html[data-theme='system']) .models-panel .models-intro,
    :global(html[data-theme='system']) .models-panel .model-copy > p,
    :global(html[data-theme='system']) .models-panel .model-languages,
    :global(html[data-theme='system']) .models-panel .model-status,
    :global(html[data-theme='system']) .models-panel .storage-summary {
      color: #aeb8c4;
    }

    :global(html[data-theme='system']) .models-panel .model-kind {
      background: #242c36;
      color: #f3f5f7;
    }

    :global(html[data-theme='system']) .models-panel .model-kind.universal {
      background: #202b4e;
      color: #7d96ff;
    }

    :global(html[data-theme='system']) .models-panel .model-button.remove {
      border-color: rgba(243, 245, 247, 0.24);
      color: #f3f5f7;
    }
  }

  /* Keep model management aligned with the compact workspace controls. */
  .models-panel {
    margin-bottom: 1.25rem;
    padding: 1.1rem 1.25rem 1.25rem;
    border-color: var(--line, #d7dee6);
    border-radius: 6px;
    background: var(--paper, #ffffff);
    box-shadow: none;
    color: var(--ink, #151a21);
  }

  .eyebrow,
  .storage-summary,
  .models-intro,
  .model-copy > p,
  .model-languages,
  .model-status {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .eyebrow {
    margin-bottom: 0.6rem;
    color: var(--accent, #315cff);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
  }

  h2,
  h3,
  .storage-summary strong {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: -0.035em;
  }

  h2 {
    font-size: 1.35rem;
    font-weight: 650;
  }

  h3 {
    font-size: 1rem;
    font-weight: 650;
  }

  .storage-summary,
  .models-intro,
  .model-copy > p,
  .model-languages,
  .model-status {
    color: var(--muted, #687381);
  }

  .storage-summary strong {
    color: var(--ink, #151a21);
    font-size: 1.35rem;
    font-weight: 650;
  }

  .model-list,
  .model-row {
    border-color: var(--line, #d7dee6);
  }

  .model-kind {
    border: 1px solid var(--line, #d7dee6);
    border-radius: 4px;
    background: var(--surface, #eef1f4);
    color: var(--muted, #687381);
  }

  .model-kind.universal {
    border-color: #b7c4ff;
    background: var(--accent-soft, #e8edff);
    color: var(--accent, #315cff);
  }

  .model-action {
    min-width: 145px;
  }

  .model-button {
    border-color: var(--accent, #315cff);
    border-radius: 4px;
    background: var(--accent, #315cff);
    color: #ffffff;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72rem;
  }

  .model-button.remove {
    border-color: var(--line, #d7dee6);
    background: transparent;
    color: var(--ink, #151a21);
  }

  .progress-track {
    border-radius: 2px;
    background: var(--surface, #eef1f4);
  }

  .progress-track span {
    border-radius: 2px;
    background: var(--accent, #315cff);
  }
</style>
