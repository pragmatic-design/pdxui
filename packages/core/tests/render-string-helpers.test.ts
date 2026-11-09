// The helpers rendered to a string are what the client builds with them (#160, part 2c).
//
// `when`, `match`, `show` and the lists are what a hand-written html`` component — the library's or a
// developer's — renders conditions and rows with. On the server each renders what its client side
// renders on its first run, between the same comment markers, so hydration finds the block where the
// client puts it. Each case renders once into the DOM and once to a string, compared canonically.

import { describe, it, expect } from 'vitest';
import { html } from '../src/renderer/template';
import { when, match, show, each, eachRow, eachDestructured } from '../src/renderer/helpers';
import { repeat } from '../src/renderer/list';
import { eachVirtual } from '../src/renderer/virtual-list';
import { DEFAULT_SERVER_ROWS } from '../src/server/virtual';
import { renderToString } from '../src/server/render-string';
import { signal, effect } from '../src/reactivity/signal';
import { parity } from './string-parity';

describe('when() to a string', () => {
    it('renders the branch the condition picks, between the when markers', () => {
        const open = signal(true);
        const m = parity(() => html`<div>${when(() => open(), () => html`<b>yes ${'a'}</b>`, () => html`<i>no</i>`)}</div>`);
        expect(m).toContain('<!--when--><b>yes');
        expect(m).toContain('<!--/when-->');
        open.set(false);
        expect(parity(() => html`<div>${when(() => open(), () => html`<b>yes</b>`, () => html`<i>no</i>`)}</div>`)).toContain('<i>no</i>');
    });

    it('with no else and a false condition, the markers alone; a falsy non-boolean is false', () => {
        const m = parity(() => html`<p>${when(() => undefined as unknown as boolean, () => html`<b>x</b>`)}</p>`);
        expect(m).not.toContain('<b>');
        expect(m).toContain('<!--when--><!--/when-->');
    });

    it('nested in another when', () => {
        const m = parity(() => html`<p>${when(() => true, () => html`<span>${when(() => true, () => html`<em>in</em>`)}</span>`)}</p>`);
        expect(m).toContain('<em>in</em>');
    });
});

describe('match() to a string', () => {
    it('renders the matching case, or the default, between the match markers', () => {
        const status = signal<'on' | 'off' | 'other'>('on');
        const cases = { on: () => html`<b>On</b>`, off: () => html`<b>Off</b>`, _: () => html`<b>?</b>` };
        expect(parity(() => html`<p>${match(() => status(), cases)}</p>`)).toContain('<!--match--><b>On</b><!--/match-->');
        status.set('other');
        expect(parity(() => html`<p>${match(() => status(), cases)}</p>`)).toContain('<b>?</b>');
    });

    it('with no matching case and no default, the markers alone', () => {
        expect(parity(() => html`<p>${match(() => 'x', { y: () => html`<b>y</b>` })}</p>`)).toContain('<!--match--><!--/match-->');
    });
});

describe('show() to a string', () => {
    it('visible: the content as it is', () => {
        const m = parity(() => html`<div>${show(() => true, html`<section class="panel">${'body'}</section>`)}</div>`);
        expect(m).not.toContain('display');
    });

    it('hidden: elements take display:none, text becomes the show comment, an svg stays', () => {
        const m = parity(() => html`<div>${show(() => false, html`<section style="color: red">a</section>${'text'}<svg></svg>`)}</div>`);
        expect(m).toContain('display: none');
        expect(m).toContain('<!--show-->');
        expect(m).not.toContain('text');
    });
});

describe('lists to a string', () => {
    const rows = [{ id: 1, name: 'one' }, { id: 2, name: 'two' }];

    it('each(): every row between the repeat markers, its elements marked as items', () => {
        const m = parity(() => html`<ul>${each(() => rows, 'id', (r) => html`<li>${r.name}</li>`)}</ul>`);
        expect(m).toContain('<!--repeat-start--><li data-pdx-item="">');
        expect(m).toContain('two<!--/pdx--></li><!--repeat-end-->');
    });

    it('eachRow(): the rows see their item and index through getters', () => {
        const m = parity(() => html`<ol>${eachRow(() => rows, 'id', (r, i) => html`<li>${() => `${i()}:${r().name}`}</li>`)}</ol>`);
        expect(m).toContain('0:one');
        expect(m).toContain('1:two');
    });

    it('eachDestructured() and repeat(), and an empty list', () => {
        parity(() => html`<ul>${eachDestructured(() => rows, (r) => r.id, (r) => html`<li>${r.name}</li>`)}</ul>`);
        parity(() => html`<ul>${repeat(() => rows, (r) => r.id, (r) => html`<li>${r.name}</li>`)}</ul>`);
        expect(parity(() => html`<ul>${each(() => [] as typeof rows, 'id', (r) => html`<li>${r.name}</li>`)}</ul>`))
            .toContain('<!--repeat-start--><!--repeat-end-->');
    });

    it('a list inside a hidden show: rows both items and hidden', () => {
        const m = parity(() => html`<div>${show(() => false, html`${each(() => rows, 'id', (r) => html`<p>${r.name}</p>`)}`)}</div>`);
        expect(m).toContain('data-pdx-item');
        expect(m).toContain('display: none');
    });
});

