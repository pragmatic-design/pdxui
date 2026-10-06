// A generated theme's component rules stop at a nested root of another theme.
//
// The 13 shipped themes carry the guard on every rule's subject. createTheme().toCSS() writes its
// design language's and its author's cssOverrides as nested rules, and they carry it too: without
// it, a theme saved from the builder would reach into a nested theme.

import { describe, it, expect } from 'vitest';
import { createTheme } from '@pdxui/design/engine';
import { guardThemeRules, nestedThemeGuard } from '../../design/src/engine/nested-theme-guard';

const GUARD = nestedThemeGuard('test');

/** A selector list split at its top-level commas — the guard's own `:where(a, b)` has one inside. */
function selectorsOf(list: string): string[] {
    const out: string[] = [];
    let depth = 0, start = 0;
    for (let k = 0; k < list.length; k++) {
        const c = list[k];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { out.push(list.slice(start, k)); start = k + 1; }
    }
    return [...out, list.slice(start)];
}

describe('createTheme().toCSS() guards its component rules', () => {
    const css = createTheme({ name: 'test', brandColor: '#1d4ed8', language: 'pragmatic' }).toCSS();
    const rules = css.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('&') && l.includes('{'));

    it('every nested rule of the pragmatic language carries the guard on each selector\'s subject', () => {
        expect(rules.length, 'the pragmatic language has no nested rules: nothing measured').toBeGreaterThan(20);
        const unguarded = rules.filter((r) => {
            const selectors = selectorsOf(r.slice(0, r.indexOf('{')));
            return selectors.some((s) => !s.includes(GUARD));
        });
        expect(unguarded).toEqual([]);
    });

    it('the guard sits before a pseudo-element, and the token block has none', () => {
        expect(css).toContain(`& details.pdx-accordion summary${GUARD}::after {`);
        expect(css).toContain(`& .pdx-primary${GUARD} {`);
        expect(css.split('\n')[0]).toBe('[pdx-theme="test"] {');
    });

    it('an author\'s cssOverrides are guarded too', () => {
        const own = createTheme({ name: 'test', brandColor: '#1d4ed8', language: 'neutral', cssOverrides: '& .pdx-button:hover { color: red; }' }).toCSS();
        expect(own).toContain(`& .pdx-button:hover${GUARD} { color: red; }`);
    });
});

describe('guardThemeRules', () => {
    it('guards each selector of a list, and leaves the root\'s own compound alone', () => {
        expect(guardThemeRules('&[pdx-tab-style="pill"] .pdx-tabs, & .a > b { x: 1; }', 'test'))
            .toBe(`&[pdx-tab-style="pill"] .pdx-tabs${GUARD}, & .a > b${GUARD} { x: 1; }`);
        expect(guardThemeRules('&[pdx-card-style="flat"] { x: 1; }', 'test')).toBe('&[pdx-card-style="flat"] { x: 1; }');
    });

    it('recurses into at-rules, and skips comments, strings and a rule already guarded', () => {
        const input = `/* a { b } */\n@media (min-width: 40rem) { & .a { content: "} {"; } }\n& .b${GUARD} { x: 1; }`;
        expect(guardThemeRules(input, 'test'))
            .toBe(`/* a { b } */\n@media (min-width: 40rem) { & .a${GUARD} { content: "} {"; } }\n& .b${GUARD} { x: 1; }`);
    });

    it('is idempotent', () => {
        const once = guardThemeRules('& .a::before, & .b:hover { x: 1; }', 'test');
        expect(guardThemeRules(once, 'test')).toBe(once);
    });
});
