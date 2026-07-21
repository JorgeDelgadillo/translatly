/// <reference types="svelte" />

// Ambient wildcard declaration so TypeScript can resolve `*.svelte` imports.
// svelte-check blanks out the one shipped in `svelte/types`, so we provide our own.
declare module '*.svelte' {
  import { SvelteComponent } from 'svelte';
  import { LegacyComponentType } from 'svelte/legacy';
  const Comp: LegacyComponentType;
  type Comp = SvelteComponent;
  export default Comp;
}
