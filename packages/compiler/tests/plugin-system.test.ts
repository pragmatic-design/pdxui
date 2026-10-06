// Tests for the compiler plugin system

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import type { CompilerPlugin } from '../src/plugin-system';

const minimalPdx = `
<template>
  <div>{{ name }}</div>
</template>

<script setup>
  @prop name: string = 'World';
</script>`;

describe('compiler plugin system', () => {
    it('compiles normally without plugins', () => {
        const { code } = compile(minimalPdx, 'test.pdx');
        expect(code).toContain("component('pdx-test'");
    });

    it('transformScript hook modifies script before analysis', () => {
        const plugin: CompilerPlugin = {
            name: 'test-transform',
            transformScript(script) {
                // Inject an extra prop declaration
                return script + '\n  @prop extra: string = "injected";';
            },
        };

        const { code } = compile(minimalPdx, 'test.pdx', [plugin]);
        expect(code).toContain("extra: { type: String, default: \"injected\" }");
    });

    it('analyzeScript hook can augment analysis', () => {
        let analysisReceived = false;
        const plugin: CompilerPlugin = {
            name: 'test-analyze',
            analyzeScript(analysis, ctx) {
                analysisReceived = true;
                expect(analysis.props.length).toBeGreaterThan(0);
                expect(ctx.filename).toBe('test.pdx');
            },
        };

        compile(minimalPdx, 'test.pdx', [plugin]);
        expect(analysisReceived).toBe(true);
    });

    it('transformOutput hook modifies final JS', () => {
        const plugin: CompilerPlugin = {
            name: 'test-output',
            transformOutput(code) {
                return `// Plugin banner\n${code}`;
            },
        };

        const { code } = compile(minimalPdx, 'test.pdx', [plugin]);
        expect(code.startsWith('// Plugin banner')).toBe(true);
    });

    it('addImport() injects framework imports', () => {
        const plugin: CompilerPlugin = {
            name: 'test-import',
            analyzeScript(_analysis, ctx) {
                ctx.addImport('resource');
                ctx.addImport('resourceWhen');
            },
        };

        const { code } = compile(minimalPdx, 'test.pdx', [plugin]);
        expect(code).toContain('resource');
        expect(code).toContain('resourceWhen');
    });

    it('multiple plugins execute in order', () => {
        const order: string[] = [];

        const plugin1: CompilerPlugin = {
            name: 'first',
            transformOutput(code) {
                order.push('first');
                return code;
            },
        };
        const plugin2: CompilerPlugin = {
            name: 'second',
            transformOutput(code) {
                order.push('second');
                return code;
            },
        };

        compile(minimalPdx, 'test.pdx', [plugin1, plugin2]);
        expect(order).toEqual(['first', 'second']);
    });

    it('plugin receives correct tag in context', () => {
        let receivedTag = '';
        const plugin: CompilerPlugin = {
            name: 'test-tag',
            analyzeScript(_analysis, ctx) {
                receivedTag = ctx.tag;
            },
        };

        compile(minimalPdx, 'counter.pdx', [plugin]);
        expect(receivedTag).toBe('pdx-counter');
    });

    it('warn() collects warnings', () => {
        const plugin: CompilerPlugin = {
            name: 'test-warn',
            analyzeScript(_analysis, ctx) {
                ctx.warn('test warning message');
            },
        };

        // Warning is logged to console but doesn't break compilation
        const { code } = compile(minimalPdx, 'test.pdx', [plugin]);
        expect(code).toContain("component('pdx-test'");
    });

    it('works with legacy mode too', () => {
        const legacyPdx = `
<template><div>{{ name }}</div></template>
<script setup>
  import { signal } from '@pdxui/core';
  const props = defineProps({ name: { type: String, default: 'World' } });
  return { name: signal('test') };
</script>`;

        let hookCalled = false;
        const plugin: CompilerPlugin = {
            name: 'legacy-test',
            transformOutput(code) {
                hookCalled = true;
                return code;
            },
        };

        const { code } = compile(legacyPdx, 'legacy.pdx', [plugin]);
        expect(hookCalled).toBe(true);
        expect(code).toContain("name: { type: String, default: 'World' }");
    });
});
