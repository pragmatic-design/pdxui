// A removed form is looked for only where its marker is (#648).
//
// Every compile ran every removed form's `detect`, about forty of them, each a scan of the script or
// the template, for forms a source written in the beta form never contains: some 8% of a compile.
// Each removed entry now names a `marker`, a substring or a regex every instance of the form contains,
// and `checkRemovedForms` runs `detect` only on a source that has it.
//
// A marker that a real instance lacks would hide the form in silence. So the compiler's tests run with
// every registry entry's `detect` wrapped (tests/setup/marker-guard.ts): whenever a test's fixture is
// detected, the fixture must contain the entry's marker, or the test fails. The entries' own tests are
// that fixture set.

import { describe, it, expect, afterEach } from 'vitest';
import { compile } from '../src/plugin';
import { LANGUAGE_CHANGES, hasMarker, setLanguageChangesForTests, type LanguageChange } from '../src/language/changes';

const page = (template: string, script = '') =>
    `<template>\n  ${template}\n</template>\n<script>\n${script}\n</script>\n`;

afterEach(() => setLanguageChangesForTests(null));

/** A removed entry whose `detect` counts its calls. */
function counted(marker: LanguageChange['marker'], scope: LanguageChange['scope'] = 'pdx'): { change: LanguageChange; calls: () => number } {
    let calls = 0;
    const change: LanguageChange = {
        id: 'test-marked', kind: 'removed', scope, issue: 0, marker,
        message: 'write `@newform` instead.',
        detect: (text) => { calls++; return [...text.matchAll(/@oldform\b/g)].map((m) => ({ line: 1, found: m[0] })); },
        fix: 'flag',
    };
    return { change, calls: () => calls };
}

describe('checkRemovedForms and a marker', () => {
    it('does not run detect on a source without the marker', () => {
        const { change, calls } = counted('@oldform');
        setLanguageChangesForTests([change]);
        compile(page('<p>x</p>', 'let n = $signal(1);'), 'x.pdx');
        expect(calls()).toBe(0);
    });

    it('runs it, and reports, on a source with the marker', () => {
        const { change, calls } = counted('@oldform');
        setLanguageChangesForTests([change]);
        const { warnings } = compile(page('<p>x</p>', '// @oldform'), 'x.pdx');
        expect(calls()).toBe(1);
        expect(warnings.filter((w) => w.code === 'PDX_REMOVED_FORM')).toHaveLength(1);
    });

    it('reads a script entry\'s marker in the script, where its detect looks', () => {
        const { change, calls } = counted(/@old\w+/, 'script');
        setLanguageChangesForTests([change]);
        compile(page('<p>@oldform</p>', 'let n = $signal(1);'), 'x.pdx');
        expect(calls(), 'the marker is in the template only').toBe(0);
        compile(page('<p>x</p>', '// @oldform'), 'x.pdx');
        expect(calls()).toBe(1);
    });
});

describe('the registry\'s markers', () => {
    const run = LANGUAGE_CHANGES.filter((c) => c.kind === 'removed' && !c.reportedAs);

    it('every removed form the compiler checks names one', () => {
        expect(run.filter((c) => c.marker === undefined).map((c) => c.id)).toEqual([]);
    });

    it('a regex marker is not global: `test` on a global regex moves its lastIndex between sources', () => {
        expect(run.filter((c) => c.marker instanceof RegExp && (c.marker.global || c.marker.sticky)).map((c) => c.id)).toEqual([]);
    });

    it('hasMarker reads a string as a substring and a regex as a test', () => {
        expect([hasMarker('a ref="x"', 'ref='), hasMarker('a', 'ref='), hasMarker('return {', /return\s*\{/), hasMarker('ret', /return/)])
            .toEqual([true, false, true, false]);
    });
});
