// `${…}` inside a bound attribute is an error, never a module that does not parse.
//
// Written into the module as it is, `:label="${x}"` kills a production build in rollup —
// `app.pdx (64:0): Expected ',', got '{'`. The value of `:attr`/`@event` is already an
// expression, so `${` there is a mistake with one meaning, and the compile stops on it with a
// position instead of emitting JavaScript nobody can load.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

const page = (attrs: string, script = 'let a = $signal(1);\nfunction go() {}') =>
    `<template>\n  <div ${attrs}></div>\n</template>\n<script setup>\n${script}\n</script>\n`;

/** The module's syntax errors, as TypeScript's parser reports them. */
function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('out.js', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    return ((sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics ?? [])
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

describe('${…} inside a bound attribute', () => {
    it('stops the compile with PDX_RAW_INTERPOLATION_IN_BINDING and the line and column of the ${', () => {
        expect(() => compile(page(':title="${a}"'), 'x.pdx')).toThrow(/PDX_RAW_INTERPOLATION_IN_BINDING.*x\.pdx:2:16/s);
    });

    it('the same for an event handler', () => {
        expect(() => compile(page('@click="${go}"'), 'x.pdx')).toThrow(/PDX_RAW_INTERPOLATION_IN_BINDING/);
    });

    it('the message says what to write instead', () => {
        expect(() => compile(page(':title="${a}"'), 'x.pdx')).toThrow(/:title="a"/);
    });

    it('the control: a template literal inside the expression is not one, and the module parses', () => {
        const r = compile(page(':class="`btn-${a}`"'), 'x.pdx');
        expect(r.warnings.map((w) => w.code)).not.toContain('PDX_RAW_INTERPOLATION_IN_BINDING');
        expect(parseErrors(r.code)).toEqual([]);
    });

    it('the control: ${} in a plain attribute is still the warning it was', () => {
        const r = compile(page('title="${a}"'), 'x.pdx');
        expect(r.warnings.map((w) => w.code)).toContain('PDX_RAW_INTERPOLATION');
    });
});
