// `<component :is @keepAlive(n)>` sets the maximum of kept-alive views (#270; beta spec, lifecycle.md,
// «Frozen is bounded»; grammar.md, `DynamicOption`).
//
// The runtime has the option — `dynamic(…, { keepAlive: true, maxAlive })`, default 10 — and a .pdx
// could not reach it: the compiler emitted `keepAlive: true` and nothing else.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

// One render path since #107: what differs is dev and a production build.
const PATHS = { dev: {}, production: { production: true } } as const;

const sfc = (tag: string) => `<template>\n  ${tag}\n</template>\n<script>\nlet view = $signal('pdx-a');\n</script>\n`;

for (const [path, opts] of Object.entries(PATHS)) {
    describe(`@keepAlive(n) — ${path}`, () => {
        it('emits the maximum', () => {
            const { code, warnings } = compile(sfc('<component :is="view" @keepAlive(3)></component>'), 'tabs.pdx', [], undefined, opts);
            expect(code).toMatch(/keepAlive: true, maxAlive: 3/);
            expect(warnings.map(w => w.code), 'a diagnostic on a valid @keepAlive(3)').toEqual([]);
        });

        it('control — @keepAlive alone keeps the runtime default', () => {
            const { code } = compile(sfc('<component :is="view" @keepAlive></component>'), 'tabs.pdx', [], undefined, opts);
            expect(code).toMatch(/keepAlive: true/);
            expect(code).not.toMatch(/maxAlive/);
        });

        for (const bad of ['0', '1.5', 'n']) {
            it(`@keepAlive(${bad}) is an error that quotes it`, () => {
                const { warnings } = compile(sfc(`<component :is="view" @keepAlive(${bad})></component>`), 'tabs.pdx', [], undefined, opts);
                const err = warnings.find(w => w.code === 'PDX_KEEPALIVE_MAX');
                expect(err, `no PDX_KEEPALIVE_MAX; got ${warnings.map(w => w.code).join(', ')}`).toBeDefined();
                expect(err!.severity).toBe('error');
                expect(err!.message).toContain(`@keepAlive(${bad})`);
            });
        }
    });
}
