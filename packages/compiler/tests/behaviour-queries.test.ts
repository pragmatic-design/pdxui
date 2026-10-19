// The design CSS under baseline-2026 (#156): a rule on a theme behaviour attribute becomes a container
// style query on the token the theme declares. The behaviour in a browser — a nested theme with its own
// behaviours, a switch in the same frame — is packages/showcase/tests/theme-behaviours.spec.ts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { behaviourQueries } from '../src/compiler/behaviour-queries';

const DESIGN_SRC = join(__dirname, '../../design/src');

const flat = (css: string): string => css.replace(/\s+/g, ' ').trim();

describe('behaviourQueries', () => {
    it('turns a rule on a behaviour attribute into a style query on its token', () => {
        const out = behaviourQueries('[pdx-card-style="elevated"] .pdx-surface-card { border: none; }');
        expect(flat(out)).toBe('@container style(--pdx-card-style: elevated) { :is(:root, *) .pdx-surface-card { border: none; } }');
    });

    it('reads tab-style from --pdx-tab-indicator, the token the themes declare', () => {
        expect(flat(behaviourQueries('[pdx-tab-style=pill] .pdx-tab { color: red; }')))
            .toBe('@container style(--pdx-tab-indicator: pill) { :is(:root, *) .pdx-tab { color: red; } }');
    });

    it('keeps the weight of the attribute it removes, and the theme attribute beside it', () => {
        const out = flat(behaviourQueries('[pdx-input-style="underlined"][pdx-theme="editorial"] .pdx-input-wrap:focus-within { box-shadow: none; }'));
        expect(out).toBe('@container style(--pdx-input-style: underlined) { [pdx-theme="editorial"]:is(:root, *) .pdx-input-wrap:focus-within { box-shadow: none; } }');
    });

    it('splits an :is() that holds a class and an attribute into a plain rule and a query', () => {
        const out = flat(behaviourQueries(':is(.pdx-tabs-pills, [pdx-tab-style="pill"]) .pdx-tab { padding: 0; }'));
        expect(out).toBe('.pdx-tabs-pills .pdx-tab { padding: 0; } @container style(--pdx-tab-indicator: pill) { :is(:root, *) .pdx-tab { padding: 0; } }');
    });

    it('groups the selectors of one list by their query, and leaves the plain ones plain', () => {
        const out = flat(behaviourQueries('.a, [pdx-input-style="filled"] .b, [pdx-input-style="filled"] .c, [pdx-input-focus="bottom"] .d { x: 1; }'));
        expect(out).toBe('.a { x: 1; } '
            + '@container style(--pdx-input-style: filled) { :is(:root, *) .b, :is(:root, *) .c { x: 1; } } '
            + '@container style(--pdx-input-focus: bottom) { :is(:root, *) .d { x: 1; } }');
    });

    it('joins two behaviours of one compound with `and`', () => {
        expect(flat(behaviourQueries('[pdx-input-style="filled"][pdx-input-focus="bottom"] .w { x: 1; }')))
            .toBe('@container style(--pdx-input-focus: bottom) and style(--pdx-input-style: filled) { :is(:root, *):is(:root, *) .w { x: 1; } }');
    });

    it('rewrites inside @layer and @media, and copies what it does not touch', () => {
        const css = '@layer pdx.components { @media (min-width: 1px) { [pdx-card-style="flat"] .c { a: b; } } .k { c: d; } } @keyframes k { from { e: f; } } @import url("x.css");';
        const out = flat(behaviourQueries(css));
        expect(out).toContain('@layer pdx.components { @media (min-width: 1px) { @container style(--pdx-card-style: flat) { :is(:root, *) .c { a: b; } } } .k { c: d; } }');
        expect(out).toContain('@keyframes k { from { e: f; } }');
        expect(out).toContain('@import url("x.css");');
    });

    it('drops comments, so one naming an attribute is not mistaken for a selector', () => {
        const out = behaviourQueries('/* via [pdx-card-style="elevated"] on <html> */ .k { a: b; }');
        expect(flat(out)).toBe('.k { a: b; }');
    });

    it('control — CSS without a behaviour attribute comes back with its rules as written', () => {
        const css = '.a { b: c; } [pdx-theme="material"] .x:not(.y) { d: e; }';
        expect(flat(behaviourQueries(css))).toBe(flat(css));
    });

    it('rewrites every stylesheet @pdxui/design ships, and leaves no rule on a behaviour attribute', () => {
        const files = readdirSync(DESIGN_SRC, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css'));
        let queries = 0;
        for (const file of files) {
            const out = behaviourQueries(readFileSync(join(DESIGN_SRC, file), 'utf8'));
            expect(out, file).not.toMatch(/\[pdx-(input-style|input-focus|tab-style|card-style)/);
            queries += out.split('@container style(').length - 1;
        }
        // The rules the design CSS writes on the four attributes, counted when this was written: the
        // count moves with the CSS, and a rewrite that dropped them would show here as fewer.
        expect(queries).toBeGreaterThanOrEqual(30);
    });

    it('refuses an attribute it cannot place: not in the leading compound', () => {
        expect(() => behaviourQueries('.a [pdx-card-style="flat"] .c { a: b; }')).toThrow(/pdx-card-style/);
        expect(() => behaviourQueries('.a:not([pdx-input-style="filled"]) { a: b; }')).toThrow(/pdx-input-style/);
    });
});
