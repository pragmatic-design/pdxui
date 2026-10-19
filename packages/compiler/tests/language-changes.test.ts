// The registry of language changes and the compiler's half of it (#121).
//
// A `removed` form is PDX_REMOVED_FORM (error), whose message names the beta form and `pdx migrate`.
// A `changed` form and a `fix` are silent at compile: `pdx migrate` rewrites or reports them. No
// issue has removed a form yet, so the consumers are tested with entries put in through the seam.

import { describe, it, expect, afterEach } from 'vitest';
import { compile } from '../src/plugin';
import {
    LANGUAGE_CHANGES, languageChanges, removedExport, setLanguageChangesForTests,
    type LanguageChange,
} from '../src/language/changes';

const page = (template: string, script = '') =>
    `<template>\n  ${template}\n</template>\n<script>\n${script}\n</script>\n`;

const removedFormsOf = (source: string) =>
    compile(source, 'x.pdx').warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');

/** A test entry: `@oldform` is removed, `@newform` replaces it. */
const OLD_FORM: LanguageChange = {
    id: 'test-old-form', kind: 'removed', scope: 'pdx', issue: 0,
    message: 'write `@newform` instead.',
    detect: (text) => [...text.matchAll(/@oldform\b/g)].map((m) => ({ line: text.slice(0, m.index).split('\n').length, found: m[0] })),
    fix: (text) => text.replace(/@oldform\b/g, '@newform'),
};

afterEach(() => setLanguageChangesForTests(null));

describe('a removed form', () => {
    it('is PDX_REMOVED_FORM, an error naming the beta form and pdx migrate, at its line', () => {
        setLanguageChangesForTests([OLD_FORM]);
        const source = page('<p>x</p>', 'let n = $signal(1);\n// @oldform here');
        const [w, ...more] = removedFormsOf(source);
        expect(more).toEqual([]);
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain('@newform');
        expect(w?.message).toContain('pdx migrate');
        expect(w?.line).toBe(source.split('\n').findIndex((l) => l.includes('@oldform')) + 1);
    });

    it('control — a file without the form is not reported', () => {
        setLanguageChangesForTests([OLD_FORM]);
        expect(removedFormsOf(page('<p>x</p>', 'let n = $signal(1);'))).toEqual([]);
    });

    it('a changed form and a fix are silent at compile', () => {
        setLanguageChangesForTests([
            { ...OLD_FORM, id: 'test-changed', kind: 'changed' },
            { ...OLD_FORM, id: 'test-fix', kind: 'fix', fix: 'flag' },
        ]);
        expect(removedFormsOf(page('<p>x</p>', '// @oldform'))).toEqual([]);
    });

    it('a form the compiler reports under a code of its own is not reported twice', () => {
        setLanguageChangesForTests([{ ...OLD_FORM, reportedAs: 'PDX_SOMETHING' }]);
        expect(removedFormsOf(page('<p>x</p>', '// @oldform'))).toEqual([]);
    });

    it('an import of a removed export in a .pdx script is PDX_REMOVED_FORM naming the replacement', () => {
        setLanguageChangesForTests([removedExport('@pdxui/core', 'oldThing', '`newThing()`', 0)]);
        const source = page('<p>{{ n }}</p>', "import { signal, oldThing } from '@pdxui/core';\nlet n = $signal(1);");
        const [w] = removedFormsOf(source);
        expect(w?.message).toContain('oldThing');
        expect(w?.message).toContain('newThing()');
        expect(w?.line).toBe(source.split('\n').findIndex((l) => l.includes('oldThing')) + 1);
    });

    it('the registry itself reports nothing in a file written today', () => {
        expect(languageChanges()).toBe(LANGUAGE_CHANGES);
        expect(removedFormsOf(page('<p>{{ n }}</p>', 'let n = $signal(1);\nfunction f() { n = 2; }'))).toEqual([]);
    });
});

describe('the entries of #187, #107 and #260', () => {
    const entry = (id: string) => LANGUAGE_CHANGES.find((c) => c.id === id)!;

    it('flags an arrow function assigned to a $signal not typed as a function', () => {
        const source = page('<button @click="cb = () => go()">x</button>', 'let cb = $signal(null);\nfunction set() { cb = (v) => v + 1; }');
        const found = entry('signal-arrow-assignment').detect(source);
        expect(found.map((f) => f.line)).toEqual([2, 6]);
    });

    it('does not flag one typed as a function, nor a value assignment', () => {
        const typed = page('<p>x</p>', 'let cb = $signal<() => void>(() => {});\nfunction set() { cb = () => go(); }');
        expect(entry('signal-arrow-assignment').detect(typed)).toEqual([]);
        const values = page('<p>x</p>', 'let n = $signal(0);\nfunction f() { n = n + 1; n = 2; }');
        expect(entry('signal-arrow-assignment').detect(values)).toEqual([]);
    });

    it('flags ??=, ||= and &&= with a function on the right, and not with a value', () => {
        const source = page('<p>x</p>', 'let h = $signal(null);\nh ??= () => 1;\nh ||= function () {};\nh &&= 5;');
        expect(entry('signal-logical-assignment').detect(source).map((f) => f.line)).toEqual([6, 7]);
    });

    it('both are fixes: reported by pdx migrate, never an error', () => {
        expect(entry('signal-arrow-assignment').kind).toBe('fix');
        expect(entry('signal-logical-assignment').kind).toBe('fix');
        const source = page('<p>x</p>', 'let cb = $signal(null);\nfunction set() { cb = () => 1; }');
        expect(removedFormsOf(source)).toEqual([]);
    });

    it('flags inlineBindings in a Vite config', () => {
        const config = "export default defineConfig({\n  plugins: [pdx({ inlineBindings: false })],\n});\n";
        expect(entry('inline-bindings-option').detect(config).map((f) => f.line)).toEqual([2]);
        expect(entry('inline-bindings-option').detect('plugins: [pdx()]')).toEqual([]);
    });

    it('flags an unknown @defer trigger, reading a trigger with its own parentheses', () => {
        const source = page('@defer (viewprt) { <p>a</p> }\n  @defer (idle(500)) { <p>b</p> }\n  @defer (timer(200) | hover) { <p>c</p> }');
        const found = entry('defer-unknown-trigger').detect(source);
        expect(found.map((f) => f.found)).toEqual(['@defer (viewprt)']);
        // Its compile error is PDX_DEFER_UNKNOWN_TRIGGER's, not a second one.
        expect(removedFormsOf(source)).toEqual([]);
    });
});
