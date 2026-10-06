// A text interpolation renders the same text in dev and in a production build.
//
// Dev renders `{{ v }}` through the template path, whose rule is documented in core: `null`,
// `undefined` and `false` are empty text (`toNodes`, `core/src/renderer/template.ts`), everything else
// is `String(v)`. The production build takes the inline path, and a bare `t.data = String(v)` there
// would show nothing in dev and the word `null` or `false` to the users of the built app.
//
// The inline nodes are generated here and RUN, with a minimal document, so what is asserted is the
// text the build puts on the page — not the shape of the code that puts it there. The markup reads
// `ctx.v`, and the component hands `v` as a signal: with no compile context the generator does not
// prefix a bare name, and it calls what it reads off `ctx`.

import { describe, it, expect } from 'vitest';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { parseTemplate } from '../src/parser/template';
import * as template from '../../core/src/renderer/template';

/** The rule as the template path applies it, written out: the expectation, not an implementation. */
const documented = (v: unknown): string => (v == null || v === false ? '' : String(v));

const VALUES: unknown[] = [false, null, undefined, 0, '', 'x', true, 42];

interface FakeNode { tag?: string; data?: string; children: FakeNode[]; appendChild(c: FakeNode): FakeNode }
const node = (extra: Partial<FakeNode> = {}): FakeNode => {
    const n: FakeNode = { children: [], appendChild(c) { n.children.push(c); return c; }, ...extra };
    return n;
};
const document = {
    createDocumentFragment: () => node(),
    createElement: (tag: string) => node({ tag }),
    createTextNode: (data: string) => node({ data }),
};
const textOf = (n: FakeNode): string => (n.data ?? '') + n.children.map(textOf).join('');

/** Render a template on the INLINE path, with `ctx` as the component, and read its text. */
function renderInline(markup: string, ctx: Record<string, unknown>): string {
    const imports = new Set<string>();
    const iife = generateInlineNodes(parseTemplate(markup), imports);
    const runtime: Record<string, unknown> = {
        effect: (fn: () => void) => fn(),
        pipe: (v: unknown, ...fns: ((x: unknown) => unknown)[]) => fns.reduce((acc, f) => f(acc), v),
    };
    const names = [...imports].filter((n) => n !== 'effect' && n !== 'pipe');
    for (const name of names) {
        const fn = (template as Record<string, unknown>)[name];
        expect(fn, `the inline module imports ${name}, which core's renderer does not export`).toBeTypeOf('function');
        runtime[name] = fn;
    }
    const keys = Object.keys(runtime);
    const frag = new Function('document', 'ctx', ...keys, `return ${iife};`)(document, ctx, ...keys.map((k) => runtime[k])) as FakeNode;
    return textOf(frag);
}

describe('a text interpolation reads the same in dev and in a build', () => {
    for (const v of VALUES) {
        it(`{{ v }} with v = ${JSON.stringify(v) ?? 'undefined'}`, () => {
            expect(renderInline('<p>{{ ctx.v }}</p>', { v: () => v })).toBe(documented(v));
        });
        it(`{{ v | same }} with v = ${JSON.stringify(v) ?? 'undefined'} — the piped branch too`, () => {
            expect(renderInline('<p>{{ ctx.v | same }}</p>', { v: () => v, same: (x: unknown) => x })).toBe(documented(v));
        });
    }
});
