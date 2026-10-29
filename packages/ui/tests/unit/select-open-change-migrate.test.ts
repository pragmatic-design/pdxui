// `pdx migrate` turns a pdx-select's `@pdx-open` and `@pdx-close` into one `@open-change` (#287): the
// file it writes compiles without a removed form, and mounted it behaves as the alpha one did — opening
// the select calls the open handler once, closing it runs the close handler's statements.
//
// The guard is a statement, `if ($event.detail.value) return load($event);`, and the template's handler
// rewriter rewrites signal writes statement by statement: whether it leaves the guard as written is
// measured here, by running it.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { openChangeEvent } from '../../../compiler/src/language/open-change';
import { tick, cleanup } from './helpers';
import '../../src/select/pdx-select';

const ALPHA = `<template>
<pdx-select class="sel" label="Pick" :options="opts" @pdx-open="load" @pdx-close="count = 0; touched = true"></pdx-select>
<p class="out">{{ loads }}|{{ count }}|{{ String(touched) }}</p>
</template>
<script>
@tag 'pdx-migrated-open-change';
const opts = ['Red', 'Green'];
let loads = $signal(0);
let count = $signal(5);
let touched = $signal(false);
function load() { loads++; }
</script>`;

const migrated = (openChangeEvent.fix as (text: string) => string)(ALPHA);

afterEach(() => cleanup());

describe('a migrated @pdx-open / @pdx-close', () => {
    it('is the issue\'s rewrite', () => {
        expect(migrated).toContain('@open-change="if ($event.detail.value) return load($event); count = 0; touched = true"');
        expect(migrated).not.toMatch(/@pdx-(open|close)/);
    });

    it('compiles with no removed form; the alpha file does not', () => {
        const removed = (source: string) => compile(source, 'migrated.pdx').warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed(ALPHA)).toHaveLength(1);
        expect(removed(migrated)).toEqual([]);
    });

    describe('mounted', () => {
        beforeAll(() => {
            const { code } = compile(migrated, 'migrated.pdx', [], undefined, {});
            const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
            new Function('__core', body)(core);
        });

        it('opening calls the open handler once; closing runs the close handler\'s statements', async () => {
            const el = document.createElement('pdx-migrated-open-change');
            document.body.appendChild(el);
            await tick(100);
            const out = () => el.querySelector('.out')!.textContent;
            const trigger = el.querySelector<HTMLElement>('.sel [data-part="root"]')!;
            expect(out()).toBe('0|5|false');

            trigger.click();
            await tick(50);
            expect(out(), 'opening ran the close handler, or not the open one').toBe('1|5|false');

            trigger.click();
            await tick(50);
            expect(out(), 'closing called load again, or did not run both statements').toBe('1|0|true');
        });
    });
});
