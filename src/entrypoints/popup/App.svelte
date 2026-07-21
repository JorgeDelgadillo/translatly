<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { EngineProgressMessage, TranslateResponse } from '@/lib/engine/protocol';

  // Temporary engine proof-of-concept UI. Replaced by the real
  // quick-translate popup in phase 4.

  let text = $state('Hello, how are you?');
  let translation = $state('');
  let status = $state('');
  let busy = $state(false);

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'engine:progress') return;
    const { status: progressStatus, file, progress } = message as EngineProgressMessage;
    if (progressStatus === 'progress' && typeof progress === 'number') {
      status = `Downloading ${file}: ${progress.toFixed(0)}%`;
    } else if (progressStatus === 'initiate') {
      status = `Downloading ${file}…`;
    } else if (progressStatus === 'done') {
      status = `Loaded ${file}`;
    } else {
      status = progressStatus;
    }
  });

  async function runTranslation() {
    busy = true;
    translation = '';
    status = 'Translating…';
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'translate',
        text,
        srcLang: 'en',
        tgtLang: 'es',
      })) as TranslateResponse;
      if (response.ok) {
        translation = response.translation;
        status = '';
      } else {
        status = `Error: ${response.error}`;
      }
    } catch (error) {
      status = `Error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
    }
  }
</script>

<main>
  <h1>Translatly <span>engine PoC</span></h1>

  <label>
    English
    <textarea bind:value={text} rows="3" disabled={busy}></textarea>
  </label>

  <button onclick={runTranslation} disabled={busy || !text.trim()}>
    {busy ? 'Working…' : 'Translate to Spanish'}
  </button>

  {#if status}
    <p class="status">{status}</p>
  {/if}

  {#if translation}
    <label>
      Spanish
      <output>{translation}</output>
    </label>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    min-width: 280px;
  }

  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  h1 span {
    font-weight: 400;
    opacity: 0.6;
    font-size: 0.85rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  textarea,
  output {
    font: inherit;
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: inherit;
    resize: vertical;
  }

  output {
    min-height: 2.5rem;
    white-space: pre-wrap;
  }

  button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .status {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.7;
    word-break: break-all;
  }
</style>
