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
