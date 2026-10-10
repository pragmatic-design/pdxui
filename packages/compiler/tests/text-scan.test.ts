// The scans that replaced the compiler's polynomial regexes (#70) answer what the regexes answered on
// ordinary input. The expected values are the old answers, written out — not a copy of the old
// patterns, which code scanning would flag again wherever they were pasted.

import { describe, it, expect } from 'vitest';
import { openTags, findOpenTag, elementContent, removeHtmlComments, routeParams, openingTagTexts, removeElements, elementBodies } from '../src/text-scan';
import { isRouterSeam, injectAfterHeadOpen, shortPath, stripHtmlComments } from '../src/plugin-utils';
import { extractLegacyScript } from '../src/compiler/codegen-legacy';
import { coreRuntimeNames } from '../src/compiler/core-import-names';
import { parseIgnores } from '../src/compiler/ignores';
import { minifyHTML } from '../src/compiler/minify';
import { injectSplash } from '../src/splash';
import { parseSFC } from '../src/parser/sfc';

describe('opening tags', () => {
    it('finds the tag by name, in any case, with what lies before its >', () => {
        expect(findOpenTag('<!doctype html><HTML><Head lang="en">', 'head')).toEqual({
            start: 21, end: 37, text: '<Head lang="en">', attrs: ' lang="en"',
        });
    });

    it('does not take a longer name for it: <header> is not <head>', () => {
        expect(findOpenTag('<body><header>x</header></body>', 'head')).toBeNull();
    });

    it('lists every one, and stops where none can close', () => {
        expect([...openTags('<a x><a><a y', 'a')].map((t) => t.text)).toEqual(['<a x>', '<a>']);
    });

    it('elementContent: the first element\'s content, or null when it never closes', () => {
        expect(elementContent('<template lang="x"><p>a</p></template><template>b</template>', 'template')).toBe('<p>a</p>');
        expect(elementContent('<template><p>a</p>', 'template')).toBeNull();
    });
});

describe('whole elements', () => {
    it('removes each <script> and its content, in any case and with a space before the closing >', () => {
        expect(removeElements('a<script>x</script>b<SCRIPT type="m">y</SCRIPT >c<script>never', 'script'))
            .toBe('abc<script>never');
    });

    it('lists each body, and a <script> named inside a script is its text', () => {
        expect(elementBodies('<script>let s = "<script>";</script><p></p><script src="a"></script>', 'script'))
            .toEqual(['let s = "<script>";', '']);
    });
});

describe('comments and route params', () => {
    it('removes each comment up to its own -->, and leaves one that never closes', () => {
        expect(removeHtmlComments('a<!-- x -->b<!-- y -->c<!-- z')).toBe('abc<!-- z');
        expect(stripHtmlComments('<p><!-- <pdx-select> -->x</p>')).toBe('<p>x</p>');
    });

    it('reads :name and :name(constraint), the constraint up to the first )', () => {
        expect(routeParams('/users/:id(number)/posts/:slug/:x()/:y(')).toEqual([
            { name: 'id', constraint: 'number' },
            { name: 'slug' },
            { name: 'x', constraint: '' },
            { name: 'y' },
        ]);
    });
});

describe('opening tag texts in markup', () => {
    it('keeps a > inside a quoted value in the tag', () => {
        expect(openingTagTexts('<p :on="e => go(e)" title=\'a>b\'>x</p><br/>')).toEqual([
            '<p :on="e => go(e)" title=\'a>b\'>', '<br/>',
        ]);
    });

    it('skips < that does not start a tag', () => {
        expect(openingTagTexts('1 < 2 <b>x</b>')).toEqual(['<b>']);
    });
});

