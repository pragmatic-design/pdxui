// Tests for enhanced dynamic <component> compilation.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('dynamic <component> compilation', () => {
    it('compiles basic <component :is="tag">', () => {
        const source = `
<template>
  <component :is="currentView" />
</template>
<script setup>
let currentView = $signal('pdx-home');
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain('dynamic(');
        expect(result.code).toContain('ctx.currentView()');
    });

    it('compiles <component> with :props', () => {
        const source = `
<template>
  <component :is="view" :items="data" :title="heading" />
</template>
<script setup>
let view = $signal('pdx-list');
let data = $signal([]);
let heading = $signal('Items');
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain('items: ctx.data()');
        expect(result.code).toContain('title: ctx.heading()');
    });

    it('compiles <component> with @keepAlive', () => {
        const source = `
<template>
  <component :is="view" @keepAlive />
</template>
<script setup>
let view = $signal('pdx-home');
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain('keepAlive: true');
    });

    it('compiles <component> with @transition', () => {
        const source = `
<template>
  <component :is="view" @transition('slide-right', 'slide-left') />
</template>
<script setup>
let view = $signal('pdx-home');
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain("enter: 'slide-right'");
        expect(result.code).toContain("exit: 'slide-left'");
    });

    it('compiles <component> with @mode', () => {
        const source = `
<template>
  <component :is="view" @transition('fade-in', 'fade-out') @mode('out-in') />
</template>
<script setup>
let view = $signal('pdx-home');
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain("mode: 'out-in'");
    });

    it('compiles <component> with all options combined', () => {
        const source = `
<template>
  <component :is="view" :data="items" @transition('slide-right', 'slide-left') @mode('out-in') @keepAlive />
</template>
<script setup>
let view = $signal('pdx-list');
let items = $signal([]);
</script>`;
        const result = compile(source, 'app.pdx');
        expect(result.code).toContain('keepAlive: true');
        expect(result.code).toContain("enter: 'slide-right'");
        expect(result.code).toContain("mode: 'out-in'");
        expect(result.code).toContain('data: ctx.items()');
    });
});
