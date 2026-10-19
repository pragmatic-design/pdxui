// A signal() or computed() written by hand and read bare by the template is reported (#362).
//
// The inline path compiles `{{ name }}` to `bindInterpolation(t, () => ctx.name)`: the signal
// function itself, which the page shows as its source text. The language has one way to declare
// reactive state the template reads, `$signal` / `$derived`, and the compile now says so where the
// other way is used. A hand-written signal the template CALLS (`{{ name() }}`) renders its value, and
// one the template does not read at all is the script's business: neither is reported.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const reported = (source: string) =>
    compile(source, 'hand.pdx').warnings.filter((w) => w.code === 'PDX_HAND_WRITTEN_SIGNAL');

describe('a hand-written signal read by the template', () => {
    it('signal() read bare in an interpolation is reported, with $signal', () => {
        const found = reported(`<template><span>{{ name }}</span></template>
<script>
  const name = signal('World');
</script>`);
        expect(found, 'no diagnostic for a hand-written signal read in {{ }}').toHaveLength(1);
        expect(found[0].severity).toBe('error');
        expect(found[0].message).toContain('name');
        expect(found[0].hint).toContain('$signal');
    });

    it('computed() read bare in a bound attribute is reported, with $derived', () => {
        const found = reported(`<template><span :title="label">x</span></template>
<script>
  let count = $signal(1);
  const label = computed(() => 'n' + count);
</script>`);
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('$derived');
    });

    it('control — one the template calls renders its value, and is not reported', () => {
        expect(reported(`<template><span>{{ name() }}</span><button @click="name.set('x')">x</button></template>
<script>
  const name = signal('World');
</script>`)).toEqual([]);
    });

    it('control — one the template does not read is not reported', () => {
        expect(reported(`<template><span>{{ shown }}</span></template>
<script>
  const cache = signal(0);
  let shown = $signal(1);
</script>`)).toEqual([]);
    });

    it('control — a $signal is not reported', () => {
        expect(reported(`<template><span>{{ name }}</span></template>
<script>
  let name = $signal('World');
</script>`)).toEqual([]);
    });
});
