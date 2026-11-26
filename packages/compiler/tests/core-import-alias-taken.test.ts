// A core import aliased to a name the compiler binds stops the compile, naming both (#1254).
//
// A script's imports from @pdxui/core are merged into the import the compiler writes. `import
// { component as defineComponent }` put `defineComponent` in that import twice, once for core's
// `component` and once for the `defineComponent` the module calls: the module did not parse, and the
// error came from the bundler at a column of generated code. The site build met it in a demo when
// #1246 made the compiler emit `defineComponent`.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

/** The ES parse errors of a module, as TypeScript's parser reports them. */
function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('m.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diagnostics = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
    return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

const page = (script: string) => `<template><p>{{ n }}</p></template>\n<script>\n${script}\nlet n = $signal(0);\n</script>`;

describe('a core import aliased to a name the compiler binds', () => {
    it('stops the compile with PDX_IMPORT_NAME_TAKEN, naming the alias and the export', () => {
        expect(() => compile(page("import { component as defineComponent } from '@pdxui/core';"), 'w.pdx'))
            .toThrow(/PDX_IMPORT_NAME_TAKEN.*defineComponent.*component/s);
    });

    it('in a @store module too', () => {
        const store = "<script>\nimport { computed as signal } from '@pdxui/core';\n@store cart;\nlet items = $signal([]);\n</script>";
        expect(() => compile(store, 'cart.pdx')).toThrow(/PDX_IMPORT_NAME_TAKEN.*signal/s);
    });
});

describe('controls — imports that bind what the compiler binds, or another name', () => {
    it('`import { signal }` beside a $signal: merged, and the module parses', () => {
        const { code } = compile(page("import { signal } from '@pdxui/core';"), 'w.pdx');
        expect(parseErrors(code)).toEqual([]);
    });

    it('`import { signal as rawSignal }`: a name the compiler does not bind, and the module parses', () => {
        const { code } = compile(page("import { signal as rawSignal } from '@pdxui/core';\nconst raw = rawSignal(1);"), 'w.pdx');
        expect(parseErrors(code)).toEqual([]);
        expect(code).toMatch(/signal as rawSignal/);
    });
});
