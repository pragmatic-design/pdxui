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

// A value row (#1237): its item a value, as a static row's is, but its bindings keep their effect —
// over a $store proxy its member reads subscribe, and a new item for its key runs them again in place.
describe('a value row: the item a value, its other bindings reactive', () => {
    for (const [why, template, binding] of [
        ['a prop', '<ul>@for (keys as key; track key) { <li>{{ symbols ? key : "" }}</li> }</ul>', /bindInterpolation\(__t\d+,\(\)=>__li\d+_symbols\(\) \? key\(\) : ""\)/],
        ['a call', '<ul>@for (keys as key; track key) { <li>{{ key.toUpperCase() }}</li> }</ul>', /bindInterpolation\(__t\d+,\(\)=>key\(\)\.toUpperCase\(\)\)/],
        ['a member of the item, which a $store proxy keeps reactive', '<ul>@for (keys as key; track key) { <li>{{ key.length }}</li> }</ul>', /bindInterpolation\(__t\d+,\(\)=>key\(\)\.length\)/],
        ['a pipe', '<ul>@for (keys as key; track key) { <li>{{ key | uppercase }}</li> }</ul>', /bindInterpolation\(__t\d+,\(\)=>templatePipe\(key\(\), __li\d+_uppercase\(\)\)\)/],
    ] as const) {
        it(`one that reads ${why}: eachStatic, the binding with its effect`, () => {
            const out = render(template);
            expect(out).toContain('eachStatic(');
            expect(out).toMatch(binding);
        });
    }
});

describe('the rows that keep their item signal', () => {
    for (const [why, template] of [
        ['the index, which follows the row when it moves', '<ul>@for (keys as key, i; track key) { <li>{{ i }}</li> }</ul>'],
        ['the index in a handler, which must see where the row is now', '<ul>@for (keys as key, i; track key) { <li @click="symbols = i > 0">{{ key }}</li> }</ul>'],
        ['a block inside, whose bindings running the row again cannot reach', '<ul>@for (keys as key; track key) { @if (key) { <li>{{ key }}</li> } }</ul>'],
        ['a two-way binding, which writes through the item','<ul>@for (keys as key; track key) { <input ::value="symbols" /> }</ul>'],
        ['the index of an outer loop an inner one names again', '<ul>@for (keys as key, i; track key) { @for (keys as k, i; track k) { <li>{{ k }}</li> } }</ul>'],
    ] as const) {
        it(`one that reads ${why}`, () => {
            const out = render(template);
            expect(out.indexOf('eachRow(')).toBeGreaterThan(-1);
            expect(out.slice(0, out.indexOf('eachRow(')), 'the outer row became a value row').not.toContain('eachStatic(');
        });
    }
});
