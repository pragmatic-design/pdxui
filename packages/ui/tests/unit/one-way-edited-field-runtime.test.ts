// What PDX_ONE_WAY_EDITED_FIELD (#678) is about, mounted. A one-way `:value` writes when its value
// changes (#44), so #678's handler — it takes what was typed and then clears the signal — leaves the
// text in the field while the signal is empty. The two-way `::value`, which the diagnostic proposes,
// clears it. The compiler half is packages/compiler/tests/one-way-edited-field.test.ts.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** #678's component, with the field bound by `binding`, under its own tag. */
const source = (tag: string, binding: string, handler: string) => `<template>
<input class="q" ${binding} />
<p class="out">[{{ query }}]</p>
</template>
<script>
@tag '${tag}';
let query = $signal('');
${handler}
</script>`;

const ISSUE = "function onInput(e: Event) { query = (e.target as HTMLInputElement).value; reset(); }\nfunction reset() { query = ''; }";

function define(text: string): void {
    const { code } = compile(text, 'field.pdx', [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

/** Mount `tag`, type `a` into its field, and return the field and the signal as the page shows it. */
async function typeA(tag: string): Promise<{ field: string; signal: string }> {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick(50);
    const input = el.querySelector<HTMLInputElement>('.q')!;
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(50);
    return { field: input.value, signal: el.querySelector('.out')!.textContent! };
}

afterEach(() => cleanup());

describe('#678, mounted', () => {
    beforeAll(() => {
        define(source('pdx-one-way-678', ':value="query" @input="onInput"', ISSUE));
        // The diagnostic's change: the field bound two-way, the handler keeps only the reset.
        define(source('pdx-two-way-678', '::value="query" @input="reset"', "function reset() { query = ''; }"));
    });

    it('one way, the typed text stays in the field while the signal is empty (#44 holds: it writes on a change)', async () => {
        expect(await typeA('pdx-one-way-678')).toEqual({ field: 'a', signal: '[]' });
    });

    it('two way, the reset reaches the field', async () => {
        expect(await typeA('pdx-two-way-678')).toEqual({ field: '', signal: '[]' });
    });
});
