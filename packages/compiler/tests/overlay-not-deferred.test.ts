// PDX_OVERLAY_NOT_DEFERRED (#1209): a page that renders a closed overlay outside a `@defer` loads it,
// and everything in it, on the first visit. #1201 measured up to 175 KB gzip on one showcase list page
// whose dialog and drawer open only on a click; `@defer (idle)` around them is the fix (tickets.pdx).
//
// A design warning, with a fix that writes the `@defer` around the run of adjacent overlays.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import type { ValidationWarning } from '../src/compiler/validate';

/** The library's models, as the resolver reads them from the manifest: an overlay has `open`. */
const MODELS: Record<string, string[]> = {
    'pdx-dialog': ['open'], 'pdx-drawer': ['open'], 'pdx-popover': ['open'], 'pdx-input': ['value'],
};
/** The popover declares `trigger`: it opens itself from the element before it. */
const PROPS: Record<string, string[]> = { 'pdx-popover': ['trigger', 'placement'], 'pdx-dialog': ['title'] };
const options = {
    modelsOf: (tag: string) => (MODELS[tag] ? new Set(MODELS[tag]) : null),
    propsOf: (tag: string) => (PROPS[tag] ? new Set(PROPS[tag]) : null),
};

const SCRIPT = "@page '/customers';\nlet editing = $signal(false);\nlet filters = $signal(false);\nlet name = $signal('');";
const sfc = (template: string, script = SCRIPT) => `<template>\n${template}\n</template>\n<script>\n${script}\n</script>\n`;

const found = (source: string): ValidationWarning[] =>
    compile(source, 'customers.pdx', [], undefined, options).warnings.filter(w => w.code === 'PDX_OVERLAY_NOT_DEFERRED');

/** Apply a warning's fix to the source. */
function apply(source: string, w: ValidationWarning): string {
    let out = source;
    for (const e of [...(w.fix?.edits ?? [])].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    return out;
}

const LIST = `<div class="page">
  <h1>Customers</h1>
  <pdx-dialog :open="editing" title="Edit">
    <pdx-input ::value="name" />
  </pdx-dialog>
  <pdx-drawer ::open="filters" title="Filters">
    <p>filters</p>
  </pdx-drawer>
</div>`;

describe('PDX_OVERLAY_NOT_DEFERRED', () => {
    it('fires on a @page with a closed overlay outside @defer, once for a run of adjacent overlays', () => {
        const ws = found(sfc(LIST));
        expect(ws, 'the closed dialog and drawer were not reported').toHaveLength(1);
        expect(ws[0].severity).toBe('warn');
        expect(ws[0].message).toContain('<pdx-dialog>');
        expect(ws[0].message).toContain('<pdx-drawer>');
        expect(ws[0].line, 'reported on another line than the first overlay').toBe(4);
    });

    it('a comment between two overlays does not split the run', () => {
        const ws = found(sfc('<pdx-dialog :open="editing"></pdx-dialog>\n<!-- the filters -->\n<pdx-drawer :open="filters"></pdx-drawer>'));
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('<pdx-drawer>');
    });

    it('two overlays with markup between them are two runs', () => {
        const ws = found(sfc('<pdx-dialog :open="editing"></pdx-dialog>\n<p>between</p>\n<pdx-drawer :open="filters"></pdx-drawer>'));
        expect(ws).toHaveLength(2);
    });

    it('the fix wraps the run in one @defer (idle), compiles, and no longer fires', () => {
        const source = sfc(LIST);
        const [w] = found(source);
        expect(w.fix, 'no fix proposed').toBeDefined();
        const fixed = apply(source, w);
        expect(fixed).toContain('  @defer (idle) {\n    <pdx-dialog :open="editing" title="Edit">');
        expect(fixed).toContain('    </pdx-drawer>\n  }\n</div>');
        const r = compile(fixed, 'customers.pdx', [], undefined, options);
        expect(r.warnings.filter(x => x.severity === 'error'), 'the fixed page does not compile').toEqual([]);
        expect(found(fixed)).toEqual([]);
    });

    describe('the controls', () => {
        it('inside a @defer: not reported', () => {
            expect(found(sfc('@defer (idle) {\n  <pdx-dialog :open="editing"></pdx-dialog>\n}'))).toEqual([]);
        });

        it('in a @defer\'s placeholder: reported, a placeholder renders at once', () => {
            expect(found(sfc('@defer (idle) {\n  <p>later</p>\n} @placeholder {\n  <pdx-dialog :open="editing"></pdx-dialog>\n}'))).toHaveLength(1);
        });

        it('a component that is not a @page: not reported', () => {
            expect(found(sfc(LIST, "let editing = $signal(false);\nlet filters = $signal(false);\nlet name = $signal('');"))).toEqual([]);
        });

        it(':open="true", open from the start: not reported', () => {
            expect(found(sfc('<pdx-dialog :open="true"></pdx-dialog>'))).toEqual([]);
        });

        it('a tag with no open model: not reported', () => {
            expect(found(sfc('<pdx-input :open="editing"></pdx-input>'))).toEqual([]);
        });

        it('an overlay that opens itself from a trigger of the page (it declares `trigger`): not reported', () => {
            // Deferred, its trigger's click would do nothing until the page is idle.
            expect(found(sfc('<button>More</button>\n<pdx-popover ::open="filters"><p>x</p></pdx-popover>'))).toEqual([]);
        });

        it('an overlay whose open is not bound: not reported', () => {
            expect(found(sfc('<pdx-dialog title="x"></pdx-dialog>'))).toEqual([]);
        });

        it('inside an @if, still outside a @defer: reported', () => {
            expect(found(sfc('@if (name) {\n  <pdx-dialog :open="editing"></pdx-dialog>\n}'))).toHaveLength(1);
        });

        it('an overlay inside another is the outer one\'s run: one warning', () => {
            expect(found(sfc('<pdx-drawer :open="filters">\n  <pdx-dialog :open="editing"></pdx-dialog>\n</pdx-drawer>'))).toHaveLength(1);
        });
    });
});
