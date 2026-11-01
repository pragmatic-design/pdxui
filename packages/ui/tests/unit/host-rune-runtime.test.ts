// `@host { … }` (#133), compiled with the real compiler and mounted against the real @pdxui/core:
// the component's own element carries the static attribute, the bound one follows its signal, a
// listener on the host calls the script's function, and a page's own `role` is kept.
// The compiler half — what is emitted, and the forms that are refused — is
// packages/compiler/tests/host-rune.test.ts.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string): void {
    const { code } = compile(source, filename, [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const COMBO = `<template>
<span class="label">{{ label }}</span>
</template>
<script>
@prop label: string = 'Choose';
let open = $signal(false);
@host {
  role="combobox"
  :aria-expanded="open ? 'true' : 'false'"
  @keydown.enter="onKey"
}
function onKey(e) { open = !open; }
</script>`;

// `@host self;` (#750): a name for the component's own element, read in setup and in the template.
const NAMED = `<template>
<label class="lbl" :for="self.id">Name</label>
<p class="seen">{{ seenAtSetup }}</p>
</template>
<script>
@host self;
const seenAtSetup = self.id;
</script>`;

// A name and attributes in one declaration.
const NAMED_BLOCK = `<template>
<p class="tag">{{ me.tagName.toLowerCase() }}</p>
</template>
<script>
@host me { role="group" }
</script>`;

beforeAll(() => {
    load('host-combo.pdx', COMBO);
    load('host-named.pdx', NAMED);
    load('host-named-block.pdx', NAMED_BLOCK);
});
afterEach(() => cleanup());

async function mount(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('app-host-combo');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await tick();
    return el;
}

const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('@host, compiled and mounted', () => {
    it('the host gets the static role', async () => {
        expect((await mount()).getAttribute('role')).toBe('combobox');
    });

    it('the bound aria-expanded follows the signal, and keydown on the host calls the handler', async () => {
        const el = await mount();
        expect(el.getAttribute('aria-expanded')).toBe('false');
        key(el, 'Enter');
        await tick();
        expect(el.getAttribute('aria-expanded')).toBe('true');
        key(el, 'a');
        await tick();
        expect(el.getAttribute('aria-expanded'), 'the .enter modifier lets another key through').toBe('true');
    });

    it('a role the page set is kept', async () => {
        expect((await mount({ role: 'listbox' })).getAttribute('role')).toBe('listbox');
    });
});

describe('@host with a name (#750), compiled and mounted', () => {
    it('the name is the host element: setup reads its id, and :for="self.id" renders it', async () => {
        const el = document.createElement('app-host-named');
        el.id = 'h-750';
        document.body.appendChild(el);
        await tick();
        expect(el.querySelector('.seen')?.textContent, 'setup did not read the host').toBe('h-750');
        expect(el.querySelector('label')?.getAttribute('for')).toBe('h-750');
    });

    it('a name and attributes together: the attributes reach the host, and the name is the host', async () => {
        const el = document.createElement('app-host-named-block');
        document.body.appendChild(el);
        await tick();
        expect(el.getAttribute('role')).toBe('group');
        expect(el.querySelector('.tag')?.textContent).toBe('app-host-named-block');
    });
});