// #930: a virtual list writes its first window of rows, and spacers for the rest. The server has no layout,
// so the window is a count (`serverRows`); the spacer after it stands for the rows it did not write, sized
// by the estimate, so the page has the list's height before the client measures it.
describe('eachVirtual() to a string', () => {
    const letters = Array.from({ length: 50 }, (_, i) => `r${i}`);
    const row = (r: string) => html`<li>${r}</li>`;
    const rowsOf = (m: string) => m.match(/data-virtual-index="\d+"/g) ?? [];

    it('a short list: every row, with its place in the set, between the virtual markers', () => {
        // A string, not `parity`: the client's list knows its container, and so its role, a microtask
        // after it is built. The render-parity table compares the two after the mount settles.
        const m = renderToString(() => html`<ul>${eachVirtual(() => letters.slice(0, 3), (r) => r, row, { estimate: 20, tag: 'li' })}</ul>`);
        expect(m).toContain('<!--virtual-->');
        expect(m).toContain('<!--/virtual-->');
        expect(rowsOf(m)).toHaveLength(3);
        expect(m).toContain('aria-posinset="3"');
        expect(m).toContain('aria-setsize="3"');
    });

    it('a long list: the first serverRows rows, and a spacer after them for the rest by the estimate', () => {
        const m = renderToString(() => html`<ul>${eachVirtual(() => letters, (r) => r, row, { estimate: 20, tag: 'li', serverRows: 10 })}</ul>`);
        expect(rowsOf(m)).toHaveLength(10);
        expect(m).toContain('data-virtual-index="9"');
        expect(m).not.toContain('data-virtual-index="10"');
        expect(m).toContain('aria-setsize="50"');
        // 40 rows not written, at 20 px each.
        expect(m).toContain('height: 800px;');
    });

    it('with no serverRows, the default count', () => {
        const m = renderToString(() => html`<ul>${eachVirtual(() => letters, (r) => r, row, { estimate: 20, tag: 'li' })}</ul>`);
        expect(rowsOf(m)).toHaveLength(DEFAULT_SERVER_ROWS);
    });

    it('empty: the spacers and @empty after them; with rows, no @empty', () => {
        const empty = () => html`<li>none</li>`;
        const none = renderToString(() => html`<ul>${eachVirtual(() => [] as string[], (r) => r, row, { tag: 'li', empty })}</ul>`);
        expect(none).toContain('<li>none</li>');
        expect(rowsOf(none)).toHaveLength(0);
        const some = renderToString(() => html`<ul>${eachVirtual(() => ['a'], (r) => r, row, { tag: 'li', empty })}</ul>`);
        expect(some).not.toContain('none');
    });

    it('under a composite role, the first row is the tab stop', () => {
        const m = renderToString(() => html`<div role="listbox">${eachVirtual(() => letters.slice(0, 3), (r) => r, (r: string) => html`<div role="option">${r}</div>`, { estimate: 20 })}</div>`);
        const tabOf = (i: number) => new RegExp(`<div [^>]*data-virtual-index="${i}"[^>]*>`).exec(m)?.[0].match(/tabindex="(-?\d)"/)?.[1];
        expect([tabOf(0), tabOf(1), tabOf(2)]).toEqual(['0', '-1', '-1']);
    });

    it('in a table, no aria-rowindex: the header rows around the list are not known while it is written', () => {
        const m = renderToString(() => html`<table><tbody>${eachVirtual(() => letters.slice(0, 2), (r) => r, (r: string) => html`<tr><td>${r}</td></tr>`, { estimate: 20, tag: 'tr' })}</tbody></table>`);
        expect(rowsOf(m)).toHaveLength(2);
        expect(m).not.toContain('aria-rowindex');
    });

    it('a paged source: its data, and its total as the size of the set', () => {
        const source = { data: () => letters.slice(0, 5), hasMore: () => true, loadMore: () => Promise.resolve(), total: () => 500 };
        const m = renderToString(() => html`<ul>${eachVirtual(() => source, (r) => r, row, { estimate: 20, tag: 'li' })}</ul>`);
        expect(rowsOf(m)).toHaveLength(5);
        expect(m).toContain('aria-setsize="500"');
    });
});

describe('what a block creates while it renders', () => {
    it('is disposed with the render: an effect in a branch does not run again', () => {
        const source = signal(0);
        let runs = 0;
        renderToString(() => html`<p>${when(() => true, () => { effect(() => { source(); runs++; }); return html`<b>x</b>`; })}</p>`);
        const after = runs;
        source.set(1);
        expect(after).toBe(1);
        expect(runs).toBe(1);
    });
});