describe('the compiler passes built on them', () => {
    it('isRouterSeam: both layouts, either separator, a query, and nothing else', () => {
        expect(isRouterSeam('/repo/packages/router/src/active.ts')).toBe(true);
        expect(isRouterSeam('C:\\repo\\node_modules\\@pdxui\\router\\src\\active.tsx?v=1')).toBe(true);
        expect(isRouterSeam('packages/router/src/active.ts')).toBe(true);
        expect(isRouterSeam('/app/src/active.ts')).toBe(false);
        expect(isRouterSeam('/repo/mypackages/router/src/active.ts')).toBe(false);
    });

    it('injectAfterHeadOpen: just inside <head>, or first when there is none', () => {
        expect(injectAfterHeadOpen('<html><head lang="x"><title>t</title>', '<s></s>')).toBe('<html><head lang="x">\n<s></s><title>t</title>');
        expect(injectAfterHeadOpen('<body></body>', '<s></s>')).toBe('<s></s><body></body>');
    });

    it('shortPath: after the last /packages/, then after the last /src/', () => {
        expect(shortPath('/w/packages/a/packages/ui/src/x/y.pdx')).toBe('src/x/y.pdx');
        expect(shortPath('C:\\w\\packages\\ui\\lib\\y.pdx')).toBe('ui\\lib\\y.pdx');
        expect(shortPath('/w/app/y.pdx')).toBe('/w/app/y.pdx');
    });

    it('extractLegacyScript: defineProps with its const, defineEmits with a type and a name', () => {
        const parts = extractLegacyScript('const props = defineProps({ a: { type: String } });\nconst fire = defineEmits<{ x: [] }>();\nconst b = 1;');
        expect(parts.props).toBe('{ a: { type: String } }');
        expect(parts.body).toContain('const fire = (event, detail) => ctx.emit(event, detail);');
        expect(parts.body).not.toContain('defineEmits');
        expect(parts.body).not.toContain('defineProps');
        expect(parts.body).toContain('const b = 1;');
    });

    it('extractLegacyScript: a defineEmits< that never closes does not hide a later defineEmits()', () => {
        const parts = extractLegacyScript('// defineEmits<\nconst e = defineEmits();');
        expect(parts.body).toContain('const e = (event, detail) => ctx.emit(event, detail);');
    });

    it('coreRuntimeNames: the names in the first non-empty braces, without types', () => {
        expect(coreRuntimeNames("import { signal, type Signal, computed } from '@pdxui/core';")).toEqual(['signal', 'computed']);
        expect(coreRuntimeNames("import type { Signal } from '@pdxui/core';")).toEqual([]);
        expect(coreRuntimeNames('import {} {a} x')).toEqual(['a']);
    });

    it('parseIgnores: the three forms, with and without a reason, and -file', () => {
        const src = [
            '<!-- pdx-ignore PDX_A: because -->',
            '/* pdx-ignore-file PDX_B */',
            'x // pdx-ignore PDX_C',
            '// pdx-ignore PDX_D trailing words',
            '// pdx-ignore PDX_E:   spaced reason   ',
        ].join('\n');
        expect(parseIgnores(src)).toEqual([
            { code: 'PDX_A', reason: 'because', line: 1, column: 1, scope: 'next-line' },
            { code: 'PDX_B', reason: '', line: 2, column: 1, scope: 'file' },
            { code: 'PDX_C', reason: '', line: 3, column: 3, scope: 'next-line' },
            { code: 'PDX_E', reason: 'spaced reason', line: 5, column: 1, scope: 'next-line' },
        ]);
    });

    it('minifyHTML: pre and code blocks keep their whitespace, in either case', () => {
        // The trailing `\n</div>` is the old output as well: text after the last block is not collapsed.
        expect(minifyHTML('<div>\n  <PRE>  a\n  b</PRE>\n  <code> x  y </code>\n</div>')).toBe('<div> <PRE>  a\n  b</PRE> <code> x  y </code>\n</div>');
    });

    it('injectSplash: the title and the body tag are read as before', () => {
        const out = injectSplash('<html><head><title> App </title></head><body class="x"><div id="app"></div></body></html>');
        expect(out).toContain('<body class="x" aria-busy="true">');
        expect(out).toContain('<span>App</span>');
    });

    it('parseSFC: script and style attributes, and a self-closing script with src', () => {
        const d = parseSFC('<template><p>x</p></template>\n<script setup lang="ts">let a = 1;</script>\n<style scoped>p{}</style>');
        expect(d.script?.setup).toBe(true);
        expect(d.styles[0]?.scoped).toBe(true);
        expect(parseSFC('<template><p>x</p></template>\n<script setup src="./a.ts" />').script?.src).toBe('./a.ts');
    });
});
