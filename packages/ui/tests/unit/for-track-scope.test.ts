// The `track` of a @for resolves names like every other template expression.
//
// In `@for (docs as doc; track keyOf(doc))`, `keyOf` is a function of the component's setup. The
// expression after `track` goes through the ctx. prefix like every other one; pasted into the key
// function as written, it compiles without a word and fails at runtime with
// `ReferenceError: keyOf is not defined`, and the list disappears.
//
// Compiled with the real compiler and run against the real core, on the three code paths.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

function load(filename: string, source: string, opts: object = {}): void {
    const { code } = compile(source, filename, [], undefined, opts);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

// Two documents with the same id: only a key that also reads the kind tells them apart.
const SETUP = `let docs = $signal([{ id: 1, kind: 'a', name: 'one' }, { id: 1, kind: 'b', name: 'two' }]);
let sep = $signal(':');
function keyOf(id, kind) { return id + sep + kind; }
function swap() { docs = [docs[1], docs[0]]; }`;

const SHAPES: Record<string, string> = {
    // A function of the component, called on the loop variable.
    call: '@for (docs as doc; track keyOf(doc.id, doc.kind)) { <li class="row">{{ doc.name }}</li> }',
    // The same, with a destructured binding: its names belong to the loop, keyOf to the component.
    destructured: '@for (docs as { id, kind, name }; track keyOf(id, kind)) { <li class="row">{{ name }}</li> }',
    // A destructured binding with a track on the loop alone: the body's names are the loop's too.
    // `{{ name }}` must not compile to `ctx.name`: the pattern is in scope as its names, not as one.
    destructuredBody: "@for (docs as { id, kind, name }; track id + '/' + kind) { <li class=\"row\">{{ name }}</li> }",
    // A signal of the component read inside the key, next to the loop variable.
    signal: '@for (docs as doc; track doc.id + sep + doc.kind) { <li class="row">{{ doc.name }}</li> }',
    // Control: an expression on the loop variable alone.
    loopOnly: `@for (docs as doc; track doc.id + '/' + doc.kind) { <li class="row">{{ doc.name }}</li> }`,
};

const PATHS = [
    { name: 'dev', opts: {} },
    { name: 'build', opts: { production: true } },
    { name: 'production inline', opts: { production: true, inlineBindings: true } },
];

const fileOf = (shape: string, path: number) => `ts-${shape.toLowerCase()}-${path}.pdx`;
const tagOf = (shape: string, path: number) => `pdx-ts-${shape.toLowerCase()}-${path}`;

beforeAll(() => {
    for (const [shape, loop] of Object.entries(SHAPES)) {
        PATHS.forEach((p, i) => {
            const source = `<template>\n<button class="swap" @click="swap()">swap</button>\n<ul>\n${loop}\n</ul>\n</template>\n<script setup>\n${SETUP}\n</script>`;
            load(fileOf(shape, i), source, p.opts);
        });
    }
});
afterEach(() => cleanup());

PATHS.forEach((p, pathIndex) => {
    describe(`@for track resolves the component's names — ${p.name}`, () => {
        for (const shape of Object.keys(SHAPES)) {
            it(`${shape}: the list renders, and a swap moves the same nodes`, async () => {
                const errors: unknown[] = [];
                const onError = (e: ErrorEvent) => errors.push(e.error);
                window.addEventListener('error', onError);
                try {
                    const el = document.createElement(tagOf(shape, pathIndex));
                    document.body.appendChild(el);
                    await tick();

                    const rows = () => Array.from(el.querySelectorAll('li.row'));
                    expect(rows().map(r => r.textContent), 'the list did not render').toEqual(['one', 'two']);
                    const [one, two] = rows();

                    el.querySelector<HTMLButtonElement>('.swap')!.click();
                    await tick();

                    expect(rows().map(r => r.textContent)).toEqual(['two', 'one']);
                    // Identity, not toEqual: a recreated <li> with the same text is deep-equal to the old one.
                    expect(rows()[0] === two && rows()[1] === one, 'the rows were recreated: the key did not tell them apart').toBe(true);
                    expect(errors).toEqual([]);
                } finally {
                    window.removeEventListener('error', onError);
                }
            });
        }
    });
});
