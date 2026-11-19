// Static rows (#1233): a `@for` row whose content follows only from its item compiles to core's
// eachStatic, its bindings written once. A row that reads anything else stays reactive (eachRow).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string, script = "@prop keys: string[] = [];\n@prop symbols: boolean = false;\nconst SEP = '+';") => {
    const { code } = compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, 'rows.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
};

describe('a @for row that follows only from its item', () => {
    it('is static: eachStatic, its text and attribute written once', () => {
        const out = render('<ul>@for (keys as key, i; track i) { <li class="k" :title="key">{{ key }}</li> }</ul>');
        expect(out).toContain('eachStatic(');
        expect(out).not.toContain('eachRow(');
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>key\(\),true\)/);
        expect(out, 'the attribute kept an effect').not.toMatch(/bind\w*\(__el\d+, "title"/);
    });

    it('with literals and a literal script const it is static too', () => {
        expect(render('<ul>@for (keys as key; track key) { <li :data-k="\'k-\' + key">{{ key + SEP }}</li> }</ul>')).toContain('eachStatic(');
    });

    it('the track expression counts as the item does: the row\'s key cannot change', () => {
        const out = render('<ul>@for (keys as r; track r.id) { <li :data-id="r.id">{{ \'#\' + r.id }}</li> }</ul>');
        expect(out).toContain('eachStatic(');
    });

    it('an event handler does not make it reactive', () => {
        expect(render('<ul>@for (keys as key; track key) { <li @click="symbols = !symbols">{{ key }}</li> }</ul>')).toContain('eachStatic(');
    });
});

describe('the rows that stay reactive', () => {
    for (const [why, template] of [
        ['a prop', '<ul>@for (keys as key; track key) { <li>{{ symbols ? key : "" }}</li> }</ul>'],
        ['a call, which may read a signal', '<ul>@for (keys as key; track key) { <li>{{ key.toUpperCase() }}</li> }</ul>'],
        ['a member of the item, which a $store proxy would make reactive', '<ul>@for (keys as key; track key) { <li>{{ key.length }}</li> }</ul>'],
        ['the index', '<ul>@for (keys as key, i; track key) { <li>{{ i }}</li> }</ul>'],
        ['a block inside', '<ul>@for (keys as key; track key) { @if (key) { <li>{{ key }}</li> } }</ul>'],
        ['a two-way binding', '<ul>@for (keys as key; track key) { <input ::value="symbols" /> }</ul>'],
        ['a pipe', '<ul>@for (keys as key; track key) { <li>{{ key | uppercase }}</li> }</ul>'],
    ] as const) {
        it(`one that reads ${why}`, () => {
            const out = render(template);
            expect(out).toContain('eachRow(');
            expect(out).not.toContain('eachStatic(');
        });
    }
});
