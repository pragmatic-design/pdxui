// The style rewrites produce the CSS that was written (#205).
//
// 1. A selector list inside `:is()`, `:where()`, `:not()`, `:has()` was split at its commas, and the
//    scope attribute pasted into the middle of it.
// 2. `responsive(1rem, 2rem)` grew by 1px across the viewport range, not by 1rem.
// 4. `<style src>` was empty in a production build: the plugin's style module re-read the .pdx and
//    never resolved `src=`.
// 5. A plain `<style>` kept `responsive()` and `bind()` as written, which no browser understands.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compile, pdx } from '../src/plugin';
import { hash, styleModuleId } from '../src/compiler/codegen-styles';

const sfc = (style: string, script = 'let a = $signal(1);') => `<template><p>{{ a }}</p></template>\n<script>\n${script}\n</script>\n${style}\n`;
/** The CSS a dev compile injects into the head, read back out of the module. */
const injected = (code: string): string => {
    const m = /__pdx_style\.textContent = ("(?:[^"\\]|\\.)*");/.exec(code);
    return m ? JSON.parse(m[1]) as string : '';
};

// The ancestor form these read is baseline-2024's (#152); baseline-2026's donut is scope-donut.test.ts.
const ANCESTOR = { target: 'baseline-2024' } as const;

describe('a selector list inside a functional pseudo-class', () => {
    const H = `[data-pdx-${hash('sel.pdx')}]`;
    for (const fn of ['is', 'where', 'not', 'has']) {
        it(`:${fn}(.a, .b) is one selector, scoped once`, () => {
            const css = injected(compile(sfc(`<style scoped>:${fn}(.a, .b) > span { color: red; }</style>`), 'sel.pdx', [], undefined, ANCESTOR).code);
            expect(css).toContain(`${H} :${fn}(.a, .b) > span`);
            expect(css.split(H)).toHaveLength(2);
        });
    }

    it('control — a top-level list is still split, each selector scoped', () => {
        const css = injected(compile(sfc('<style scoped>.x, .y { color: red; }</style>'), 'sel.pdx', [], undefined, ANCESTOR).code);
        expect(css).toContain(`${H} .x, ${H} .y`);
    });
});

describe('responsive()', () => {
    it('with rem grows by the difference in rem, taken as 16px each', () => {
        const css = injected(compile(sfc('<style scoped>p { font-size: responsive(1rem, 2rem); }</style>'), 'r.pdx').code);
        expect(css).toContain('clamp(1rem, calc(1rem + 16 * ((100vw - 320px) / 1600)), 2rem)');
    });

    it('control — with px the slope is the difference in px', () => {
        const css = injected(compile(sfc('<style scoped>p { font-size: responsive(16px, 64px); }</style>'), 'r.pdx').code);
        expect(css).toContain('clamp(16px, calc(16px + 48 * ((100vw - 320px) / 1600)), 64px)');
    });
});

describe('a plain <style>', () => {
    it('rewrites responsive() and bind() too', () => {
        const css = injected(compile(sfc('<style>p { font-size: responsive(16px, 64px); width: bind(a); }</style>'), 'plain.pdx').code);
        expect(css).toContain('clamp(16px');
        expect(css).toContain(`var(--pdx-${hash('plain.pdx')}-a)`);
        expect(css).not.toContain('responsive(');
        expect(css).not.toContain('bind(');
    });
});

describe('<style src> in a production build', () => {
    const dir = join(__dirname, '.tmp-style-src');
    const file = join(dir, 'card.pdx');
    beforeAll(() => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'card.css'), '.card { color: rebeccapurple; }\n');
        writeFileSync(file, '<template><div class="card">x</div></template>\n<script>\nlet a = $signal(1);\n</script>\n<style scoped src="./card.css" />\n');
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('the style module the bundler loads carries the file the block names', () => {
        const [plugin] = pdx();
        (plugin.configResolved as unknown as (c: unknown) => void)({ root: dir, base: '/', server: { fs: { allow: [] } }, command: 'build', mode: 'production' });
        const load = plugin.load as unknown as (this: { warn(m: string): void }, id: string) => string | null;
        const css = load.call({ warn: () => {} }, '\0' + styleModuleId(file, 0));
        expect(css).toContain('rebeccapurple');
        // The default target's donut scope (#152), rooted at the file's own scope attribute, minified.
        expect(css).toContain(`@scope ([data-pdx-${hash(file)}],[data-pdx-${hash(file)}-in])`);
        expect(css).toContain('.card');
    });
});
