// A `@defer` whose only trigger is a `when`, with no placeholder, loading, error or prefetch, is core's
// deferWhen (#1287, item G). defer() carries every trigger, the prefetch phase, the states and the
// hydration's take-over, about 2.7 KB gzip; such a block uses none of them. Core's defer-when.test.ts
// holds what deferWhen does; this holds which blocks the compiler gives it, and that every other
// block keeps defer().

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const compileWith = (template: string, options: Record<string, unknown> = {}) => compile(
    `<template>${template}</template>\n<script>\nlet on = $signal(true);\n</script>\n`,
    'p.pdx', [], undefined, { production: true, importPathOf: (tag: string) => (tag === 'x-chart' ? './x-chart.js' : null), ...options },
).code;

const coreImports = (code: string): string[] => code.match(/import \{([^}]*)\} from '@pdxui\/core'/)?.[1].split(',').map((s) => s.trim()) ?? [];

describe('@defer (when (x)) alone is deferWhen', () => {
    it('with its code to load, and with none', () => {
        const loaded = compileWith('@defer (when (on)) { <x-chart></x-chart> }');
        const name = loaded.match(/^const (__code\d+)=deferCode/m)![1];
        expect(loaded).toContain(`deferWhen(()=>(ctx.on()),${name},`);
        expect(coreImports(loaded)).toContain('deferWhen');
        expect(coreImports(loaded), 'defer() is imported beside it').not.toContain('defer');
        expect(compileWith('@defer (when (on)) { <p>x</p> }')).toContain('deferWhen(()=>(ctx.on()),null,');
    });

    it('two conditions are one, as defer() reads them: the first that holds fires it', () => {
        expect(compileWith('@defer (when (on) | when (!on)) { <p>x</p> }')).toContain('deferWhen(()=>(ctx.on()) || (!ctx.on()),null,');
    });

    it('control — any other part of a @defer keeps defer()', () => {
        const others = [
            '@defer (when (on)) { <p>x</p> } @placeholder { <p>p</p> }',
            '@defer (when (on)) { <p>x</p> } @loading { <p>l</p> }',
            '@defer (when (on)) { <x-chart></x-chart> } @error { <p>e</p> }',
            '@defer (when (on); prefetch idle) { <x-chart></x-chart> }',
            '@defer (viewport | when (on)) { <p>x</p> }',
            '@defer (viewport) { <p>x</p> }',
        ];
        for (const t of others) {
            const code = compileWith(t);
            expect(code, t).toMatch(/=defer\(\{/);
            expect(code, t).not.toContain('deferWhen');
        }
    });

    it('control — on the server and when hydrating it keeps defer(), which both of them read', () => {
        for (const options of [{ ssr: true }, { hydrate: true }]) {
            expect(compileWith('@defer (when (on)) { <p>x</p> }', options), JSON.stringify(options)).not.toContain('deferWhen');
        }
    });
});
