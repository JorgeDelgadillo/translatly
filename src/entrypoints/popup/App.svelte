<script lang="ts">
  import {
    sendTranslateRequest,
    sendTranslateCancel,
    sendTranslateCancelAll,
    onEngineBroadcast,
  } from '@/lib/messaging/translate';

  // Temporary engine proof-of-concept UI. Replaced by the real quick-translate
  // popup in phase 4. Demonstrates the typed messaging protocol + queue:
  // multiple in-flight jobs, per-job cancellation, queue position, progress.

  type JobStatus = 'queued' | 'running' | 'done' | 'cancelled' | 'error';
  interface Job {
    requestId: string;
    text: string;
    status: JobStatus;
    position?: number;
    progress?: number;
    file?: string;
    result?: string;
    error?: string;
  }

  let text = $state('Hello, how are you?');
  let jobs = $state<Job[]>([]);

  function patch(id: string, change: Partial<Job>) {
    const i = jobs.findIndex((j) => j.requestId === id);
    if (i >= 0) jobs[i] = { ...jobs[i]!, ...change };
  }

  $effect(() => {
    const off = onEngineBroadcast((msg) => {
      switch (msg.type) {
        case 'translate:queued':
          patch(msg.requestId, { status: 'queued', position: msg.position });
          break;
        case 'translate:progress':
          patch(msg.requestId, {
            status: 'running',
            progress: msg.progress,
            file: msg.file,
            position: undefined,
          });
          break;
        case 'translate:result':
          patch(msg.requestId, { status: 'done', result: msg.translation, progress: undefined });
          break;
        case 'translate:error':
          patch(msg.requestId, {
            status: msg.cancelled ? 'cancelled' : 'error',
            error: msg.error,
          });
          break;
      }
    });
    return off;
  });

  function fire(count: number) {
    const t = text;
    for (let i = 0; i < count; i++) {
      const requestId = sendTranslateRequest(t, 'en', 'es');
      jobs = [...jobs, { requestId, text: t, status: 'queued' }];
    }
  }

  function cancel(id: string) {
    sendTranslateCancel(id);
  }

  function cancelAll() {
    sendTranslateCancelAll();
    jobs = jobs.map((j) =>
      j.status === 'done' || j.status === 'error' || j.status === 'cancelled'
        ? j
        : { ...j, status: 'cancelled', error: 'cancelled' },
    );
  }

  function clearFinished() {
    jobs = jobs.filter((j) => j.status !== 'done' && j.status !== 'error' && j.status !== 'cancelled');
  }

  function statusLabel(j: Job): string {
    if (j.status === 'queued') return `queued${j.position ? ` · #${j.position}` : ''}`;
    if (j.status === 'running') {
      if (j.file) return j.progress != null ? `running · ${j.file} ${j.progress.toFixed(0)}%` : `running · ${j.file}`;
      return 'running';
    }
    return j.status;
  }
</script>

<main>
  <h1>Translatly <span>engine PoC</span></h1>

  <label>
    English
    <textarea bind:value={text} rows="2"></textarea>
  </label>

  <div class="actions">
    <button onclick={() => fire(1)} disabled={!text.trim()}>Translate</button>
    <button onclick={() => fire(3)} disabled={!text.trim()}>Translate ×3</button>
    <button onclick={cancelAll} class="danger" disabled={!jobs.some((j) => j.status === 'queued' || j.status === 'running')}>
      Cancel all
    </button>
    <button onclick={clearFinished} disabled={!jobs.some((j) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled')}>
      Clear finished
    </button>
  </div>

  {#if jobs.length === 0}
    <p class="hint">Fire one job, or hit ×3 to watch the queue.</p>
  {:else}
    <ul class="jobs">
      {#each jobs as j (j.requestId)}
        <li class={j.status}>
          <div class="row">
            <code>{j.requestId.slice(0, 8)}</code>
            <span class="status">{statusLabel(j)}</span>
            {#if j.status === 'queued' || j.status === 'running'}
              <button onclick={() => cancel(j.requestId)} class="danger small">Cancel</button>
            {/if}
          </div>
          {#if j.result}
            <output>{j.result}</output>
          {/if}
          {#if j.status === 'error' && j.error}
            <p class="err-text">{j.error}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    min-width: 320px;
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

  textarea {
    font: inherit;
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: inherit;
    resize: vertical;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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

  button.danger {
    border-color: #a44;
  }

  button.small {
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.6;
  }

  .jobs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 320px;
    overflow-y: auto;
  }

  .jobs li {
    border: 1px solid #333;
    border-radius: 6px;
    padding: 0.5rem;
    font-size: 0.8rem;
  }

  .jobs li.done {
    border-color: #4a7;
  }

  .jobs li.error {
    border-color: #a44;
  }

  .jobs li.cancelled {
    border-color: #666;
    opacity: 0.7;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .row code {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .row .status {
    flex: 1;
    word-break: break-all;
  }

  output {
    display: block;
    margin-top: 0.4rem;
    white-space: pre-wrap;
  }

  .err-text {
    margin: 0.4rem 0 0;
    color: #c66;
    font-size: 0.75rem;
  }
</style>
