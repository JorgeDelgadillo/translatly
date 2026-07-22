<script lang="ts">
  import { onMount } from 'svelte';
  import {
    sendTranslateRequest,
    sendTranslateCancel,
    onEngineBroadcast,
  } from '@/lib/messaging/translate';
  import { LANGUAGES, getTranslationRoute, supportedTargets, languageName } from '@/lib/engine/registry';
  import { loadDefaultLanguages, saveDefaultLanguages } from '@/lib/settings';
  import { openTranslatorPage } from '@/lib/messaging/navigation';

  type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; text: string }
    | { kind: 'error'; text: string };

  let loaded = $state(false);
  let source = $state('en');
  let target = $state('es');
  let text = $state('Hello, how are you?');
  let result = $state('');
  let resultPair = $state<{ source: string; target: string } | null>(null);
  let status = $state<Status>({ kind: 'idle' });
  let busy = $state(false);
  let copied = $state(false);
  let currentRequestId: string | null = null;

  const availableTargets = $derived(supportedTargets(source));

  onMount(async () => {
    const defaults = await loadDefaultLanguages();
    source = defaults.source;
    target = defaults.target;
    loaded = true;
  });

  // Keep the target valid for the chosen source and persist defaults.
  $effect(() => {
    if (!loaded) return;
    if (availableTargets.length > 0 && !availableTargets.includes(target)) {
      target = availableTargets[0]!;
      return; // re-run after target is corrected, then persist
    }
    void saveDefaultLanguages({ source, target });
  });

  // Subscribe to engine broadcasts and correlate with the active request.
  $effect(() => {
    const off = onEngineBroadcast((msg) => {
      if (currentRequestId == null || msg.requestId !== currentRequestId) return;
      switch (msg.type) {
        case 'translate:queued':
          status = { kind: 'busy', text: `Queued · position ${msg.position}` };
          break;
        case 'translate:progress':
          status = {
            kind: 'busy',
            text:
              msg.progress != null
                ? `Loading model · ${msg.progress.toFixed(0)}%`
                : `Loading model · ${msg.status}`,
          };
          break;
        case 'translate:result':
          result = msg.translation;
          resultPair = { source, target };
          status = { kind: 'idle' };
          busy = false;
          currentRequestId = null;
          copied = false;
          break;
        case 'translate:error':
          status = {
            kind: 'error',
            text: msg.cancelled ? 'Cancelled' : msg.error || 'Translation failed',
          };
          busy = false;
          currentRequestId = null;
          break;
      }
    });
    return off;
  });

  function runTranslate() {
    if (busy || !text.trim() || !source || !target) return;
    if (!getTranslationRoute(source, target)) {
      status = { kind: 'error', text: `No model for ${languageName(source)} → ${languageName(target)}` };
      return;
    }
    result = '';
    resultPair = null;
    copied = false;
    const id = sendTranslateRequest(text, source, target);
    currentRequestId = id;
    busy = true;
    status = { kind: 'busy', text: 'Translating…' };
  }

  function cancel() {
    if (currentRequestId) {
      sendTranslateCancel(currentRequestId);
      status = { kind: 'busy', text: 'Cancelling…' };
    }
  }

  function swap() {
    const previous = source;
    source = target;
    target = previous;
    result = '';
    resultPair = null;
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      status = { kind: 'error', text: 'Could not copy to clipboard' };
    }
  }

  function openFullTranslator() {
    openTranslatorPage({ text, source, target });
  }
</script>

<main>
  <header>
    <h1>Translatly</h1>
  </header>

  <div class="pickers">
    <label>
      <span>From</span>
      <select bind:value={source}>
        {#each LANGUAGES as lang (lang.code)}
          <option value={lang.code}>{lang.name}</option>
        {/each}
      </select>
    </label>

    <button class="swap" onclick={swap} disabled={busy} title="Swap languages" aria-label="Swap languages">
      ⇄
    </button>

    <label>
      <span>To</span>
      <select bind:value={target} disabled={availableTargets.length === 0}>
        {#each availableTargets as code (code)}
          <option value={code}>{languageName(code)}</option>
        {/each}
      </select>
    </label>
  </div>

  <label class="field">
    <span>{languageName(source)}</span>
    <textarea
      bind:value={text}
      rows="3"
      placeholder="Text to translate…"
      onkeydown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          runTranslate();
        }
      }}
    ></textarea>
  </label>

  <div class="actions">
    <button class="primary" onclick={runTranslate} disabled={busy || !text.trim()}>
      {busy ? 'Working…' : 'Translate'}
    </button>
    {#if busy}
      <button onclick={cancel}>Cancel</button>
    {/if}
    <button class="secondary" onclick={openFullTranslator}>Open full translator</button>
  </div>

  {#if result && resultPair}
    <section class="result" aria-live="polite">
      <div class="result-head">
        <span class="pair">{languageName(resultPair.source)} → {languageName(resultPair.target)}</span>
        <button class="small" onclick={copyResult}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p>{result}</p>
    </section>
  {/if}

  {#if status.kind !== 'idle'}
    <p class="status" class:error={status.kind === 'error'} aria-live="polite">
      {status.text}
    </p>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem;
    min-width: 340px;
  }

  header h1 {
    margin: 0;
    font-size: 1.1rem;
  }

  .pickers {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.4rem;
    align-items: end;
  }

  .pickers label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .pickers select,
  .field textarea {
    font: inherit;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: inherit;
  }

  .pickers select:disabled {
    opacity: 0.5;
  }

  .swap {
    align-self: end;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: inherit;
    font-size: 1rem;
    cursor: pointer;
  }

  .swap:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .field textarea {
    resize: vertical;
    min-height: 3.2rem;
  }

  .actions {
    display: flex;
    gap: 0.4rem;
  }

  button {
    padding: 0.4rem 0.8rem;
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

  button.primary {
    background: #2a6fdb;
    border-color: #2a6fdb;
    color: white;
  }

  button.primary:disabled {
    background: #555;
    border-color: #555;
  }

  button.secondary {
    margin-left: auto;
    border-color: #2a6fdb;
    color: #2a6fdb;
  }

  button.secondary:hover {
    background: rgba(42, 111, 219, 0.1);
  }

  button.small {
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
  }

  .result {
    border: 1px solid #333;
    border-radius: 6px;
    padding: 0.6rem;
  }

  .result-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.3rem;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .result p {
    margin: 0;
    white-space: pre-wrap;
  }

  .status {
    margin: 0;
    font-size: 0.75rem;
    opacity: 0.7;
    word-break: break-word;
  }

  .status.error {
    color: #e57373;
    opacity: 1;
  }
</style>
