<script lang="ts">
  import { onMount } from 'svelte';
  import ModelManager from './ModelManager.svelte';
  import {
    addTranslationHistory,
    clearTranslationHistory,
    deleteTranslationHistory,
    loadTranslationHistory,
    type TranslationHistoryEntry,
  } from '@/lib/history';
  import {
    LANGUAGES,
    getTranslationRoute,
    supportedTargets,
  } from '@/lib/engine/registry';
  import { AUTO_DETECT_CODE, detectLanguage } from '@/lib/engine/detection';
  import { onEngineBroadcast, sendTranslateCancel, sendTranslateRequest } from '@/lib/messaging/translate';
  import {
    loadPreferences,
    saveDefaultLanguages,
    savePreferences,
    type Locale,
    type ThemePreference,
  } from '@/lib/settings';
  import { languageLabel, translate, type MessageKey } from '@/lib/i18n';
  import { applyDocumentPreferences } from '@/lib/theme';
  import { consumeTranslatorContext } from '@/lib/messaging/navigation';

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
  let locale = $state<Locale>('en');
  let theme = $state<ThemePreference>('system');
  let text = $state('');
  let result = $state('');
  let resultPair = $state<{ source: string; target: string } | null>(null);
  let status = $state<Status>({ kind: 'idle' });
  let copied = $state(false);
  let settingsOpen = $state(false);
  let modelsOpen = $state(false);
  let settingsSource = $state('en');
  let settingsTarget = $state('es');
  let defaultSaved = $state(false);
  let history = $state<TranslationHistoryEntry[]>([]);
  let activeRequest = $state<ActiveRequest | null>(null);
  let onboardingDialog = $state<HTMLDialogElement | null>(null);

  const availableTargets = $derived(
    source === AUTO_DETECT_CODE
      ? LANGUAGES.map((language) => language.code)
      : supportedTargets(source),
  );
  const settingsTargets = $derived(supportedTargets(settingsSource));
  const busy = $derived(activeRequest !== null);
  const canSwap = $derived(source !== AUTO_DETECT_CODE && getTranslationRoute(target, source) !== undefined);
  const characterCount = $derived(text.length);

  function tx(key: MessageKey, values: Record<string, string | number> = {}): string {
    return translate(key, locale, values);
  }

  function localizedLanguageName(code: string): string {
    return code === AUTO_DETECT_CODE ? tx('autoDetect') : languageLabel(code, locale);
  }

  $effect(() => {
    applyDocumentPreferences(locale, theme);
  });

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const contextId = params.get('context');
    const context = contextId ? await consumeTranslatorContext(contextId).catch(() => undefined) : undefined;
    const [preferences, storedHistory] = await Promise.all([
      loadPreferences(),
      loadTranslationHistory(),
    ]);

    const requestedSource = context?.source ?? params.get('source') ?? preferences.source;
    const requestedTarget = context?.target ?? params.get('target') ?? preferences.target;
    const validSource = requestedSource === AUTO_DETECT_CODE || LANGUAGES.some((language) => language.code === requestedSource)
      ? requestedSource
      : preferences.source;
    const validTargets = validSource === AUTO_DETECT_CODE
      ? LANGUAGES.map((language) => language.code)
      : supportedTargets(validSource);

    source = validSource;
    target = validTargets.includes(requestedTarget) ? requestedTarget : (validTargets[0] ?? preferences.target);
    settingsSource = preferences.source;
    settingsTarget = preferences.target;
    locale = preferences.locale;
    theme = preferences.theme;
    text = context?.text ?? '';
    history = storedHistory;
    loaded = true;
    if (contextId) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('context');
      window.history.replaceState({}, '', cleanUrl);
    }
    if (!preferences.onboardingSeen) setTimeout(openOnboarding, 0);
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
          status = { kind: 'busy', text: tx('queued', { position: message.position }) };
          break;
        case 'translate:progress':
          status = {
            kind: 'busy',
            text:
              message.progress != null
                ? tx('loadingModelProgress', { progress: message.progress.toFixed(0) })
                : tx('loadingModel', { status: message.status }),
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
            text: message.cancelled ? tx('cancelled') : message.error || tx('translationFailed'),
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
    const detectedSource = source === AUTO_DETECT_CODE ? detectLanguage(text) : source;
    if (!detectedSource) {
      status = {
        kind: 'error',
        text: tx('detectorMoreText'),
      };
      return;
    }
    if (!getTranslationRoute(detectedSource, target)) {
      status = {
        kind: 'error',
        text: tx('noLocalModel', {
          source: localizedLanguageName(detectedSource),
          target: localizedLanguageName(target),
        }),
      };
      return;
    }

    result = '';
    resultPair = null;
    copied = false;
    const id = sendTranslateRequest(text, detectedSource, target);
    activeRequest = { id, text, source: detectedSource, target };
    status = {
      kind: 'busy',
      text:
        source === AUTO_DETECT_CODE
          ? tx('detectedPreparing', { language: localizedLanguageName(detectedSource) })
          : tx('preparingModel'),
    };
  }

  function cancelTranslate(): void {
    if (!activeRequest) return;
    sendTranslateCancel(activeRequest.id);
    status = { kind: 'busy', text: tx('cancelling') };
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
      status = { kind: 'error', text: tx('couldNotCopy') };
    }
  }

  async function saveSettings(): Promise<void> {
    if (!getTranslationRoute(settingsSource, settingsTarget)) {
      settingsTarget = settingsTargets[0] ?? settingsTarget;
    }
    await saveDefaultLanguages({ source: settingsSource, target: settingsTarget });
    await savePreferences({ locale, theme });
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
    if (!window.confirm(tx('clearHistoryConfirm'))) return;
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

  function displayLanguageName(code: string): string {
    return localizedLanguageName(code);
  }

  function openOnboarding(): void {
    if (onboardingDialog && !onboardingDialog.open) {
      onboardingDialog.showModal();
      onboardingDialog.querySelector<HTMLButtonElement>('.button-primary')?.focus();
    }
  }

  async function completeOnboarding(): Promise<void> {
    await savePreferences({ onboardingSeen: true });
    onboardingDialog?.close();
  }

  async function saveAppearance(): Promise<void> {
    await savePreferences({ locale, theme });
  }
</script>

<svelte:head>
  <title>{tx('appTitle')}</title>
  <meta name="description" content={tx('appDescription')} />
</svelte:head>

<a class="skip-link" href="#workspace">{tx('skipToWorkspace')}</a>

<div class="page-shell">
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <header class="topbar">
    <div class="brand-lockup" aria-label="Translatly home">
      <span class="brand-mark">T<span>.</span></span>
      <span class="brand-name">Translatly</span>
      <span class="brand-note">{tx('localDesk')}</span>
    </div>

    <div class="topbar-actions">
      <span class="privacy-chip"><span class="pulse-dot" aria-hidden="true"></span> {tx('inferenceLocal')}</span>
      <button
        class:active={settingsOpen}
        class="settings-toggle"
        onclick={() => (settingsOpen = !settingsOpen)}
        aria-expanded={settingsOpen}
        aria-controls="settings-panel"
      >
        <span class="settings-icon" aria-hidden="true">✳</span>
        {tx('settings')}
      </button>
      <button
        class:active={modelsOpen}
        class="settings-toggle"
        onclick={() => (modelsOpen = !modelsOpen)}
        aria-expanded={modelsOpen}
        aria-controls="models-panel"
      >
        <span class="settings-icon" aria-hidden="true">◒</span>
        {tx('models')}
      </button>
    </div>
  </header>

  <main id="main-content">
    <section class="hero" aria-labelledby="page-title">
      <div>
        <p class="eyebrow">{tx('heroEyebrow')}</p>
        <h1 id="page-title">{tx('heroTitleLead')}<br /><em>{tx('heroTitleAccent')}</em></h1>
      </div>
      <p class="hero-copy">{tx('heroCopy')}</p>
    </section>

    {#if settingsOpen}
      <section id="settings-panel" class="settings-panel" aria-labelledby="settings-title">
        <div class="settings-heading">
          <div>
            <p class="eyebrow">{tx('preferencesEyebrow')}</p>
            <h2 id="settings-title">{tx('defaultPair')}</h2>
          </div>
          <p class="settings-note">{tx('usedByPopup')}</p>
        </div>

        <div class="settings-form">
          <label class="select-field">
            <span>{tx('translateFrom')}</span>
            <select bind:value={settingsSource}>
              {#each LANGUAGES as language (language.code)}
                <option value={language.code}>{localizedLanguageName(language.code)}</option>
              {/each}
            </select>
          </label>

          <span class="settings-arrow" aria-hidden="true">→</span>

          <label class="select-field">
            <span>{tx('translateTo')}</span>
            <select bind:value={settingsTarget} disabled={settingsTargets.length === 0}>
              {#each settingsTargets as code (code)}
                <option value={code}>{localizedLanguageName(code)}</option>
              {/each}
            </select>
          </label>

          <button class="button button-dark" onclick={saveSettings}>
            {defaultSaved ? tx('saved') : tx('saveDefaults')}
          </button>
        </div>
        <div class="appearance-form">
          <label class="select-field">
            <span>{tx('language')}</span>
            <select bind:value={locale} onchange={saveAppearance}>
              <option value="en">{tx('english')}</option>
              <option value="es">{tx('spanish')}</option>
            </select>
          </label>
          <label class="select-field">
            <span>{tx('theme')}</span>
            <select bind:value={theme} onchange={saveAppearance}>
              <option value="system">{tx('themeSystem')}</option>
              <option value="light">{tx('themeLight')}</option>
              <option value="dark">{tx('themeDark')}</option>
            </select>
          </label>
        </div>
      </section>
    {/if}

    {#if modelsOpen}
      <div id="models-panel"><ModelManager locale={locale} /></div>
    {/if}

    <dialog
      class="onboarding-dialog"
      bind:this={onboardingDialog}
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-intro"
    >
      <div class="onboarding-content">
        <p class="eyebrow">{tx('localDesk')}</p>
        <h2 id="onboarding-title">{tx('onboardingTitle')}</h2>
        <p id="onboarding-intro" class="onboarding-intro">{tx('onboardingIntro')}</p>
        <div class="onboarding-grid">
          <article>
            <span class="onboarding-number">01</span>
            <h3>{tx('onboardingPrivacyTitle')}</h3>
            <p>{tx('onboardingPrivacyCopy')}</p>
          </article>
          <article>
            <span class="onboarding-number">02</span>
            <h3>{tx('onboardingLanguagesTitle')}</h3>
            <p>{tx('onboardingLanguagesCopy')}</p>
          </article>
          <article>
            <span class="onboarding-number">03</span>
            <h3>{tx('onboardingModelsTitle')}</h3>
            <p>{tx('onboardingModelsCopy')}</p>
          </article>
        </div>
        <div class="onboarding-actions">
          <button class="text-button" type="button" onclick={() => void completeOnboarding()}>
            {tx('onboardingSkip')}
          </button>
          <button class="button button-primary" type="button" onclick={() => void completeOnboarding()}>
            {tx('onboardingStart')} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </dialog>

    <section id="workspace" class="workspace" aria-labelledby="workspace-title" tabindex="-1">
      <div class="workspace-heading">
        <div>
          <p class="eyebrow">{tx('workspaceEyebrow')}</p>
          <h2 id="workspace-title">{tx('workspaceTitle')}</h2>
        </div>
        <div class="shortcut-hint"><kbd>⌘</kbd><kbd>↵</kbd> {tx('shortcut')}</div>
      </div>

      <div class="language-bar">
        <label class="language-select">
          <span>{tx('source')}</span>
          <select bind:value={source} disabled={busy}>
            <option value={AUTO_DETECT_CODE}>{tx('autoDetect')}</option>
            {#each LANGUAGES as language (language.code)}
              <option value={language.code}>{localizedLanguageName(language.code)}</option>
            {/each}
          </select>
        </label>

        <button
          class="swap-button"
          onclick={swapLanguages}
          disabled={busy || !canSwap}
          title={tx('swapLanguages')}
          aria-label={tx('swapLanguages')}
        >
          ⇄
        </button>

        <label class="language-select">
          <span>{tx('target')}</span>
          <select bind:value={target} disabled={busy || availableTargets.length === 0}>
            {#each availableTargets as code (code)}
              <option value={code}>{localizedLanguageName(code)}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="editor-grid">
        <section class="editor-card input-card" aria-labelledby="input-title">
          <div class="editor-meta">
            <span id="input-title" class="editor-label">{tx('original')}</span>
            <span class="editor-count">{tx('characters', { count: characterCount.toString().padStart(4, '0') })}</span>
          </div>
          <textarea
            bind:value={text}
            onkeydown={handleEditorKeydown}
            aria-label={tx('textToTranslate')}
            placeholder={tx('textPlaceholder')}
            maxlength="5000"
          ></textarea>
          <div class="editor-footer">
            <span>{displayLanguageName(source)} · {tx('staysOnDevice')}</span>
            {#if text}
              <button class="text-button" onclick={() => (text = '')}>{tx('clear')}</button>
            {/if}
          </div>
        </section>

        <div class="flow-marker" aria-hidden="true">↗</div>

        <section class="editor-card output-card" aria-labelledby="output-title" aria-live="polite">
          <div class="editor-meta">
            <span id="output-title" class="editor-label">{tx('translation')}</span>
            {#if resultPair}
              <span class="editor-count">{localizedLanguageName(resultPair.target)}</span>
            {:else}
              <span class="editor-count">{tx('readyWhenYouAre')}</span>
            {/if}
          </div>
          <div class="output-content">
            {#if result}
              <p class="result-text">{result}</p>
            {:else}
              <p class="output-placeholder">{tx('outputPlaceholder')}</p>
            {/if}
          </div>
          <div class="editor-footer">
            <span>{resultPair ? localizedLanguageName(resultPair.source) + ' → ' + localizedLanguageName(resultPair.target) : tx('localModelOutput')}</span>
            {#if result}
              <button class="text-button" onclick={copyResult}>{copied ? tx('copied') : tx('copy')}</button>
            {/if}
          </div>
        </section>
      </div>

      <div class="action-row">
        <div class="action-status" class:error={status.kind === 'error'} aria-live="polite" role={status.kind === 'error' ? 'alert' : 'status'}>
          {#if status.kind === 'busy'}
            <span class="status-spinner" aria-hidden="true"></span>
            {status.text}
          {:else if status.kind === 'error'}
            <span aria-hidden="true">!</span>
            {status.text}
          {:else}
            <span class="status-check" aria-hidden="true">✓</span>
            {tx('readyLocal')}
          {/if}
        </div>
        <div class="action-buttons">
          {#if busy}
            <button class="button button-quiet" onclick={cancelTranslate}>{tx('cancel')}</button>
          {/if}
          <button class="button button-primary" onclick={runTranslate} disabled={busy || !text.trim()}>
            {busy ? tx('working') : tx('translate')}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </section>

    <section class="bottom-grid">
      <section class="history-panel" aria-labelledby="history-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{tx('recentWorkEyebrow')}</p>
            <h2 id="history-title">{tx('history')}</h2>
          </div>
          {#if history.length > 0}
            <button class="text-button" onclick={removeAllHistory}>{tx('clearAll')}</button>
          {/if}
        </div>

        {#if history.length === 0}
          <div class="empty-history">
            <span class="empty-mark" aria-hidden="true">∿</span>
            <p>{tx('emptyHistory')}</p>
            <span>{tx('storedLocally', { count: MAX_HISTORY_ENTRIES })}</span>
          </div>
        {:else}
          <div class="history-list">
            {#each history as entry (entry.id)}
              <div class="history-row">
                <button class="history-main" onclick={() => loadHistoryEntry(entry)}>
                  <span class="history-pair">{localizedLanguageName(entry.source)} <b>→</b> {localizedLanguageName(entry.target)}</span>
                  <span class="history-text">{entry.text}</span>
                  <span class="history-date">{formatDate(entry.createdAt)}</span>
                </button>
                <button
                  class="delete-button"
                  onclick={() => removeHistoryEntry(entry.id)}
                  aria-label={tx('deleteHistory', { date: formatDate(entry.createdAt) })}
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <aside class="local-panel" aria-labelledby="local-title">
        <p class="eyebrow">{tx('localPromiseEyebrow')}</p>
        <h2 id="local-title">{tx('nothingLeavesLead')}<br /><em>{tx('nothingLeavesAccent')}</em></h2>
        <p class="local-copy">{tx('localCopy')}</p>
        <div class="local-stamp">
          <span class="stamp-line"></span>
          <span>{tx('localStamp')}</span>
        </div>
      </aside>
    </section>
  </main>

  <footer class="page-footer">
    <span>{tx('footerLeft')}</span>
    <span>{tx('footerRight')}</span>
  </footer>
</div>

<style>
  :global(:root) {
    --canvas: #f2eee4;
    --ink: #112337;
    --accent: #ed7259;
    --paper: #fffdf7;
    --sage: #d9e6dd;
    --sand: #ebe5d7;
    --ambient-one: #e6c6b6;
    --ambient-two: #cad9ce;
    --accent-soft: #f5ddd6;
    --deep: #112337;
    --deep-text: #fffdf7;
    --deep-muted: #b0c2ba;
  }

  :global(:root[data-theme='dark']) {
    --canvas: #101a24;
    --ink: #f4f0e8;
    --accent: #ff947c;
    --paper: #182733;
    --sage: #244039;
    --sand: #26343d;
    --ambient-one: #3e2e35;
    --ambient-two: #1d3a3b;
    --accent-soft: #4a2d2d;
    --deep: #08131d;
    --deep-text: #f4f0e8;
    --deep-muted: #b0c2ba;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root[data-theme='system']) {
      --canvas: #101a24;
      --ink: #f4f0e8;
      --accent: #ff947c;
      --paper: #182733;
      --sage: #244039;
      --sand: #26343d;
      --ambient-one: #3e2e35;
      --ambient-two: #1d3a3b;
      --accent-soft: #4a2d2d;
      --deep: #08131d;
      --deep-text: #f4f0e8;
      --deep-muted: #b0c2ba;
    }
  }

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
    background: var(--canvas);
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
    background: var(--ambient-one);
  }

  .ambient-two {
    bottom: 18rem;
    left: -16rem;
    width: 30rem;
    height: 30rem;
    background: var(--ambient-two);
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
    background: var(--ink);
    color: var(--canvas);
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .brand-mark span {
    color: var(--accent);
  }

  .brand-name {
    color: var(--ink);
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
    color: var(--ink);
    font-size: 0.78rem;
    transition: 180ms ease;
  }

  .settings-toggle:hover,
  .settings-toggle.active {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--canvas);
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
    color: var(--accent);
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
    color: var(--ink);
    font-size: clamp(4rem, 8vw, 7.7rem);
    line-height: 0.82;
  }

  h1 em,
  h2 em {
    color: var(--accent);
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
    color: var(--ink);
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
    background: var(--paper);
    color: var(--ink);
  }

  select:focus,
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 0.18rem rgba(237, 114, 89, 0.14);
  }

  .settings-arrow {
    align-self: end;
    padding: 0 0.1rem 0.75rem;
    color: var(--accent);
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
    background: var(--sand);
    color: var(--ink);
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
    border-bottom: 2px solid var(--ink);
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
    background: var(--sand);
    color: var(--ink);
    font-size: 1.2rem;
    line-height: 1;
    transition: 180ms ease;
  }

  .swap-button:hover:not(:disabled) {
    transform: rotate(180deg);
    background: var(--accent);
    color: var(--paper);
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
    background: var(--paper);
  }

  .output-card {
    background: var(--sage);
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
    color: var(--accent);
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
    color: var(--ink);
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
    color: var(--ink);
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
    color: var(--accent);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .text-button:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .flow-marker {
    display: grid;
    place-items: center;
    align-self: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--paper);
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
    color: var(--paper);
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
    background: var(--accent);
    color: var(--paper);
  }

  .button-primary:hover:not(:disabled) {
    background: var(--ink);
    transform: translateY(-0.1rem);
  }

  .button-dark {
    align-self: end;
    background: var(--ink);
    color: var(--paper);
  }

  .button-dark:hover:not(:disabled),
  .button-quiet:hover:not(:disabled) {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .button-quiet {
    border-color: rgba(17, 35, 55, 0.18);
    background: transparent;
    color: var(--ink);
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
    color: var(--accent);
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
    color: var(--ink);
    text-align: left;
  }

  .history-main:hover .history-text {
    color: var(--accent);
  }

  .history-pair,
  .history-date {
    color: #718083;
    font-size: 0.61rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .history-pair b {
    color: var(--accent);
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
    background: var(--accent-soft);
    color: #be5747;
  }

  .local-panel {
    position: relative;
    overflow: hidden;
    background: var(--deep);
    color: var(--deep-text);
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
    color: var(--deep-text);
    font-size: 2.7rem;
    line-height: 0.93;
  }

  .local-copy {
    position: relative;
    z-index: 1;
    max-width: 280px;
    margin-bottom: 2.7rem;
    color: var(--deep-muted);
    font-size: 0.86rem;
    line-height: 1.7;
  }

  .local-stamp {
    position: relative;
    z-index: 1;
    gap: 0.8rem;
    color: var(--deep-text);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    line-height: 1.45;
    text-transform: uppercase;
    white-space: pre-line;
  }

  .stamp-line {
    width: 2.5rem;
    height: 1px;
    background: var(--accent);
  }

  .page-footer {
    justify-content: space-between;
    gap: 1rem;
    padding: 1.4rem 0 1.8rem;
    color: #84908d;
    font-size: 0.58rem;
    letter-spacing: 0.08em;
  }

  .skip-link {
    position: fixed;
    z-index: 20;
    top: -4rem;
    left: 1rem;
    padding: 0.7rem 1rem;
    border-radius: 0.25rem;
    background: var(--deep);
    color: var(--deep-text);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.72rem;
    transition: top 160ms ease;
  }

  .skip-link:focus {
    top: 1rem;
  }

  .appearance-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(17, 35, 55, 0.12);
  }

  .onboarding-dialog {
    width: min(720px, calc(100% - 2rem));
    padding: 0;
    border: 1px solid rgba(17, 35, 55, 0.18);
    border-radius: 0.55rem;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 2rem 6rem rgba(9, 19, 29, 0.28);
  }

  .onboarding-dialog::backdrop {
    background: rgba(9, 19, 29, 0.56);
    backdrop-filter: blur(3px);
  }

  .onboarding-content {
    padding: clamp(1.5rem, 4vw, 2.8rem);
  }

  .onboarding-content h2 {
    max-width: 520px;
    margin-bottom: 0.8rem;
    font-size: clamp(2.1rem, 6vw, 3.8rem);
    line-height: 0.95;
  }

  .onboarding-intro {
    max-width: 540px;
    color: #647276;
    line-height: 1.6;
  }

  .onboarding-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin: 2rem 0;
  }

  .onboarding-grid article {
    padding-top: 0.8rem;
    border-top: 1px solid rgba(17, 35, 55, 0.18);
  }

  .onboarding-number {
    color: var(--accent);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.68rem;
  }

  .onboarding-grid h3 {
    margin: 0.7rem 0 0.45rem;
    color: var(--ink);
    font-family: 'Iowan Old Style', Baskerville, Georgia, serif;
    font-size: 1.25rem;
    font-weight: 400;
    letter-spacing: -0.035em;
  }

  .onboarding-grid p {
    margin: 0;
    color: #647276;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .onboarding-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  button:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  .history-main:focus-visible,
  .skip-link:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
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

    .appearance-form {
      grid-template-columns: 1fr 1fr;
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

    .onboarding-grid {
      grid-template-columns: 1fr;
      gap: 1.2rem;
    }

    .onboarding-actions {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .onboarding-actions .button,
    .onboarding-actions .text-button {
      width: 100%;
    }
  }
</style>
