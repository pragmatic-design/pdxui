// An `@internal` view (#1102), the way a library component splits its file: the parent imports it from its
// folder, passes it a property, and hears its event. Compiled with the real compiler, run against the
// real @pdxui/core, mounted, clicked. The compiler half — the folder rule, the auto-import, the
// unresolved warning — is packages/compiler/tests/internal-component.test.ts.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx of the library and run the module; its relative .pdx imports are loaded by the test. */
function load(filename: string, source: string): string[] {
    const { code, warnings } = compile(source, filename, [], undefined, { prefix: 'pdx', readComponent: (f) => (f.replace(/\\/g, '/').endsWith('/rt-view.pdx') ? VIEW : null) });
    const body = code
        .replace(/^import\s+'\.\/[^']+\.pdx';\n?/gm, '')
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
    return warnings.map((w) => w.code);
}

const VIEW = `<template>
<button class="pick" @click="picked({ value: label })">{{ label }}</button>
</template>
<script>
@internal;
@prop label: string = '';
@event picked: { value: string };
</script>`;

const OWNER = `<template>
<pdx-rt-view :label="name" @picked="last = $event.detail.value"></pdx-rt-view>
<p class="last">{{ last }}</p>
</template>
<script>
import './rt-view.pdx';
let name = $signal('Room A');
let last = $signal('');
</script>`;

let viewCodes: string[] = [];
let ownerCodes: string[] = [];
beforeAll(() => {
    viewCodes = load('/lib/src/rt/rt-view.pdx', VIEW);
    ownerCodes = load('/lib/src/rt/pdx-rt-owner.pdx', OWNER);
});
afterEach(() => cleanup());

describe('an internal view, rendered by the component of its folder', () => {
    it('both compile with no diagnostic', () => {
        expect(viewCodes).toEqual([]);
        expect(ownerCodes).toEqual([]);
    });

    it('takes the property the parent binds, and the parent hears its event', async () => {
        const el = document.createElement('pdx-rt-owner');
        document.body.appendChild(el);
        await tick();
        const button = el.querySelector<HTMLButtonElement>('pdx-rt-view .pick');
        expect(button?.textContent, 'the view did not render the bound label').toBe('Room A');
        button!.click();
        await tick();
        expect(el.querySelector('.last')?.textContent, 'the parent did not hear the view\'s event').toBe('Room A');
    });
});
