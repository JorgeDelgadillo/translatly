<script lang="ts">
  import { onMount } from 'svelte';
  import {
    addTranslationHistory,
    clearTranslationHistory,
    deleteTranslationHistory,
    loadTranslationHistory,
    type TranslationHistoryEntry,
  } from '@/lib/history';
  import { LANGUAGES, getPair, languageName, supportedTargets } from '@/lib/engine/registry';
  import { onEngineBroadcast, sendTranslateCancel, sendTranslateRequest } from '@/lib/messaging/translate';
  import { loadDefaultLanguages, saveDefaultLanguages } from '@/lib/settings';

  type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; text: string }
    | { kind: 'error'; text: string };

  interface ActiveRequest {
    id: string;
    text: string;
    source: string;
    target: string;
  }

  const MAX_HISTORY_ENTRIES = 50;

  let loaded = $state(false);
  let source = $state('en');
  let target = $state('es');
  let text = $state('');
  let result = $state('');
  let resultPair = $state<{ source: string; target: string } | null>(null);
  let status = $state<Status>({ kind: 'idle' });
  let copied = $state(false);
  let settingsOpen = $state(false);
  let settingsSource = $state('en');
  let settingsTarget = $state('es');
  let defaultSaved = $state(false);
  let history = $state<TranslationHistoryEntry[]>([]);
  let activeRequest = $state<ActiveRequest | null>(null);

  const availableTargets = $derived(supportedTargets(source));
  const settingsTargets = $derived(supportedTargets(settingsSource));
  const busy = $derived(activeRequest !== null);
  const canSwap = $derived(getPair(target, source) !== undefined);
  const characterCount = $derived(text.length);

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const [defaults, storedHistory] = await Promise.all([
      loadDefaultLanguages(),
      loadTranslationHistory(),
    ]);

    const requestedSource = params.get('source') ?? defaults.source;
    const requestedTarget = params.get('target') ?? defaults.target;
    const validSource = LANGUAGES.some((language) => language.code === requestedSource)
      ? requestedSource
      : defaults.source;
    const validTargets = supportedTargets(validSource);

    source = validSource;
    target = validTargets.includes(requestedTarget) ? requestedTarget : (validTargets[0] ?? defaults.target);
    settingsSource = defaults.source;
    settingsTarget = defaults.target;
    text = params.get('text') ?? '';
    history = storedHistory;
    loaded = true;
  });

  $effect(() => {
    if (!loaded) return;
    if (availableTargets.length > 0 && !availableTargets.includes(target)) {
      target = availableTargets[0]!;
    }
  });

  $effect(() => {
    if (!loaded) return;
    if (settingsTargets.length > 0 && !settingsTargets.includes(settingsTarget)) {
      settingsTarget = settingsTargets[0]!;
    }
  });

  $effect(() => {
    const off = onEngineBroadcast((message) => {
      if (activeRequest == null || message.requestId !== activeRequest.id) return;

      switch (message.type) {
        case 'translate:queued':
          status = { kind: 'busy', text: `Queued · position ${message.position}` };
          break;
        case 'translate:progress':
          status = {
            kind: 'busy',
            text:
              message.progress != null
                ? `Loading model · ${message.progress.toFixed(0)}%`
                : `Loading model · ${message.status}`,
          };
          break;
        case 'translate:result': {
          const completedRequest = activeRequest;
          result = message.translation;
          resultPair = {
            source: completedRequest.source,
            target: completedRequest.target,
          };
          status = { kind: 'idle' };
          activeRequest = null;
          copied = false;
          void persistResult(completedRequest, message.translation);
          break;
        }
        case 'translate:error':
          status = {
            kind: 'error',
            text: message.cancelled ? 'Translation cancelled' : message.error || 'Translation failed',
          };
          activeRequest = null;
          break;
      }
    });
    return off;
  });

  async function persistResult(request: ActiveRequest, translation: string): Promise<void> {
    const entry = await addTranslationHistory({
      text: request.text,
      translation,
      source: request.source,
      target: request.target,
    });
    history = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
  }

  function runTranslate(): void {
    if (busy || !text.trim() || !source || !target) return;
    if (!getPair(source, target)) {
      status = {
        kind: 'error',
        text: `No local model for ${languageName(source)} → ${languageName(target)}`,
      };
      return;
    }

    result = '';
    resultPair = null;
    copied = false;
    const id = sendTranslateRequest(text, source, target);
    activeRequest = { id, text, source, target };
    status = { kind: 'busy', text: 'Preparing local model…' };
  }

  function cancelTranslate(): void {
    if (!activeRequest) return;
    sendTranslateCancel(activeRequest.id);
    status = { kind: 'busy', text: 'Cancelling…' };
  }

  function swapLanguages(): void {
    if (!canSwap || busy) return;
    const previousSource = source;
    source = target;
    target = previousSource;
    result = '';
    resultPair = null;
  }

  function handleEditorKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      runTranslate();
    }
  }

  async function copyResult(): Promise<void> {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      status = { kind: 'error', text: 'Could not copy to clipboard' };
    }
  }

  async function saveSettings(): Promise<void> {
    if (!getPair(settingsSource, settingsTarget)) {
      settingsTarget = settingsTargets[0] ?? settingsTarget;
    }
    await saveDefaultLanguages({ source: settingsSource, target: settingsTarget });
    defaultSaved = true;
    setTimeout(() => (defaultSaved = false), 1800);
  }

  function loadHistoryEntry(entry: TranslationHistoryEntry): void {
    source = entry.source;
    target = entry.target;
    text = entry.text;
    result = entry.translation;
    resultPair = { source: entry.source, target: entry.target };
    status = { kind: 'idle' };
    settingsOpen = false;
  }

  async function removeHistoryEntry(id: string): Promise<void> {
    await deleteTranslationHistory(id);
    history = history.filter((entry) => entry.id !== id);
  }

  async function removeAllHistory(): Promise<void> {
    if (!window.confirm('Clear all local translation history?')) return;
    await clearTranslationHistory();
    history = [];
  }

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp);
  }
