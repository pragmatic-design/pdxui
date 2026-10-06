// Tests for new DX: decorator + rune model

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';

// ─── Script Analyzer ───────────────────────────────────────────────

describe('script analyzer', () => {
    it('detects new mode from @prop', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'Hello';
            let count = $signal(0);
        `, 'test.pdx');
        expect(analysis.mode).toBe('new');
    });

    it('detects legacy mode without @prop/$signal', () => {
        const analysis = analyzeScript(`
            const props = defineProps({ label: { type: String } });
            return { count };
        `, 'test.pdx');
        expect(analysis.mode).toBe('legacy');
    });

    it('parses @prop with type and default', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'Counter';
            @prop count: number = 0;
            @prop open: boolean = false;
        `, 'test.pdx');

        expect(analysis.props).toEqual([
            { name: 'label', tsType: 'string', runtimeType: 'String', default: "'Counter'" },
            { name: 'count', tsType: 'number', runtimeType: 'Number', default: '0' },
            { name: 'open', tsType: 'boolean', runtimeType: 'Boolean', default: 'false' },
        ]);
    });

    it('parses @prop with array type', () => {
        const analysis = analyzeScript(`@prop items: Item[] = [];`, 'test.pdx');
        expect(analysis.props[0].runtimeType).toBe('Array');
    });

    it('parses @event', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'x';
            @event countChanged: { value: number };
            @event reset: void;
        `, 'test.pdx');

        expect(analysis.events).toEqual([
            { name: 'countChanged', payloadType: '{ value: number }' },
            { name: 'reset', payloadType: 'void' },
        ]);
    });

    it('parses @slot', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'x';
            @slot header;
            @slot default;
        `, 'test.pdx');

        expect(analysis.slots).toEqual([
            { name: 'header' },
            { name: 'default' },
        ]);
    });

    it('detects $signal declarations', () => {
        const analysis = analyzeScript(`
            @prop initial: number = 0;
            let count = $signal(initial);
            let name = $signal('');
        `, 'test.pdx');

        expect(analysis.signals).toEqual([
            { name: 'count', initialExpr: 'initial' },
            { name: 'name', initialExpr: "''" },
        ]);
        expect(analysis.usedFeatures.has('signal')).toBe(true);
    });

    it('detects $derived declarations', () => {
        const analysis = analyzeScript(`
            @prop x: number = 0;
            let count = $signal(0);
            const doubled = $derived(count * 2);
        `, 'test.pdx');

        expect(analysis.deriveds).toEqual([
            { name: 'doubled', expr: 'count * 2' },
        ]);
        expect(analysis.usedFeatures.has('computed')).toBe(true);
    });

    it('collects auto-expose list', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'x';
            let count = $signal(0);
            const doubled = $derived(count * 2);
            function inc() { count++; }
        `, 'test.pdx');

        const names = analysis.exports.map(e => e.name);
        expect(names).toContain('count');
        expect(names).toContain('doubled');
        expect(names).toContain('inc');
    });

    it('excludes _private variables from exports', () => {
        const analysis = analyzeScript(`
            @prop x: number = 0;
            let count = $signal(0);
            let _internal = 42;
        `, 'test.pdx');

        const names = analysis.exports.map(e => e.name);
        expect(names).toContain('count');
        expect(names).not.toContain('_internal');
    });
});

// ─── Full Compilation (new mode) ───────────────────────────────────

describe('compile new mode', () => {
    it('compiles counter with @prop + $signal', () => {
        const { code } = compile(`
<template>
  <span>{{ count }}</span>
  <button @click="inc">+</button>
</template>

<script setup>
  @prop label: string = 'Counter';
  @prop initial: number = 0;

  let count = $signal(initial);

  function inc() { count++; }
  function dec() { count--; }
</script>`, 'counter.pdx');

        // Props generated correctly
        expect(code).toContain("label: { type: String, default: 'Counter' }");
        expect(code).toContain('initial: { type: Number, default: 0 }');

        // Signal declaration with debug name
        expect(code).toContain('__count = signal(');
        expect(code).toContain("name: 'counter:count'");

        // Mutation rewritten
        expect(code).toContain('__count.set(__v => __v + 1)');
        expect(code).toContain('__count.set(__v => __v - 1)');

        // Auto-return
        expect(code).toContain('count: __count');
        expect(code).toContain('inc');
        expect(code).toContain('dec');

        // No manual return in source
        expect(code).not.toContain('return { count, inc, dec }');

        // Auto-import
        expect(code).toContain('signal');
        expect(code).not.toContain("import { signal } from '@pdxui/core';\n  @prop");
    });

    it('compiles todo with $signal + self-reference', () => {
        const { code } = compile(`
<template>
  @for (items as item; track item.id) {
    <span>{{ item.text }}</span>
  }
</template>

<script setup>
  @prop title: string = 'Todo';

  let items = $signal([{ id: 1, text: 'A' }]);
  let newItem = $signal('');

  function remove(id) {
    items = items.filter(i => i.id !== id);
  }
</script>`, 'todo.pdx');

        // Self-reference: items = items.filter(...) → updater form
        expect(code).toContain('__items.set(prev =>');
        expect(code).toContain('prev.filter');

        // Auto-return includes all
        expect(code).toContain('items: __items');
        expect(code).toContain('newItem: __newItem');
        expect(code).toContain('remove');
    });

    it('compiles $derived correctly', () => {
        const { code } = compile(`
<template><span>{{ doubled }}</span></template>

<script setup>
  @prop x: number = 0;
  let count = $signal(0);
  const doubled = $derived(count * 2);
</script>`, 'test.pdx');

        // The debug name travels with it, the way a signal's does: without it
        // `__pdx_debug.deps()` answers with `(anonymous)` and the instrument is unusable on a page.
        expect(code).toContain("computed(() => __count() * 2, { name: '");
    });

    it('compiles onMount lifecycle', () => {
        const { code } = compile(`
<template><div>test</div></template>

<script setup>
  @prop x: number = 0;
  let count = $signal(0);
  onMount(() => console.log('ready'));
</script>`, 'test.pdx');

        // onMount is a one-shot lifecycle hook, NOT a reactive ctx.track() effect
        expect(code).toContain('onMount(');
        expect(code).toContain("console.log('ready')");
    });

    it('backward compat: legacy mode still works', () => {
        const { code } = compile(`
<template><span>{{ name }}</span></template>

<script setup>
  import { signal } from '@pdxui/core';
  const props = defineProps({ name: { type: String, default: 'World' } });
  const count = signal(0);
  return { count };
</script>`, 'legacy.pdx');

        // Legacy path
        expect(code).toContain("name: { type: String, default: 'World' }");
        expect(code).toContain('return { count }');
    });
});

// ─── DTS Generator ─────────────────────────────────────────────────

describe('DTS generator', () => {
    it('generates props interface', () => {
        const dts = generateDts({
            tag: 'pdx-counter',
            props: [
                { name: 'label', tsType: 'string', runtimeType: 'String', default: "'Counter'" },
                { name: 'initial', tsType: 'number', runtimeType: 'Number', default: '0' },
            ],
            events: [],
            slots: [],
        });

        expect(dts).toContain('export interface PdxCounterProps');
        expect(dts).toContain('label?: string');
        expect(dts).toContain('initial?: number');
        expect(dts).toContain("'pdx-counter': HTMLElement & PdxCounterProps");
    });

    it('generates events interface', () => {
        const dts = generateDts({
            tag: 'pdx-counter',
            props: [],
            events: [{ name: 'countChanged', payloadType: '{ value: number }' }],
            slots: [],
        });

        expect(dts).toContain('export interface PdxCounterEvents');
        expect(dts).toContain('countChanged: { value: number }');
    });

    it('generates slots interface', () => {
        const dts = generateDts({
            tag: 'pdx-card',
            props: [],
            events: [],
            slots: [{ name: 'header' }, { name: 'default' }],
        });

        expect(dts).toContain('export interface PdxCardSlots');
        expect(dts).toContain('header: {}');
        expect(dts).toContain('default: {}');
    });
});
