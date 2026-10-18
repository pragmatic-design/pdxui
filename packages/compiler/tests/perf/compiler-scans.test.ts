// The compiler's scans of a .pdx, an index.html and a route path take linear time on the inputs CodeQL
// names (#70, js/polynomial-redos). Each case is the shape its alert gives: an opener repeated
// without its closer. Measured here, alone, where a clock means something.

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/plugin';
import { parseSFC } from '../../src/parser/sfc';
import { minifyHTML } from '../../src/compiler/minify';
import { parseIgnores } from '../../src/compiler/ignores';
import { coreRuntimeNames } from '../../src/compiler/core-import-names';
import { injectSplash } from '../../src/splash';
import { stripHtmlComments, isRouterSeam, injectAfterHeadOpen, shortPath } from '../../src/plugin-utils';
import { extractLegacyScript } from '../../src/compiler/codegen-legacy';
import { elementContent } from '../../src/text-scan';
import { routeFieldQuotedFix } from '../../src/compiler/fix-builders';
import { parseRouteParams } from '../../src/compiler/script-analyzer-helpers';
import { checkVirtualFor } from '../../src/compiler/validate-virtual';
import { parseTemplate, type TemplateNode } from '../../src/parser/template';
import { routeKey, routeParamsType } from '../../src/route-types';

/** How long `fn` takes, and how it ended: a malformed input may be refused, and refusing it is timed too. */
function elapsed(fn: () => void): { ms: number; outcome: string } {
    const start = performance.now();
    let outcome = 'ok';
    try { fn(); } catch (err) { outcome = `refused: ${String((err as Error).message).slice(0, 60)}`; }
    return { ms: performance.now() - start, outcome };
}

// 120,000 characters: before the scans every case below took 400 ms to 60 s at this size on the
// machine they were written on, growing 14-24x when the input grew 4x; a linear scan takes a few ms.
const BOUND = 300;
const N = 120_000;

/** A .pdx with this template body and a script that is plain new mode. */
const pdx = (template: string, script = 'let a = $signal(0);') => `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>\n`;

