// An `export` in a @store module stays at module level.
//
// A `.pdx.ts` that declares `@store name;` and also exports a constant — a demo page's shared
// `state.pdx.ts` needs both — must not compile into a module with the `export` statement INSIDE the
// store's factory function: that is a syntax error at load, with no warning from the compiler.
//
// An exported declaration is not store state: it belongs to the module, outside the factory, and
// the store body keeps only what it owns.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

const SOURCE = `@store dropdownMenuLog;
export const basicItems = [{ key: 'a' }];
export function describeItem(item) { return item.key; }
let lastSelect = $signal('-');
function onSelect(e) { lastSelect = e.detail.key; }
`;

/**
 * The module parses as an ES module, and every `export` sits on a top-level statement. Read with the
 * TypeScript parser: its parse diagnostics alone accept an `export` inside a function body, and a
 * line-based strip of `^export ` would hide one the generator left at column 0 inside the factory —
 * which is where the first one landed.
 */
function parses(code: string): void {
    const sf = ts.createSourceFile('store.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const syntax = (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    expect(syntax.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), `generated module does not parse:\n${code}`).toEqual([]);
    const nested: string[] = [];
    const visit = (n: ts.Node) => {
        if (n.kind === ts.SyntaxKind.ExportKeyword && n.parent.parent !== sf) nested.push(n.parent.getText(sf).split('\n')[0]);
        ts.forEachChild(n, visit);
    };
    sf.statements.forEach(s => ts.forEachChild(s, visit));
    expect(nested, `an export is not at module level:\n${code}`).toEqual([]);
}

describe('@store module with exports', () => {
    for (const [label, opts] of [['dev', {}], ['production', { production: true }]] as const) {
        it(`${label}: compiles to a module that parses, with no warning`, () => {
            const { code, warnings } = compile(SOURCE, 'state.pdx.ts', [], undefined, opts);
            parses(code);
            expect(warnings).toEqual([]);
        });

        it(`${label}: the exports are the module's, and the store keeps what it owns`, () => {
            const { code } = compile(SOURCE, 'state.pdx.ts', [], undefined, opts);
            expect(code).toMatch(/^export const basicItems = \[\{ key: 'a' \}\];$/m);
            expect(code).toMatch(/^export function describeItem\(item\)/m);
            const factory = code.slice(code.indexOf('createGlobalStore('), code.indexOf('export function useDropdownMenuLog'));
            expect(factory, 'an export is still inside the store factory').not.toMatch(/\bexport\b/);
            expect(factory).toContain('onSelect');
            expect(factory).toContain('lastSelect');
            expect(code).toContain('export function useDropdownMenuLog()');
        });
    }

    it('the store body can still read an exported constant', () => {
        const { code } = compile(`@store menu;
export const ITEMS = ['a', 'b'];
let selected = $signal(ITEMS[0]);
`, 'menu.pdx.ts');
        parses(code);
        expect(code).toMatch(/^export const ITEMS = /m);
        // The constant is declared before the factory that reads it runs (the factory runs lazily, at
        // the first useMenu(), but a module-level const above it is initialised either way).
        expect(code.indexOf('export const ITEMS')).toBeLessThan(code.indexOf('createGlobalStore('));
    });

    const READS_THE_STORE = `@store menu;
let selected = $signal('a');
function pick(k) { selected = k; }
export const label = () => selected + '!';
export function choose(selected) { return selected; }
`;

    it('an export that reads what the store owns is an error — it cannot live outside the store', () => {
        const { warnings } = compile(READS_THE_STORE, 'menu.pdx.ts');
        const errors = warnings.filter(w => w.code === 'PDX_STORE_EXPORT');
        // `label` reads the signal; `choose` only reads its own parameter of the same name.
        expect(errors.map(w => w.severity)).toEqual(['error']);
        expect(errors[0].message).toContain('`export const label = () => selected + \'!\';`');
        expect(errors[0].message).toContain("'selected'");
        expect(errors[0].hint).toContain('useMenu()');
    });

    it('…and in a .pdx store it points at the export\'s line', () => {
        const source = `<template><div></div></template>\n<script setup>\n${READS_THE_STORE}</script>\n`;
        const errors = compile(source, 'menu-store.pdx').warnings.filter(w => w.code === 'PDX_STORE_EXPORT');
        expect(errors.map(w => [w.line, w.column])).toEqual([[6, 1]]);
    });

    it('the control: the guard sees the bug shape — a store module with no exports is untouched', () => {
        const { code, warnings } = compile(`@store menu;\nlet selected = $signal('a');\n`, 'menu.pdx.ts');
        parses(code);
        expect(warnings).toEqual([]);
        expect(code).toMatch(/^const __store_menu = createGlobalStore\('menu', \(\) => \{$/m);
    });
});
