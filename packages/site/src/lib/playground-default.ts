// The playground's starting source. Its own module, with nothing else in it: the playground shows
// it the moment the route renders, while the compiler — and the TypeScript it parses with, 9.3 MB
// of source — loads on demand from playground-compile.ts. In one module, importing this string
// would put the compiler in the site's entry chunk, on every page.

export const DEFAULT_SRC = `<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <div class="row">
      <pdx-button variant="primary" @click="inc">Clicked {{ count }} times</pdx-button>
      <pdx-badge :value="count"></pdx-badge>
    </div>
    <p>Doubled: <strong>{{ doubled }}</strong></p>
    <pdx-progress :value="count * 10" max="100" striped></pdx-progress>
  </div>
</template>

<script setup>
@prop title: string = 'Live PDX component';
let count = $signal(0);
const doubled = $derived(count * 2);
function inc() { count++; }
</script>`;
