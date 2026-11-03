// An alpha scoped slot is read whole and rendered as nothing (#492).
//
// The parent's `@slot(row, { item }) { … }` and `<slot name="row" let:item>…</slot>`, the child's
// `<slot name="row" :item="it">…</slot>`: forms the beta removed, each PDX_REMOVED_FORM
// (`language/scoped-slots.ts`). The parser still reads each one whole — its body with it, a nested
// slot's `</slot>` included — so the file parses and what follows it is read as written; the node it
// gives is inert, and no render path emits anything for it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';

const types = (template: string) => parseTemplate(template).map((n) => n.type);

describe('the removed-slot node', () => {
    it('is what each alpha form parses to: one node, the body read with it', () => {
        expect(types('<slot name="row" :item="first">none {{ first }} @if (first) { <b>x</b> }</slot>')).toEqual(['removed-slot']);
        expect(types('<slot name="row" let:item>{{ item }} <slot name="x" :a="b">-</slot> </slot>')).toEqual(['removed-slot']);
        expect(types('@slot(row, { item }) { @if (item) { <b>{{ item }}</b> } }')).toEqual(['removed-slot']);
        expect(types('<slot name="row" :item="first" />')).toEqual(['removed-slot']);
    });

    it('what follows the form is parsed as written', () => {
        expect(types('<slot name="row" let:item>{{ item }}</slot><p>{{ after }}</p>')).toEqual(['removed-slot', 'html', 'interpolation', 'html']);
        expect(types('@slot(row) { <i>x</i> } @if (on) { <b>y</b> }').filter((t) => t !== 'html')).toEqual(['removed-slot', 'if']);
    });

    it('control — a <slot> with neither a let: nor a bound attribute is markup', () => {
        expect(types('<slot name="row">none</slot>')).toEqual(['html']);
        expect(types('<slot></slot>')).toEqual(['html']);
    });

    it('renders nothing, and the module calls none of the removed runtime', () => {
        const src = '<template><div class="box"><slot name="row" :item="first">none</slot></div>'
            + '<pdx-list><slot name="item" let:row>{{ row }}</slot>@slot(empty) { <p>-</p> }</pdx-list></template>\n'
            + "<script>\nlet first = $signal('Ada');\n</script>\n";
        const { code, warnings } = compile(src, 'removed.pdx', [], undefined, { production: true });
        expect(warnings.filter((w) => w.code === 'PDX_REMOVED_FORM').length).toBe(3);
        expect(code).not.toMatch(/renderSlot|slotCarrier|__slots|__pdxSlot/);
        expect(code, 'a fallback of a removed outlet was emitted').not.toContain('none');
        expect(() => new Function(code.replace(/^\s*import\b.*$/gm, '')), 'the module does not parse').not.toThrow();
    });
});
