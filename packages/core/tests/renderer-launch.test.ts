// Renderer guarantees of when() and match() around nested lists.
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when, each, match } from '../src/renderer/helpers';

describe('when() memoizes on the condition', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('does not rebuild the branch when the boolean is unchanged', () => {
        const show = signal(true);
        const other = signal(0);
        let builds = 0;
        const frag = when(
            () => { other(); return show(); },   // depends on both signals
            () => { builds++; return html`<span class="b">hi</span>`; },
        );
        document.body.appendChild(frag);
        expect(builds).toBe(1);
        const el = document.body.querySelector('.b');

        other.set(1); // condition still true → must NOT rebuild
        other.set(2);
        expect(builds).toBe(1);
        expect(document.body.querySelector('.b')).toBe(el); // same node, not replaced
    });

    it('rebuilds when the boolean actually flips', () => {
        const show = signal(true);
        let builds = 0;
        const frag = when(
            () => show(),
            () => { builds++; return html`<span class="on">on</span>`; },
            () => html`<span class="off">off</span>`,
        );
        document.body.appendChild(frag);
        expect(builds).toBe(1);
        show.set(false);
        expect(document.body.querySelector('.off')).not.toBeNull();
        expect(document.body.querySelector('.on')).toBeNull();
        show.set(true);
        expect(builds).toBe(2);
    });
});

describe('when() removes nodes appended by a nested each()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('clears grown list rows when the branch swaps', () => {
        const tab = signal('list');
        const rows = signal<{ id: number }[]>([{ id: 1 }]);
        const frag = when(
            () => tab() === 'list',
            () => html`<div class="wrap">${each(() => rows(), 'id', (r) => html`<p class="row">${String(r.id)}</p>`)}</div>`,
            () => html`<span class="empty">none</span>`,
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('.row').length).toBe(1);

        // Grow the list AFTER the initial render
        rows.set([{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(document.body.querySelectorAll('.row').length).toBe(3);

        // Swap the branch: every row (including the ones added later) must be gone
        tab.set('other');
        expect(document.body.querySelectorAll('.row').length).toBe(0);
        expect(document.body.querySelector('.wrap')).toBeNull();
        expect(document.body.querySelector('.empty')).not.toBeNull();
    });
});

describe('match() switches cases without NotFoundError when a nested list shrank', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('handles a shrinking nested list then a case switch', () => {
        const status = signal('list');
        const rows = signal<{ id: number }[]>([{ id: 1 }, { id: 2 }, { id: 3 }]);
        const frag = match(() => status(), {
            list: () => html`<div>${each(() => rows(), 'id', (r) => html`<p class="row">${String(r.id)}</p>`)}</div>`,
            empty: () => html`<span class="e">empty</span>`,
        });
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('.row').length).toBe(3);

        rows.set([{ id: 1 }]); // shrink — some nodes removed by reconcile
        expect(document.body.querySelectorAll('.row').length).toBe(1);

        // Switching case must not throw and must clear the list
        expect(() => status.set('empty')).not.toThrow();
        expect(document.body.querySelector('.e')).not.toBeNull();
        expect(document.body.querySelectorAll('.row').length).toBe(0);
    });

    it('memoizes: same key keeps the branch', () => {
        const status = signal('a');
        const noise = signal(0);
        let builds = 0;
        const frag = match(() => { noise(); return status(); }, {
            a: () => { builds++; return html`<span>A</span>`; },
            b: () => html`<span>B</span>`,
        });
        document.body.appendChild(frag);
        expect(builds).toBe(1);
        noise.set(1);
        expect(builds).toBe(1);
    });
});
