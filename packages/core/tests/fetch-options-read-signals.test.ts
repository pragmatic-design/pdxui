// `@fetch … { enabled: () => ready }` reads the signal, and fetches once it turns true (#203).
//
// The options were copied as written: `ready` was a bare name the module does not have, and the
// resource threw `ReferenceError: ready is not defined` the first time it asked whether to fetch.
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => { vi.unstubAllGlobals(); });

describe('@fetch options', () => {
    for (const inline of [false, true]) {
        it(`enabled reads a $signal, and the fetch waits for it (${inline ? 'inline path' : 'template path'})`, async () => {
            const fetch = vi.fn(async () => new Response('["ada"]', { status: 200, headers: { 'content-type': 'application/json' } }));
            vi.stubGlobal('fetch', fetch);
            core.setDefaultClient(core.createHttpClient());
            const name = `fetchopts${inline ? 'i' : 't'}`;
            const src = "<template><p>{{ users.data()?.length ?? 0 }}</p><button @click=\"ready = true\">go</button></template>\n"
                + "<script setup>\nlet ready = $signal(false);\n@fetch users: 'GET /api/users-203-" + name + "' as string[] { enabled: () => ready };\n</script>\n";
            const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : { inlineBindings: false });
            const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
            new Function('__core', body)(core);
            const el = document.createElement(`pdx-${name}`);
            document.body.appendChild(el);
            await settle();
            expect(fetch).not.toHaveBeenCalled();
            el.querySelector('button')!.click();
            await settle();
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(el.querySelector('p')!.textContent).toBe('1');
        });
    }
});
