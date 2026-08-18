<script lang="ts">
  import triggerStyles from './trigger.css?raw';

  interface Props {
    onClick: () => void;
  }

  let { onClick }: Props = $props();
</script>

<svelte:element this={'style'}>{triggerStyles}</svelte:element>

<button
  class="trigger"
  type="button"
  aria-label="Translate with Translatly"
  title="Translate with Translatly"
  onclick={onClick}
>
  <span class="mark" aria-hidden="true">T</span>
</button>
