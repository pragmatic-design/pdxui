// `@search`'s `searchParams` renders the query's typed values in the template and the script (#204).
//
// It was returned to the template as a plain `const`: the template read `ctx.searchParams.page`, a
// property of the computed function, and `pdx check` reported the read as PDX_UNDECLARED_REF.
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts. The router's `currentSearch` is the one import stood in for: it is a signal of
// the address's query, and the address is not what is measured here.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('@search', () => {
    for (const inline of [false, true]) {
        it(`searchParams reads the query, typed, in the template and the script (${inline ? 'inline path' : 'template path'})`, async () => {
            const query = core.signal('?page=3&q=ink');
            const name = `searchrender${inline ? 'i' : 't'}`;
            const src = '<template><p class="t">{{ searchParams.page }} {{ searchParams.q }}</p><p class="s">{{ next }}</p></template>\n'
                + "<script setup>\n@page '/s';\n@search { page: number = 1, q?: string }\nconst next = $derived(searchParams.page + 1);\n</script>\n";
            const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : {});
            const body = code
                .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
                .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/router';?\s*$/gm, 'const {$1} = __router;');
            new Function('__core', '__router', body)(core, { currentSearch: () => query() });
            const el = document.createElement(`pdx-${name}`);
            document.body.appendChild(el);
            await settle();
            expect(el.querySelector('.t')!.textContent).toBe('3 ink');
            expect(el.querySelector('.s')!.textContent).toBe('4');
            query.set('?page=7');
            await settle();
            expect(el.querySelector('.s')!.textContent).toBe('8');
        });
    }
});
