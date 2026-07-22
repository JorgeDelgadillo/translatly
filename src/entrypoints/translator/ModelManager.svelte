<script lang="ts">
  import { onMount } from 'svelte';
  import { MODEL_REGISTRY, type ModelDescriptor } from '@/lib/engine/registry';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';
  import type { Locale } from '@/lib/settings';
  import {
    onModelBroadcast,
    requestModelDelete,
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
    | { status: 'deleting' }
    | { status: 'error'; text: string };

  let states = $state<Record<string, ModelState>>({});
  let activeModelId = $state<string | null>(null);

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
          if (activeModelId === message.modelId) activeModelId = null;
          break;
        case 'model:progress':
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
          break;
        case 'model:deleted':
          states[message.modelId] = {
            status: 'not-installed',
            estimatedBytes: modelById(message.modelId)?.estimatedBytes ?? 0,
          };
          if (activeModelId === message.modelId) activeModelId = null;
          break;
        case 'model:error':
          states[message.modelId] = { status: 'error', text: message.error };
          if (activeModelId === message.modelId) activeModelId = null;
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
    requestModelDownload(model.modelId);
  }

  function remove(model: ModelDescriptor): void {
    if (activeModelId || !window.confirm(tx('removeModelConfirm', { model: modelLabel(model) }))) return;
    activeModelId = model.modelId;
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
          {:else}
            <button
              class="model-button"
              onclick={() => download(model)}
              disabled={!state || activeModelId !== null || state.status === 'checking' || state.status === 'downloading' || state.status === 'deleting'}
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
    border: 1px solid rgba(17, 35, 55, 0.15);
    border-radius: 0.45rem;
    background: rgba(255, 253, 247, 0.78);
    box-shadow: 0 1.4rem 3.8rem rgba(41, 44, 37, 0.06);
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
    color: #ed7259;
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
    color: #112337;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
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
    color: #6e7b7d;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.63rem;
    line-height: 1.6;
    text-align: right;
    text-transform: uppercase;
  }

  .storage-summary strong {
    color: #112337;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.65rem;
    font-weight: 400;
    letter-spacing: -0.04em;
    text-transform: none;
  }

  .models-intro {
    max-width: 620px;
    margin: 1rem 0 1.35rem;
    color: #647276;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .model-list {
    border-top: 1px solid rgba(17, 35, 55, 0.12);
  }

  .model-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2rem;
    padding: 1.15rem 0;
    border-bottom: 1px solid rgba(17, 35, 55, 0.12);
  }

  .model-title-line {
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .model-kind {
    padding: 0.24rem 0.4rem;
    border-radius: 999px;
    background: #e9e4d8;
    color: #6f7877;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.57rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .model-kind.universal {
    background: #f7d4c8;
    color: #9c4e3d;
  }

  .model-copy > p {
    margin: 0.45rem 0 0.35rem;
    color: #718083;
    font-size: 0.79rem;
  }

  .model-languages,
  .model-status {
    color: #788685;
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
    color: #b44f43;
  }

  .model-button {
    padding: 0.55rem 0.8rem;
    border: 1px solid #112337;
    border-radius: 999px;
    background: #112337;
    color: #f2eee4;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .model-button.remove {
    border-color: rgba(17, 35, 55, 0.2);
    background: transparent;
    color: #112337;
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
    background: #e5e0d5;
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #ed7259;
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
    border-color: rgba(244, 240, 232, 0.2);
    background: #182733;
    color: #f4f0e8;
  }

  :global(html[data-theme='dark']) .models-panel h2,
  :global(html[data-theme='dark']) .models-panel h3,
  :global(html[data-theme='dark']) .storage-summary strong {
    color: #f4f0e8;
  }

  :global(html[data-theme='dark']) .models-panel .model-list,
  :global(html[data-theme='dark']) .models-panel .model-row {
    border-color: rgba(244, 240, 232, 0.18);
  }

  :global(html[data-theme='dark']) .models-panel .models-intro,
  :global(html[data-theme='dark']) .models-panel .model-copy > p,
  :global(html[data-theme='dark']) .models-panel .model-languages,
  :global(html[data-theme='dark']) .models-panel .model-status,
  :global(html[data-theme='dark']) .models-panel .storage-summary {
    color: #b9c6c2;
  }

  :global(html[data-theme='dark']) .models-panel .model-kind {
    background: #26343d;
    color: #d8e2dc;
  }

  :global(html[data-theme='dark']) .models-panel .model-kind.universal {
    background: #4a2d2d;
    color: #ffb19e;
  }

  :global(html[data-theme='dark']) .models-panel .model-button.remove {
    border-color: rgba(244, 240, 232, 0.24);
    color: #f4f0e8;
  }

  @media (prefers-color-scheme: dark) {
    :global(html[data-theme='system']) .models-panel {
      border-color: rgba(244, 240, 232, 0.2);
      background: #182733;
      color: #f4f0e8;
    }

    :global(html[data-theme='system']) .models-panel h2,
    :global(html[data-theme='system']) .models-panel h3,
    :global(html[data-theme='system']) .storage-summary strong {
      color: #f4f0e8;
    }

    :global(html[data-theme='system']) .models-panel .model-list,
    :global(html[data-theme='system']) .models-panel .model-row {
      border-color: rgba(244, 240, 232, 0.18);
    }

    :global(html[data-theme='system']) .models-panel .models-intro,
    :global(html[data-theme='system']) .models-panel .model-copy > p,
    :global(html[data-theme='system']) .models-panel .model-languages,
    :global(html[data-theme='system']) .models-panel .model-status,
    :global(html[data-theme='system']) .models-panel .storage-summary {
      color: #b9c6c2;
    }

    :global(html[data-theme='system']) .models-panel .model-kind {
      background: #26343d;
      color: #d8e2dc;
    }

    :global(html[data-theme='system']) .models-panel .model-kind.universal {
      background: #4a2d2d;
      color: #ffb19e;
    }

    :global(html[data-theme='system']) .models-panel .model-button.remove {
      border-color: rgba(244, 240, 232, 0.24);
      color: #f4f0e8;
    }
  }
</style>