</script>

<svelte:head>
  <title>Translatly — Translation desk</title>
  <meta
    name="description"
    content="Private, local machine translation with a persistent translation desk."
  />
</svelte:head>

<div class="page-shell">
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <header class="topbar">
    <div class="brand-lockup" aria-label="Translatly home">
      <span class="brand-mark">T<span>.</span></span>
      <span class="brand-name">Translatly</span>
      <span class="brand-note">/ local desk</span>
    </div>

    <div class="topbar-actions">
      <span class="privacy-chip"><span class="pulse-dot"></span> Inference stays here</span>
      <button
        class:active={settingsOpen}
        class="settings-toggle"
        onclick={() => (settingsOpen = !settingsOpen)}
        aria-expanded={settingsOpen}
      >
        <span class="settings-icon" aria-hidden="true">✳</span>
        Settings
      </button>
    </div>
  </header>

  <main>
    <section class="hero" aria-labelledby="page-title">
      <div>
        <p class="eyebrow">Private translation / 01</p>
        <h1 id="page-title">Find the right<br /><em>words.</em></h1>
      </div>
      <p class="hero-copy">
        A quiet translation desk powered by local models. Your words stay on this device — from first
        draft to final copy.
      </p>
    </section>

    {#if settingsOpen}
      <section class="settings-panel" aria-labelledby="settings-title">
        <div class="settings-heading">
          <div>
            <p class="eyebrow">Preferences / 02</p>
            <h2 id="settings-title">Your default pair</h2>
          </div>
          <p class="settings-note">Used by the popup and selection bubble.</p>
        </div>

        <div class="settings-form">
          <label class="select-field">
            <span>Translate from</span>
            <select bind:value={settingsSource}>
              {#each LANGUAGES as language (language.code)}
                <option value={language.code}>{language.name}</option>
              {/each}
            </select>
          </label>

          <span class="settings-arrow" aria-hidden="true">→</span>

          <label class="select-field">
            <span>Translate to</span>
            <select bind:value={settingsTarget} disabled={settingsTargets.length === 0}>
              {#each settingsTargets as code (code)}
                <option value={code}>{languageName(code)}</option>
              {/each}
            </select>
          </label>

          <button class="button button-dark" onclick={saveSettings}>
            {defaultSaved ? 'Saved' : 'Save defaults'}
          </button>
        </div>
      </section>
    {/if}

    <section class="workspace" aria-labelledby="workspace-title">
      <div class="workspace-heading">
        <div>
          <p class="eyebrow">Translation desk / 03</p>
          <h2 id="workspace-title">Make it understood.</h2>
        </div>
        <div class="shortcut-hint"><kbd>⌘</kbd><kbd>↵</kbd> to translate</div>
      </div>

      <div class="language-bar">
        <label class="language-select">
          <span>Source</span>
          <select bind:value={source} disabled={busy}>
            {#each LANGUAGES as language (language.code)}
              <option value={language.code}>{language.name}</option>
            {/each}
          </select>
        </label>

        <button
          class="swap-button"
          onclick={swapLanguages}
          disabled={busy || !canSwap}
          title="Swap languages"
          aria-label="Swap languages"
        >
          ⇄
        </button>

        <label class="language-select">
          <span>Target</span>
          <select bind:value={target} disabled={busy || availableTargets.length === 0}>
            {#each availableTargets as code (code)}
              <option value={code}>{languageName(code)}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="editor-grid">
        <section class="editor-card input-card" aria-labelledby="input-title">
          <div class="editor-meta">
            <span id="input-title" class="editor-label">01 / Original</span>
            <span class="editor-count">{characterCount.toString().padStart(4, '0')} chars</span>
          </div>
          <textarea
            bind:value={text}
            onkeydown={handleEditorKeydown}
            aria-label="Text to translate"
            placeholder="Write, paste, or select a thought to begin…"
            maxlength="5000"
          ></textarea>
          <div class="editor-footer">
            <span>{languageName(source)} · stays on device</span>
            {#if text}
              <button class="text-button" onclick={() => (text = '')}>Clear</button>
            {/if}
          </div>
        </section>

        <div class="flow-marker" aria-hidden="true">↗</div>

        <section class="editor-card output-card" aria-labelledby="output-title" aria-live="polite">
          <div class="editor-meta">
            <span id="output-title" class="editor-label">02 / Translation</span>
            {#if resultPair}
              <span class="editor-count">{languageName(resultPair.target)}</span>
            {:else}
              <span class="editor-count">Ready when you are</span>
            {/if}
          </div>
          <div class="output-content">
            {#if result}
              <p class="result-text">{result}</p>
            {:else}
              <p class="output-placeholder">Your translation will appear here, with no server in between.</p>
            {/if}
          </div>
          <div class="editor-footer">
            <span>{resultPair ? `${languageName(resultPair.source)} → ${languageName(resultPair.target)}` : 'Local model output'}</span>
            {#if result}
              <button class="text-button" onclick={copyResult}>{copied ? 'Copied' : 'Copy'}</button>
            {/if}
          </div>
        </section>
      </div>

      <div class="action-row">
        <div class="action-status" class:error={status.kind === 'error'} aria-live="polite">
          {#if status.kind === 'busy'}
            <span class="status-spinner" aria-hidden="true"></span>
            {status.text}
          {:else if status.kind === 'error'}
            <span aria-hidden="true">!</span>
            {status.text}
          {:else}
            <span class="status-check" aria-hidden="true">✓</span>
            Ready for a local translation
          {/if}
        </div>
        <div class="action-buttons">
          {#if busy}
            <button class="button button-quiet" onclick={cancelTranslate}>Cancel</button>
          {/if}
          <button class="button button-primary" onclick={runTranslate} disabled={busy || !text.trim()}>
            {busy ? 'Working…' : 'Translate'}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </section>

    <section class="bottom-grid">
      <section class="history-panel" aria-labelledby="history-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Recent work / 04</p>
            <h2 id="history-title">Translation history</h2>
          </div>
          {#if history.length > 0}
            <button class="text-button" onclick={removeAllHistory}>Clear all</button>
          {/if}
        </div>

        {#if history.length === 0}
          <div class="empty-history">
            <span class="empty-mark" aria-hidden="true">∿</span>
            <p>Your recent translations will collect here.</p>
            <span>Stored locally · up to {MAX_HISTORY_ENTRIES} entries</span>
          </div>
        {:else}
          <div class="history-list">
            {#each history as entry (entry.id)}
              <div class="history-row">
                <button class="history-main" onclick={() => loadHistoryEntry(entry)}>
                  <span class="history-pair">{languageName(entry.source)} <b>→</b> {languageName(entry.target)}</span>
                  <span class="history-text">{entry.text}</span>
                  <span class="history-date">{formatDate(entry.createdAt)}</span>
                </button>
                <button
                  class="delete-button"
                  onclick={() => removeHistoryEntry(entry.id)}
                  aria-label={`Delete translation from ${formatDate(entry.createdAt)}`}
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <aside class="local-panel" aria-labelledby="local-title">
        <p class="eyebrow">The local promise / 05</p>
        <h2 id="local-title">Nothing leaves<br /><em>the desk.</em></h2>
        <p class="local-copy">
          Models download only when you ask for a new pair. Once they arrive, inference happens in this
          browser — private by default.
        </p>
        <div class="local-stamp">
          <span class="stamp-line"></span>
          <span>0 network calls<br />during inference</span>
        </div>
      </aside>
    </section>
  </main>

  <footer class="page-footer">
    <span>TRANSLATLY / LOCAL MACHINE TRANSLATION</span>
    <span>OPUS-MT · WASM · PRIVATE BY DESIGN</span>
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    overflow-x: hidden;
  }

  .page-shell {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    background: #f2eee4;
  }

  .ambient {
    position: absolute;
    z-index: 0;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(1px);
    opacity: 0.55;
  }

  .ambient-one {
    top: -14rem;
    right: -10rem;
    width: 34rem;
    height: 34rem;
    background: #e6c6b6;
  }

  .ambient-two {
    bottom: 18rem;
    left: -16rem;
    width: 30rem;
    height: 30rem;
    background: #cad9ce;
  }

  .topbar,
  main,
  .page-footer {
    position: relative;
    z-index: 1;
    width: min(1240px, calc(100% - 4rem));
    margin: 0 auto;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 0;
    border-bottom: 1px solid rgba(17, 35, 55, 0.14);
  }

  .brand-lockup,
  .topbar-actions,
  .privacy-chip,
  .settings-toggle,
  .language-bar,
  .action-row,
  .action-buttons,
  .editor-footer,
  .section-heading,
  .settings-heading,
  .settings-form,
  .local-stamp,
  .page-footer {
    display: flex;
    align-items: center;
  }

  .brand-lockup {
    gap: 0.6rem;
  }

  .brand-mark {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 50%;
    background: #112337;
    color: #f2eee4;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .brand-mark span {
    color: #ed7259;
  }

  .brand-name {
    color: #112337;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .brand-note,
  .privacy-chip,
  .eyebrow,
  .editor-meta,
  .editor-footer,
  .history-pair,
  .history-date,
  .page-footer,
  .shortcut-hint,
  .settings-note,
  .local-stamp {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  }

  .brand-note {
    color: #6d7779;
    font-size: 0.72rem;
  }

  .topbar-actions {
    gap: 1.2rem;
  }

  .privacy-chip {
    gap: 0.45rem;
    color: #45635c;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .pulse-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: #4e9b79;
    box-shadow: 0 0 0 0.25rem rgba(78, 155, 121, 0.15);
  }

  .settings-toggle {
    gap: 0.45rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid rgba(17, 35, 55, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.3);
    color: #112337;
    font-size: 0.78rem;
    transition: 180ms ease;
  }

  .settings-toggle:hover,
  .settings-toggle.active {
    border-color: #112337;
    background: #112337;
    color: #f2eee4;
  }

  .settings-icon {
    font-size: 0.85rem;
  }

  main {
    padding: 5.5rem 0 4rem;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(250px, 0.56fr);
    gap: 4rem;
    align-items: end;
    padding-bottom: 5rem;
  }

  .eyebrow {
    margin: 0 0 1rem;
    color: #ed7259;
    font-size: 0.66rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1,
  h2 {
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-weight: 400;
    letter-spacing: -0.055em;
  }

  h1 {
    max-width: 680px;
    margin-bottom: 0;
    color: #112337;
    font-size: clamp(4rem, 8vw, 7.7rem);
    line-height: 0.82;
  }

  h1 em,
  h2 em {
    color: #ed7259;
    font-style: italic;
  }

  .hero-copy {
    max-width: 300px;
    margin: 0 0 0.5rem;
    color: #647276;
    font-size: 0.96rem;
    line-height: 1.65;
  }

  .settings-panel,
  .workspace,
  .history-panel,
  .local-panel {
    border: 1px solid rgba(17, 35, 55, 0.15);
    background: rgba(255, 253, 247, 0.7);
    box-shadow: 0 1.4rem 3.8rem rgba(41, 44, 37, 0.06);
  }

  .settings-panel {
    margin-bottom: 2rem;
    padding: 1.4rem 1.6rem 1.5rem;
    border-radius: 0.45rem;
    animation: panel-in 220ms ease both;
  }

  @keyframes panel-in {
    from { opacity: 0; transform: translateY(-0.5rem); }
    to { opacity: 1; transform: translateY(0); }
  }

  .settings-heading {
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.2rem;
  }

  .settings-heading h2,
  .workspace-heading h2,
  .section-heading h2 {
    margin-bottom: 0;
    color: #112337;
    font-size: 1.75rem;
    line-height: 1;
  }

  .settings-note {
    max-width: 245px;
    color: #718083;
    font-size: 0.65rem;
    line-height: 1.5;
    text-align: right;
    text-transform: uppercase;
  }

  .settings-form {
    gap: 0.8rem;
  }

  .select-field,
  .language-select {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.45rem;
  }

  .select-field > span,
  .language-select > span {
    color: #697879;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  select {
    min-width: 0;
    padding: 0.75rem 0.85rem;
    border: 1px solid rgba(17, 35, 55, 0.2);
    border-radius: 0.25rem;
    outline: none;
    background: #fffdf7;
    color: #112337;
  }

  select:focus,
  textarea:focus {
    border-color: #ed7259;
    box-shadow: 0 0 0 0.18rem rgba(237, 114, 89, 0.14);
  }

  .settings-arrow {
    align-self: end;
    padding: 0 0.1rem 0.75rem;
    color: #ed7259;
    font-size: 1.2rem;
  }

  .workspace {
    padding: 1.65rem;
    border-radius: 0.45rem;
  }

  .workspace-heading,
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
  }

  .workspace-heading {
    margin-bottom: 2rem;
  }

  .shortcut-hint {
    color: #7c8989;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  kbd {
    display: inline-grid;
    min-width: 1.35rem;
    height: 1.35rem;
    margin-right: 0.25rem;
    place-items: center;
    border: 1px solid rgba(17, 35, 55, 0.18);
    border-radius: 0.2rem;
    background: #ebe5d7;
    color: #112337;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.7rem;
  }

  .language-bar {
    gap: 0.7rem;
    margin-bottom: 0.7rem;
    padding: 0 0.5rem 1rem;
    border-bottom: 1px solid rgba(17, 35, 55, 0.12);
  }

  .language-select {
    flex: 0 1 11rem;
  }

  .language-select select {
    padding: 0.55rem 0.7rem;
    border: 0;
    border-bottom: 2px solid #112337;
    border-radius: 0;
    background: transparent;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.15rem;
  }

  .swap-button {
    align-self: end;
    width: 2.2rem;
    height: 2.2rem;
    margin-bottom: 0.1rem;
    border: 1px solid rgba(17, 35, 55, 0.2);
    border-radius: 50%;
    background: #ebe5d7;
    color: #112337;
    font-size: 1.2rem;
    line-height: 1;
    transition: 180ms ease;
  }

  .swap-button:hover:not(:disabled) {
    transform: rotate(180deg);
    background: #ed7259;
    color: #fffdf7;
  }

  button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.2rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: stretch;
  }

  .editor-card {
    display: flex;
    min-height: 22rem;
    flex-direction: column;
    padding: 1.25rem;
    border: 1px solid rgba(17, 35, 55, 0.17);
    border-radius: 0.3rem;
  }

  .input-card {
    background: #fffdf7;
  }

  .output-card {
    background: #d9e6dd;
  }

  .editor-meta,
  .editor-footer {
    justify-content: space-between;
    gap: 1rem;
    color: #687877;
    font-size: 0.62rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .editor-label {
    color: #ed7259;
    font-weight: 700;
  }

  .editor-card textarea {
    width: 100%;
    min-height: 13rem;
    flex: 1;
    margin: 1rem 0;
    padding: 0;
    resize: none;
    border: 0;
    outline: none;
    background: transparent;
    color: #112337;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: clamp(1.25rem, 2vw, 1.65rem);
    line-height: 1.35;
  }

  .editor-card textarea::placeholder {
    color: #a6aaa1;
    opacity: 1;
  }

  .output-content {
    min-height: 13rem;
    flex: 1;
    margin: 1rem 0;
  }

  .result-text,
  .output-placeholder {
    margin: 0;
    color: #112337;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: clamp(1.25rem, 2vw, 1.65rem);
    line-height: 1.35;
    white-space: pre-wrap;
  }

  .output-placeholder {
    max-width: 17rem;
    color: #7e9385;
    font-size: 1.05rem;
  }

  .editor-footer {
    padding-top: 0.8rem;
    border-top: 1px solid rgba(17, 35, 55, 0.13);
  }

  .text-button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #ed7259;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .text-button:hover {
    color: #112337;
    text-decoration: underline;
  }

  .flow-marker {
    display: grid;
    place-items: center;
    align-self: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: #ed7259;
    color: #fffdf7;
    font-size: 1.2rem;
  }

  .action-row {
    justify-content: space-between;
    gap: 1rem;
    padding-top: 1rem;
  }

  .action-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #6b7c78;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.66rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .action-status.error {
    color: #be5747;
  }

  .status-check,
  .status-spinner {
    display: inline-grid;
    width: 1.1rem;
    height: 1.1rem;
    place-items: center;
    border-radius: 50%;
    background: #4e9b79;
    color: #fffdf7;
    font-size: 0.65rem;
  }

  .status-spinner {
    border: 2px solid rgba(78, 155, 121, 0.25);
    border-top-color: #4e9b79;
    background: transparent;
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .action-buttons {
    gap: 0.6rem;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    min-height: 2.75rem;
    padding: 0.7rem 1rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    transition: 180ms ease;
  }

  .button-primary {
    min-width: 9.5rem;
    background: #ed7259;
    color: #fffdf7;
  }

  .button-primary:hover:not(:disabled) {
    background: #112337;
    transform: translateY(-0.1rem);
  }

  .button-dark {
    align-self: end;
    background: #112337;
    color: #fffdf7;
  }

  .button-dark:hover:not(:disabled),
  .button-quiet:hover:not(:disabled) {
    border-color: #112337;
    background: #112337;
    color: #fffdf7;
  }

  .button-quiet {
    border-color: rgba(17, 35, 55, 0.18);
    background: transparent;
    color: #112337;
  }

  .bottom-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.75fr);
    gap: 1.2rem;
    margin-top: 1.2rem;
  }

  .history-panel,
  .local-panel {
    padding: 1.65rem;
    border-radius: 0.45rem;
  }

  .section-heading {
    margin-bottom: 1.35rem;
  }

  .empty-history {
    display: grid;
    min-height: 10rem;
    place-items: center;
    align-content: center;
    padding: 1.5rem;
    border: 1px dashed rgba(17, 35, 55, 0.2);
    color: #718083;
    text-align: center;
  }

  .empty-history p {
    margin: 0.4rem 0;
    color: #43575a;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.1rem;
  }

  .empty-history span:last-child {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.62rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .empty-mark {
    color: #ed7259;
    font-size: 2rem;
  }

  .history-list {
    display: grid;
  }

  .history-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    border-top: 1px solid rgba(17, 35, 55, 0.12);
  }

  .history-main {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    padding: 0.9rem 0;
    border: 0;
    background: transparent;
    color: #112337;
    text-align: left;
  }

  .history-main:hover .history-text {
    color: #ed7259;
  }

  .history-pair,
  .history-date {
    color: #718083;
    font-size: 0.61rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .history-pair b {
    color: #ed7259;
    font-weight: 400;
  }

  .history-text {
    overflow: hidden;
    color: #30484b;
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.05rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 160ms ease;
  }

  .delete-button {
    width: 1.6rem;
    height: 1.6rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #899490;
    font-size: 1.1rem;
  }

  .delete-button:hover {
    background: #f5ddd6;
    color: #be5747;
  }

  .local-panel {
    position: relative;
    overflow: hidden;
    background: #112337;
    color: #d9e6dd;
  }

  .local-panel::after {
    position: absolute;
    right: -4rem;
    bottom: -5rem;
    width: 14rem;
    height: 14rem;
    border: 1px solid rgba(217, 230, 221, 0.15);
    border-radius: 50%;
    content: '';
  }

  .local-panel .eyebrow {
    color: #f19b83;
  }

  .local-panel h2 {
    position: relative;
    z-index: 1;
    margin-bottom: 1.3rem;
    color: #fffdf7;
    font-size: 2.7rem;
    line-height: 0.93;
  }

  .local-copy {
    position: relative;
    z-index: 1;
    max-width: 280px;
    margin-bottom: 2.7rem;
    color: #b0c2ba;
    font-size: 0.86rem;
    line-height: 1.7;
  }

  .local-stamp {
    position: relative;
    z-index: 1;
    gap: 0.8rem;
    color: #d9e6dd;
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    line-height: 1.45;
    text-transform: uppercase;
  }

  .stamp-line {
    width: 2.5rem;
    height: 1px;
    background: #ed7259;
  }

  .page-footer {
    justify-content: space-between;
    gap: 1rem;
    padding: 1.4rem 0 1.8rem;
    color: #84908d;
    font-size: 0.58rem;
    letter-spacing: 0.08em;
  }

  @media (max-width: 800px) {
    .topbar,
    main,
    .page-footer {
      width: min(100% - 2rem, 640px);
    }

    main {
      padding-top: 3.5rem;
    }

    .hero {
      grid-template-columns: 1fr;
      gap: 1.5rem;
      padding-bottom: 3rem;
    }

    h1 {
      font-size: clamp(4rem, 18vw, 6rem);
    }

    .hero-copy {
      max-width: 400px;
    }

    .editor-grid,
    .bottom-grid {
      grid-template-columns: 1fr;
    }

    .flow-marker {
      transform: rotate(90deg);
    }

    .settings-form {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .settings-form .select-field {
      flex-basis: calc(50% - 1.5rem);
    }

    .settings-form .button {
      flex: 1;
    }

    .settings-arrow {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .topbar {
      align-items: flex-start;
      gap: 1rem;
    }

    .topbar-actions {
      align-items: flex-end;
      flex-direction: column;
      gap: 0.55rem;
    }

    .privacy-chip {
      font-size: 0.56rem;
    }

    .workspace,
    .history-panel,
    .local-panel {
      padding: 1.1rem;
    }

    .workspace-heading,
    .section-heading,
    .action-row,
    .page-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .shortcut-hint {
      display: none;
    }

    .language-bar {
      align-items: flex-end;
    }

    .language-select {
      flex-basis: 0;
    }

    .action-row,
    .action-buttons,
    .action-buttons .button {
      width: 100%;
    }

    .action-buttons {
      justify-content: flex-end;
    }

    .page-footer {
      gap: 0.4rem;
    }
  }
</style>
