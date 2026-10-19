// A @for row's track key is written once (#110): the rows of a keyed list must still read right when
// the list is replaced by new objects with the same keys, reordered, and extended. The key is the one
// thing a reused row cannot change; everything else must keep following.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const SRC = `<template><ul>@for (rows as row; track row.id) {<li :data-id="'r' + row.id">{{ row.id }}:{{ row.label }}</li>}</ul></template>
<script>
@prop rows: any[] = [];
</script>
`;

let seq = 0;
function mount(): HTMLElement & { rows: unknown[] } {
    const name = `constkey${++seq}`;
    const { code } = compile(SRC, `${name}.pdx`, [], undefined, { production: true });
    // The key bindings are compiled as constants: this test exercises them, not the reactive path.
    expect(code).toMatch(/bindInterpolation\(__t\d+,\(\)=>row\(\)\.id,true\)/);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`app-${name}`) as HTMLElement & { rows: unknown[] };
    document.body.appendChild(el);
    return el;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
}

const read = (host: HTMLElement) => [...host.querySelectorAll('li')].map(li => `${li.getAttribute('data-id')}=${li.textContent}`);

describe('a keyed list whose key bindings are constant', () => {
    it('follows a replacement with the same keys, a reorder and an append', async () => {
        const host = mount();
        host.rows = [{ id: 1, label: 'a' }, { id: 2, label: 'b' }];
        await settle();
        expect(read(host)).toEqual(['r1=1:a', 'r2=2:b']);

        // New objects, same keys, new labels: the rows are reused, the labels follow.
        host.rows = [{ id: 1, label: 'A' }, { id: 2, label: 'B' }];
        await settle();
        expect(read(host)).toEqual(['r1=1:A', 'r2=2:B']);

        // Reordered and extended: each row keeps its own key.
        host.rows = [{ id: 2, label: 'B' }, { id: 3, label: 'c' }, { id: 1, label: 'A' }];
        await settle();
        expect(read(host)).toEqual(['r2=2:B', 'r3=3:c', 'r1=1:A']);
        host.remove();
    });
});
