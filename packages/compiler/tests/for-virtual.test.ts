// `@for … @virtual` (#283): a keyed list that renders only the rows in view. It compiles to core's
// `eachVirtual`, on the render path every .pdx takes and on the template path a scoped slot's body
// still takes (#364). The scroll container is the element written around the `@for`, so the shape
// is checked: `PDX_VIRTUAL_SHAPE`. And a row leaving the window is not leaving the list, so the
// transition modifiers are refused: `PDX_VIRTUAL_TRANSITION`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate, type TemplateNode } from '../src/parser/template';
import type { ValidationWarning } from '../src/compiler/validate';
import { checkVirtualFor } from '../src/compiler/validate-virtual';

const sfc = (template: string, script = 'let posts = $signal([]);') =>
    `<template>${template}</template>\n<script>\n${script}\n</script>\n`;

const codes = (warnings: ValidationWarning[], code: string) => warnings.filter((w) => w.code === code);

describe('the grammar', () => {
    it('reads @virtual and @virtual(n) after the header', () => {
        const [plain] = parseTemplate('@for (xs as x; track x) @virtual { <li>{{ x }}</li> }');
        const [sized] = parseTemplate('@for (xs as x; track x) @virtual(48) { <li>{{ x }}</li> }');
        expect((plain as { virtual?: unknown }).virtual).toEqual({});
        expect((sized as { virtual?: unknown }).virtual).toEqual({ estimate: 48 });
    });

    it('a @for without it is not virtual', () => {
        const [node] = parseTemplate('@for (xs as x; track x) { <li>{{ x }}</li> }');
        expect((node as { virtual?: unknown }).virtual).toBeUndefined();
    });

    it('@virtual(0) or @virtual(x) is a parse error that says what the number is', () => {
        expect(() => parseTemplate('@for (xs as x; track x) @virtual(0) { <li></li> }')).toThrow(/estimated row size in px/);
        expect(() => parseTemplate('@for (xs as x; track x) @virtual(big) { <li></li> }')).toThrow(/estimated row size in px/);
    });
});

describe('it compiles to eachVirtual', () => {
    const feed = '<ul class="feed">@for (posts as p; track p.id) @virtual(64) { <li>{{ p.title }}</li> }</ul>';

    it('on the render path, with the estimate and the rows\' tag', () => {
        const { code, warnings } = compile(sfc(feed), 'feed.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')).toEqual([]);
        expect(code).toMatch(/eachVirtual\(/);
        expect(code).toMatch(/estimate:\s*64/);
        expect(code).toMatch(/tag:\s*"li"/);
        expect(code, 'a virtual @for still renders every row through eachRow').not.toMatch(/eachRow\(/);
    });

    it('@empty is the list\'s, through eachVirtual — not a when() around it', () => {
        const { code } = compile(sfc('<ul>@for (posts as p; track p.id) @virtual { <li>{{ p.title }}</li> } @empty { <li>None</li> }</ul>'), 'feed.pdx');
        expect(code).toMatch(/eachVirtual\([\s\S]*empty:/);
    });

    it('in a <tbody>, the rows are <tr>', () => {
        const { code } = compile(sfc('<table><tbody>@for (posts as p; track p.id) @virtual { <tr><td>{{ p.title }}</td></tr> }</tbody></table>'), 'rows.pdx');
        expect(code).toMatch(/tag:\s*"tr"/);
    });

    it('on the template path too — a scoped slot\'s body', () => {
        const { code } = compile(sfc('<pdx-list><slot name="row" let:r><ul>@for (r.posts as p; track p.id) @virtual { <li>{{ p.title }}</li> }</ul></slot></pdx-list>'), 'slot.pdx');
        expect(code).toMatch(/eachVirtual\(/);
    });
});

describe('PDX_VIRTUAL_SHAPE: the container is the element around the @for', () => {
    it('a sibling beside the @for', () => {
        const { warnings } = compile(sfc('<ul><li>Header</li>@for (posts as p; track p.id) @virtual { <li>{{ p.title }}</li> }</ul>'), 'x.pdx');
        const [w] = codes(warnings, 'PDX_VIRTUAL_SHAPE');
        expect(w?.severity).toBe('error');
        expect(w?.message).toMatch(/only content/);
    });

    it('a body with two roots', () => {
        const { warnings } = compile(sfc('<ul>@for (posts as p; track p.id) @virtual { <li>{{ p.title }}</li><li>more</li> }</ul>'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')[0]?.message).toMatch(/one root element/);
    });

    it('a component tag as the parent', () => {
        const { warnings } = compile(sfc('<pdx-card>@for (posts as p; track p.id) @virtual { <div>{{ p.title }}</div> }</pdx-card>'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')[0]?.message).toMatch(/native element/);
    });

    it('no parent at all', () => {
        const { warnings } = compile(sfc('@for (posts as p; track p.id) @virtual { <div>{{ p.title }}</div> }'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')[0]?.message).toMatch(/inside an element/);
    });

    it('control — whitespace and comments beside the @for are not content', () => {
        const { warnings } = compile(sfc('<ul>\n  <!-- the feed -->\n  @for (posts as p; track p.id) @virtual { <li>{{ p.title }}</li> }\n</ul>'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')).toEqual([]);
    });

    it('a comment between the container and the @for is not content, read on the markup itself', () => {
        const [node] = parseTemplate('@for (posts as p; track p.id) @virtual { <li>{{ p.title }}</li> }');
        const warnings = checkVirtualFor([{ type: 'html', content: '<ul><!-- a <li> -->' }, node, { type: 'html', content: '<!-- end --></ul>' }] as TemplateNode[]);
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')).toEqual([]);
    });

    it('control — a plain @for is not checked', () => {
        const { warnings } = compile(sfc('<ul><li>Header</li>@for (posts as p; track p.id) { <li>{{ p.title }}</li><li>x</li> }</ul>'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_SHAPE')).toEqual([]);
    });
});

describe('PDX_VIRTUAL_TRANSITION: a row leaving the window is not leaving the list', () => {
    it('@stagger', () => {
        const { warnings } = compile(sfc("<ul>@for (posts as p; track p.id) @transition('fade') @stagger(50) @virtual { <li>{{ p.title }}</li> }</ul>"), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_TRANSITION')[0]?.severity).toBe('error');
    });

    it('@move', () => {
        const { warnings } = compile(sfc('<ul>@for (posts as p; track p.id) @move(200) @virtual { <li>{{ p.title }}</li> }</ul>'), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_TRANSITION')).toHaveLength(1);
    });

    it('@transition alone: a row scrolling in would animate as if it arrived', () => {
        const { warnings } = compile(sfc("<ul>@for (posts as p; track p.id) @transition('fade') @virtual { <li>{{ p.title }}</li> }</ul>"), 'x.pdx');
        expect(codes(warnings, 'PDX_VIRTUAL_TRANSITION')).toHaveLength(1);
    });
});
