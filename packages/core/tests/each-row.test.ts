// A keyed row that is reused sees its current item.
//
// `each()` hands a row its item as a plain value, and the row's bindings close over it. When the
// list is replaced immutably — same id, new object, the way every store update is written — the key
// matches, the row's DOM is reused (that is what keying is for), and its bindings keep showing the
// object it was created with: a progress bar stays at its first value while the data says 100.
//
// `eachRow()` hands the row GETTERS — `item()` and `index()` — backed by per-row signals that the
// reconciler updates when it reuses the row. It is what `@for` compiles to. `each()` keeps its
// contract for hand-written code: a value, and the one-time warning when a reused row's object changed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { each, eachRow } from '../src/renderer/helpers';

type Row = { id: number; v: string };

afterEach(() => { document.body.innerHTML = ''; });

function mount(frag: DocumentFragment): HTMLElement {
    const host = document.createElement('ul');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
}

describe('eachRow — a reused row sees its current item', () => {
    it('same key, new object → the text follows and the node is the same', () => {
        const rows = signal<Row[]>([{ id: 1, v: 'a' }]);
        const host = mount(eachRow(() => rows(), 'id', (item: () => Row) =>
            html`<li>${() => item().v}</li>`));
        const li = host.querySelector('li')!;
        expect(li.textContent).toBe('a');

        rows.set([{ id: 1, v: 'b' }]);

        expect(host.querySelector('li')!.textContent, 'the row kept the item it was created for').toBe('b');
        expect(host.querySelector('li'), 'keying lost: the row was recreated').toBe(li);
    });

    it('a row moved to another position sees its new index', () => {
        const rows = signal<Row[]>([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
        const host = mount(eachRow(() => rows(), 'id', (item: () => Row, index: () => number) =>
            html`<li>${() => `${index()}:${item().v}`}</li>`));
        const [first, second] = Array.from(host.querySelectorAll('li'));

        rows.set([{ id: 2, v: 'b' }, { id: 1, v: 'a' }]);

        const now = Array.from(host.querySelectorAll('li'));
        expect(now.map(li => li.textContent)).toEqual(['0:b', '1:a']);
        expect(now, 'the rows were recreated instead of moved').toEqual([second, first]);
    });

    it('the row reads the same object the list holds — identity survives', () => {
        const a = { id: 1, v: 'a' };
        const rows = signal<Row[]>([a]);
        let seen: Row | null = null;
        mount(eachRow(() => rows(), 'id', (item: () => Row) => {
            seen = item();
            return html`<li></li>`;
        }));
        expect(seen).toBe(a);
    });

    it('control — added and removed rows still work', () => {
        const rows = signal<Row[]>([{ id: 1, v: 'a' }]);
        const host = mount(eachRow(() => rows(), 'id', (item: () => Row) => html`<li>${() => item().v}</li>`));
        rows.set([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
        expect(Array.from(host.querySelectorAll('li')).map(l => l.textContent)).toEqual(['a', 'b']);
        rows.set([{ id: 2, v: 'c' }]);
        expect(Array.from(host.querySelectorAll('li')).map(l => l.textContent)).toEqual(['c']);
    });
});

describe('each — unchanged for hand-written code (the control)', () => {
    it('still hands a value, and still warns when a reused row object changed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rows = signal<Row[]>([{ id: 1, v: 'a' }]);
        let received: unknown = null;
        const host = mount(each(() => rows(), 'id', (item: Row) => { received = item; return html`<li>${item.v}</li>`; }));
        expect(received).toEqual({ id: 1, v: 'a' });
        rows.set([{ id: 1, v: 'b' }]);
        expect(host.querySelector('li')!.textContent).toBe('a');
        warn.mockRestore();
    });
});
