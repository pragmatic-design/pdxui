// A $derived declared after what it reads mounts.
//
// The case: `const crumbs = $derived(buildCrumbs())` written after
// `const requestedId = signal('')`, with buildCrumbs reading requestedId. The failure it guards
// against is a blank screen: "[pdx] Component <pdx-split> setup failed: ReferenceError: Cannot access
// 'requestedId' before initialization". The setup is not emitted in source order, so reordering the
// source does not help.
//
// Compiled with the real compiler, run against the real core, mounted — the way an author meets it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

let n = 0;

/** Compile, run and mount a component; return the element and whatever setup logged as a failure. */
async function mount(script: string, template: string, opts: object = {}): Promise<{ el: HTMLElement; failures: string[]; code: string }> {
    const file = `dso-${n++}.pdx`;
    const tag = `pdx-${file.replace('.pdx', '')}`;
    const source = `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
    const { code } = compile(source, file, [], undefined, opts);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/g, 'const {$1} = __core;');
    const failures: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { failures.push(args.map(String).join(' ')); });
    try {
        new Function('__core', body)(core);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        await tick();
        return { el, failures, code };
    } finally {
        spy.mockRestore();
    }
}

afterEach(() => cleanup());

const PATHS = [
    { name: 'dev', opts: {} },
    { name: 'build', opts: { production: true } },
];

for (const p of PATHS) {
    describe(`$derived after what it reads — ${p.name}`, () => {
        it("the lab's shape: a derived over a function that reads a body signal declared before it", async () => {
            const { el, failures, code } = await mount(
                [
                    "import { signal } from '@pdxui/core';",
                    "const requestedId = signal('A-1');",
                    'function buildCrumbs() { return ["Home", requestedId()]; }',
                    'const crumbs = $derived(buildCrumbs());',
                    'function open(id) { requestedId.set(id); }',
                    'function current() { return crumbs; }',
                ].join('\n'),
                '<p class="crumbs">{{ crumbs.join(" / ") }}</p>',
                p.opts,
            );
            expect(failures, `setup failed:\n${code}`).toEqual([]);
            expect(el.querySelector('.crumbs')?.textContent).toBe('Home / A-1');
        });

        it('a derived read at setup time by an effect declared after it', async () => {
            const { el, failures, code } = await mount(
                [
                    "import { signal } from '@pdxui/core';",
                    "const requestedId = signal('B-2');",
                    'const label = $derived("id " + requestedId());',
                    'let seen = $signal("");',
                    '$effect(() => { seen = label; });',
                ].join('\n'),
                '<p class="seen">{{ seen }}</p>',
                p.opts,
            );
            expect(failures, `setup failed:\n${code}`).toEqual([]);
            expect(el.querySelector('.seen')?.textContent).toBe('id B-2');
        });

        it('control — a derived read by a declaration BEFORE it in source still works', async () => {
            const { el, failures, code } = await mount(
                [
                    'let count = $signal(2);',
                    'function describe() { return "x" + double; }',
                    'const double = $derived(count * 2);',
                ].join('\n'),
                '<p class="d">{{ describe() }}</p>',
                p.opts,
            );
            expect(failures, `setup failed:\n${code}`).toEqual([]);
            expect(el.querySelector('.d')?.textContent).toBe('x4');
        });
    });
}
