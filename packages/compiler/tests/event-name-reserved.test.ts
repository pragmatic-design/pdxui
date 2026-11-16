// PDX_EVENT_NAME_RESERVED (#1130). An event's emitter is its name's camelCase, a `const` of the setup:
// `@event delete: {}` wrote `const delete = (detail) => …`, a module that does not parse, and the
// compiler stopped on PDX_TS_UNSUPPORTED blaming code the author never wrote. A call `delete({ … })`
// would be the delete operator anyway. The declaration is refused before codegen, named.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string) => `<template>\n  <p>x</p>\n</template>\n<script>\n${script}\n</script>\n`;
const codes = (script: string) => compile(pdx(script), 'x.pdx').warnings.map((w) => w.code);

describe('PDX_EVENT_NAME_RESERVED', () => {
    it('an event named like a reserved word is refused, not compiled into a module that does not parse', () => {
        for (const script of ['@event delete: {};', "@event 'default': {};", '@event(cancelable) new: { id: string };', "@event 'import': {};"]) {
            const got = codes(script);
            expect(got, script).toContain('PDX_EVENT_NAME_RESERVED');
            expect(got, script).not.toContain('PDX_TS_UNSUPPORTED');
        }
    });

    it('names the event, says why, and suggests another name', () => {
        const w = compile(pdx('@event delete: { id: string };'), 'x.pdx').warnings.find((x) => x.code === 'PDX_EVENT_NAME_RESERVED')!;
        expect(w.severity).toBe('error');
        expect(w.message).toContain('delete');
        expect(w.message).toContain('reserved word');
        expect(w.hint).toMatch(/remove|deleted/);
    });

    it('a name that only contains a reserved word is fine: remove, before-import, deleted (the control)', () => {
        for (const script of ['@event remove: {};', "@event 'before-import': {};", '@event deleted: {};', '@event newValue: number;']) {
            const got = codes(script);
            expect(got, script).not.toContain('PDX_EVENT_NAME_RESERVED');
            expect(got, script).not.toContain('PDX_TS_UNSUPPORTED');
        }
    });
});