const cases: [string, () => void][] = [
    ['parseSFC: <script and a run of tabs (alert #10)', () => parseSFC('<script' + '\t'.repeat(N))],
    ['parseSFC: <style and a run of tabs (alert #11)', () => parseSFC('<style' + '\t'.repeat(N))],
    // Called directly: through compile() a script this deeply nested overflows the stack in an
    // earlier pass before it reaches these.
    ['legacy defineProps({{ repeated (alert #1)', () => extractLegacyScript('const props = ' + 'defineProps({{'.repeat(N / 14))],
    ['legacy defineEmits< repeated (alert #2)', () => extractLegacyScript('defineEmits<'.repeat(N / 12))],
    ['legacy defineEmits and a run of tabs (alert #2)', () => extractLegacyScript('defineEmits' + '\t'.repeat(N) + 'x')],
    ['form binding: <pdx-form and a tab, repeated (alert #3)', () => compile(pdx(`<div>${'<pdx-form\t'.repeat(N / 10)}</div>`), 'f.pdx')],
    ['form binding: <pdx-field-group and a tab, repeated (alert #4)', () => compile(pdx(`<pdx-form :form="f">${'<pdx-field-group\t'.repeat(N / 17)}</pdx-form>`), 'f.pdx')],
    ['route constraints: :0(( repeated (alerts #12, #151)', () => compile(pdx('<p>x</p>', `@page '/a${':0(('.repeat(N / 4)}';\nlet a = $signal(0);`), 'r.pdx')],
    ['core import: {{| repeated (alert #6)', () => coreRuntimeNames('import ' + '{{|'.repeat(N / 3))],
    ['minifyHTML: <pre repeated (alert #7)', () => minifyHTML('<pre'.repeat(N / 4))],
    ['minifyHTML: <pre> repeated (alert #7)', () => minifyHTML('<pre>'.repeat(N / 5))],
    ['parseIgnores: a pdx-ignore comment and a run of tabs (alert #8)', () => parseIgnores('/*pdx-ignore\tPDX_0' + '\t'.repeat(N) + 'x')],
    ['stripHtmlComments: <!-- repeated (alerts #9, #16)', () => stripHtmlComments('<!--'.repeat(N / 4))],
    ['template bindings: <A and a run of - (alert #13)', () => compile(pdx('<div>&lt;</div>' + '<A' + '-'.repeat(N)), 'v.pdx')],
    ['template bindings: <A" repeated (alert #13)', () => compile(pdx('<A"' + '"<A"'.repeat(N / 4)), 'v.pdx')],
    ['injectSplash: <title repeated (alert #14)', () => injectSplash('<title'.repeat(N / 6) + '<body>', {})],
    ['injectSplash: <body= repeated (alert #15)', () => injectSplash('<body' + '<body='.repeat(N / 6))],
    // Not reachable through compile(): parseSFC refuses an unclosed <template> or <script> first. The
    // scan that replaced the component-import pass's regex is measured instead.
    ['component imports: <template> and a, repeated (alert #17)', () => elementContent('<template>a'.repeat(N / 11), 'template')],
    ['component imports: <script> and a, repeated (alert #18)', () => elementContent('<script>a'.repeat(N / 9), 'script')],
    ['router seam: the seam path repeated (alert #19)', () => isRouterSeam('@pdxui/router/src/active.ts?' + '/@pdxui/router/src/active.ts?'.repeat(N / 30) + '\n')],
    ['index.html: <head repeated (alerts #20, #21)', () => injectAfterHeadOpen('<head'.repeat(N / 5), '<script></script>')],
    ['tag collision message: a run of a (alerts #22, #23)', () => shortPath('a'.repeat(N))],
    ['route field fix: a name and a run of tabs (alert #154)', () => routeFieldQuotedFix('0' + '\t'.repeat(N),
        { code: 'PDX_ROUTE_FIELD_INVALID', severity: 'error', message: '', line: 1, column: 1 })],
    // Measured on the machine it was written on: 11.7 s for 100,000 characters before the rewrite (#266).
    ['@params: a run of 0 with no colon (alert #157)', () => parseRouteParams('{ ' + '0'.repeat(N) + ' }')],
    // Linear before their rewrite too (#461: 160,000 tabs in 0.2 ms, the regex alone): CodeQL could
    // not see it, and these keep the rewrite as fast.
    ['handler arrow: $=> and a run of tabs (alert #159)', () => compile(pdx(`<button @click="$=>${'\t'.repeat(N)}">x</button>`), 'h.pdx')],
    ['handler assignment: a -= and a run of tabs (alert #160)', () => compile(pdx(`<button @click="a-=${'\t'.repeat(N)}">x</button>`), 'h.pdx')],
    // The regex it replaced took about 6 s for 200,000 characters on the machine it was written on (#150).
    ['route types: :A(( repeated (alerts #170, #171)', () => { const p = `/:A(${':A(('.repeat(N / 4)}`; routeKey(p); routeParamsType(p); }],
    // The regex it replaced took 1.7 s for 200,000 characters (#283).
    ['@for … @virtual shape: an open <ul> and <!-- repeated', () => checkVirtualFor([
        { type: 'html', content: `<ul><!--${'<!--'.repeat(N / 4)}` },
        ...parseTemplate('@for (xs as x; track x) @virtual { <li>{{ x }}</li> }'),
        { type: 'html', content: '</ul>' },
    ] as TemplateNode[])],
];

describe('linear scans in the compiler', () => {
    for (const [label, fn] of cases) {
        it(label, () => {
            const { ms, outcome } = elapsed(fn);
            console.log(`  ⏱ ${label}: ${ms.toFixed(1)} ms (${outcome})`);
            expect(ms).toBeLessThan(BOUND);
        });
    }
});
