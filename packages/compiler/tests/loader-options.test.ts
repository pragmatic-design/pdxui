// `@loader user: loadUser { staleTime: 30_000 };` (#148): the options block of a named loader.
//
// `staleTime` reaches both route registrations — the page module's own `__pdx_pushRoute` and the
// route table the compiler writes — as a number, because the table is data read before any page
// runs. Any other option is PDX_LOADER_UNKNOWN_OPTION, checked as `@fetch` checks its options, and so
// is a `staleTime` the compiler cannot read as milliseconds.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateRouteTable } from '../src/route-table';
import { readMilliseconds } from '../src/compiler/loader-options';

const pdx = (loader: string) => `<template><p>{{ user.data()?.name }}</p></template>
<script>
@page '/users/:id';
${loader}
async function loadUser() { return { name: 'Ada' }; }
</script>`;

const warningsOf = (src: string) => compile(src, 'pages/user.pdx', [], undefined, {}).warnings;
const codeOf = (src: string) => compile(src, 'pages/user.pdx', [], undefined, {}).code;

describe('the options block', () => {
    it('staleTime reaches the page registration, as a number', () => {
        const code = codeOf(pdx('@loader user: loadUser { staleTime: 30_000 };'));
        expect(code).toMatch(/__pdx_pushRoute\(\{[^}]*loaderStaleTime:30000/);
        expect(warningsOf(pdx('@loader user: loadUser { staleTime: 30_000 };')).filter((w) => w.severity === 'error')).toEqual([]);
    });

    it('and the route table the compiler writes', () => {
        const table = generateRouteTable([{ path: '/users/:id', file: '/app/pages/user.pdx', tag: 'app-user', loader: 'loadUser', loaderStaleTime: 30_000, lazy: true }]);
        expect(table).toContain('loaderStaleTime: 30000');
    });

    it('control — without the block, no staleTime is registered', () => {
        expect(codeOf(pdx('@loader user: loadUser;'))).not.toContain('loaderStaleTime');
    });

    it('an option other than staleTime is PDX_LOADER_UNKNOWN_OPTION', () => {
        const errors = warningsOf(pdx('@loader user: loadUser { stale: 1 };')).filter((w) => w.code === 'PDX_LOADER_UNKNOWN_OPTION');
        expect(errors).toHaveLength(1);
        expect(errors[0].severity).toBe('error');
        expect(errors[0].message).toContain('`stale`');
    });

    it('a staleTime the compiler cannot read is PDX_LOADER_UNKNOWN_OPTION too', () => {
        const errors = warningsOf(pdx('@loader user: loadUser { staleTime: ttl };')).filter((w) => w.code === 'PDX_LOADER_UNKNOWN_OPTION');
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('staleTime: ttl');
    });
});

describe('readMilliseconds', () => {
    it('reads a literal, with underscores, and a product of literals', () => {
        expect(readMilliseconds('30_000')).toBe(30_000);
        expect(readMilliseconds('5 * 60_000')).toBe(300_000);
        expect(readMilliseconds('0')).toBe(0);
    });

    it('control — not a name, a call, a fraction or a sign', () => {
        for (const text of ['ttl', 'ms(30)', '1.5', '-1', '30_', '']) expect(readMilliseconds(text), text).toBeUndefined();
    });
});
