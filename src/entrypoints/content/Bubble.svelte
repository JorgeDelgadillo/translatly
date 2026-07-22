<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { EngineBroadcast } from '@/lib/messaging/protocol';

  type Status = 'idle' | 'translating' | 'done' | 'error';

  interface Props {
    text: string;
    source: string;
    target: string;
    requestId: string;
    onClose: () => void;
  }

  let { text, source, target, requestId, onClose }: Props = $props();

  let status = $state<Status>('translating');
  let translation = $state('');
  let errorMessage = $state('');
  let copied = $state(false);

  $effect(() => {
    const listener = (msg: unknown) => {
      if (!isEngineBroadcast(msg)) return;
      if (msg.requestId !== requestId) return;

      switch (msg.type) {
        case 'translate:result':
          status = 'done';
          translation = msg.translation;
          break;
        case 'translate:error':
          status = 'error';
          errorMessage = msg.error;
          break;
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  });

  async function copyTranslation() {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      errorMessage = 'Failed to copy';
    }
  }

  function openFullPage() {
    // TODO: implement in phase 6
    console.log('Open full page (not implemented yet)');
  }

  function isEngineBroadcast(msg: unknown): msg is EngineBroadcast {
    return (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      ['translate:queued', 'translate:progress', 'translate:result', 'translate:error'].includes(
        msg.type as string,
      )
    );
  }
</script>

<div class="bubble">
  <div class="header">
    <span class="lang">{source} → {target}</span>
    <button class="close" onclick={onClose} aria-label="Close">×</button>
  </div>

  {#if status === 'translating'}
    <div class="content translating">Translating...</div>
  {:else if status === 'error'}
    <div class="content error">{errorMessage}</div>
  {:else if status === 'done'}
    <div class="content done">
      <p class="translation">{translation}</p>
      <div class="actions">
        <button onclick={copyTranslation}>{copied ? 'Copied!' : 'Copy'}</button>
        <button onclick={openFullPage}>Open in full page</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .bubble {
    position: fixed;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 400px;
    min-width: 200px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 2147483647;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
    background: #f9f9f9;
    border-radius: 8px 8px 0 0;
  }

  .lang {
    font-size: 12px;
    color: #666;
    font-weight: 500;
  }

  .close {
    background: none;
    border: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: #999;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close:hover {
    color: #333;
  }

  .content {
    padding: 12px;
  }

  .translating {
    color: #666;
    font-style: italic;
  }

  .error {
    color: #d32f2f;
    font-size: 13px;
  }

  .done .translation {
    margin: 0 0 12px 0;
    line-height: 1.5;
    color: #333;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
    color: #333;
    transition: all 0.2s;
  }

  .actions button:hover {
    background: #f5f5f5;
    border-color: #ccc;
  }
</style>
