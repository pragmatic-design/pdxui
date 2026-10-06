import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when, each, match, pipe } from '../src/renderer/helpers';
import { waitUntil } from './wait-until';

describe('when', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders then branch when condition is true', () => {
        const show = signal(true);
        const frag = when(
            () => show(),
            () => html`<span>visible</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('span')?.textContent).toBe('visible');
    });

    it('renders nothing when condition is false and no else', () => {
        const show = signal(false);
        const frag = when(
            () => show(),
            () => html`<span>visible</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('span')).toBeNull();
    });

    it('renders else branch when condition is false', () => {
        const show = signal(false);
        const frag = when(
            () => show(),
            () => html`<span class="yes">yes</span>`,
            () => html`<span class="no">no</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('.no')?.textContent).toBe('no');
        expect(document.body.querySelector('.yes')).toBeNull();
    });

    it('reactively switches between branches', () => {
        const show = signal(true);
        const frag = when(
            () => show(),
            () => html`<span class="yes">yes</span>`,
            () => html`<span class="no">no</span>`
        );
        document.body.appendChild(frag);

        expect(document.body.querySelector('.yes')).not.toBeNull();
        expect(document.body.querySelector('.no')).toBeNull();

        show.set(false);
        expect(document.body.querySelector('.yes')).toBeNull();
        expect(document.body.querySelector('.no')).not.toBeNull();

        show.set(true);
        expect(document.body.querySelector('.yes')).not.toBeNull();
        expect(document.body.querySelector('.no')).toBeNull();
    });

    it('works inside html template', () => {
        const show = signal(true);
        const frag = html`<div>${when(() => show(), () => html`<span>inner</span>`)}</div>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('span')?.textContent).toBe('inner');

        show.set(false);
        expect(document.body.querySelector('span')).toBeNull();
    });

    it('cleans up previous content completely', () => {
        const show = signal(true);
        const frag = when(
            () => show(),
            () => html`<div><span>A</span><span>B</span></div>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('span').length).toBe(2);

        show.set(false);
        expect(document.body.querySelectorAll('span').length).toBe(0);
    });
});

describe('each', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders items with string key', () => {
        const items = signal([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]);
        const frag = each(
            () => items(),
            'id',
            (item) => html`<span>${item.name}</span>`
        );
        document.body.appendChild(frag);
        const spans = document.body.querySelectorAll('span');
        expect(spans.length).toBe(2);
        expect(spans[0].textContent).toBe('Alice');
        expect(spans[1].textContent).toBe('Bob');
    });

    it('renders items with function key', () => {
        const items = signal([
            { id: 'a', name: 'X' },
            { id: 'b', name: 'Y' },
        ]);
        const frag = each(
            () => items(),
            (item) => item.id,
            (item) => html`<span>${item.name}</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('span').length).toBe(2);
    });

    it('reactively adds items', () => {
        const items = signal([{ id: 1, name: 'A' }]);
        const frag = each(
            () => items(),
            'id',
            (item) => html`<span>${item.name}</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('span').length).toBe(1);

        items.set([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
        expect(document.body.querySelectorAll('span').length).toBe(2);
    });

    it('reactively removes items', () => {
        const items = signal([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
        const frag = each(
            () => items(),
            'id',
            (item) => html`<span>${item.name}</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('span').length).toBe(2);

        items.set([{ id: 2, name: 'B' }]);
        expect(document.body.querySelectorAll('span').length).toBe(1);
        expect(document.body.querySelector('span')?.textContent).toBe('B');
    });

    it('renders empty list', () => {
        const items = signal<{ id: number; name: string }[]>([]);
        const frag = each(
            () => items(),
            'id',
            (item) => html`<span>${item.name}</span>`
        );
        document.body.appendChild(frag);
        expect(document.body.querySelectorAll('span').length).toBe(0);
    });
});

describe('match', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders the matching case', () => {
        const status = signal<string>('active');
        const frag = match(
            () => status(),
            {
                active: () => html`<span class="green">Active</span>`,
                inactive: () => html`<span class="red">Inactive</span>`,
            }
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('.green')).not.toBeNull();
        expect(document.body.querySelector('.red')).toBeNull();
    });

    it('renders default case when no match', () => {
        const status = signal<string>('unknown');
        const frag = match(
            () => status(),
            {
                active: () => html`<span>Active</span>`,
                _: () => html`<span class="default">Default</span>`,
            }
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('.default')).not.toBeNull();
    });

    it('reactively switches cases', () => {
        const mode = signal<string>('light');
        const frag = match(
            () => mode(),
            {
                light: () => html`<span class="light">Light</span>`,
                dark: () => html`<span class="dark">Dark</span>`,
            }
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('.light')).not.toBeNull();

        mode.set('dark');
        expect(document.body.querySelector('.light')).toBeNull();
        expect(document.body.querySelector('.dark')).not.toBeNull();
    });

    it('renders nothing when no match and no default', () => {
        const status = signal<string>('unknown');
        const frag = match(
            () => status(),
            {
                active: () => html`<span>Active</span>`,
            }
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('span')).toBeNull();
    });

    it('works with numeric values', () => {
        const step = signal(1);
        const frag = match(
            () => step(),
            {
                '1': () => html`<span>Step 1</span>`,
                '2': () => html`<span>Step 2</span>`,
            }
        );
        document.body.appendChild(frag);
        expect(document.body.querySelector('span')?.textContent).toBe('Step 1');

        step.set(2);
        expect(document.body.querySelector('span')?.textContent).toBe('Step 2');
    });
});

describe('pipe', () => {
    it('applies single transform', () => {
        expect(pipe(5, (n: number) => n * 2)).toBe(10);
    });

    it('chains multiple transforms', () => {
        const result = pipe(
            '  hello  ',
            (s: string) => s.trim(),
            (s: string) => s.toUpperCase()
        );
        expect(result).toBe('HELLO');
    });

    it('returns original value with no transforms', () => {
        expect(pipe(42)).toBe(42);
    });

    it('works with number formatting', () => {
        const currency = (n: number) => `$${n.toFixed(2)}`;
        const compact = (s: string) => s.replace('.00', '');
        expect(pipe(100, currency, compact)).toBe('$100');
        expect(pipe(99.5, currency)).toBe('$99.50');
    });

    it('works with type transformations', () => {
        const result = pipe(
            42,
            (n: number) => n.toString(),
            (s: string) => s.length
        );
        expect(result).toBe(2);
    });
});

// portal, and when() in out-in mode.

import { vi as viFx } from 'vitest';
import { portal } from '../src/renderer/helpers';
import { effect as effectFx } from '../src/reactivity/signal';

describe('portal', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('F4: the effects of the previous content are disposed on the re-run', () => {
        const target = document.createElement('div');
        target.id = 'portal-target-f4';
        document.body.appendChild(target);

        const which = signal('a');
        const probe = signal(0);
        let oldContentRuns = 0;

        portal(() => {
            const w = which();
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            frag.appendChild(span);
            if (w === 'a') {
                effectFx(() => { probe(); oldContentRuns++; });
            }
            return frag;
        }, '#portal-target-f4');

        const runsAfterMount = oldContentRuns;
        which.set('b');
        probe.set(1);
        expect(oldContentRuns).toBe(runsAfterMount);
    });

    it('F5: a target that appears after the mount is picked up (retry)', async () => {
        portal(() => {
            const s = document.createElement('span');
            s.className = 'late-portal-content';
            return s;
        }, '#late-target');

        expect(document.querySelector('.late-portal-content')).toBeNull();

        const target = document.createElement('div');
        target.id = 'late-target';
        document.body.appendChild(target);

        await waitUntil(() => target.querySelector('.late-portal-content') !== null, 'the portal to place its late content');
        expect(target.querySelector('.late-portal-content')).not.toBeNull();
    });

    it('F6: exiting content with no CSS transition is removed all the same (the fallback)', async () => {
        viFx.useFakeTimers();
        const target = document.createElement('div');
        target.id = 'portal-target-f6';
        document.body.appendChild(target);

        const which = signal('a');
        portal(() => {
            const s = document.createElement('div');
            s.className = 'content-' + which();
            return s;
        }, '#portal-target-f6', { exit: 'fade-out' });

        expect(target.querySelector('.content-a')).not.toBeNull();
        which.set('b');
        await viFx.advanceTimersByTimeAsync(1500);
        viFx.useRealTimers();
        expect(target.querySelector('.content-a')).toBeNull();
        expect(target.querySelector('.content-b')).not.toBeNull();
    });
});

describe('when out-in — a race on a rapid toggle', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('a superseded run does not render stale content', async () => {
        viFx.useFakeTimers();
        const cond = signal(true);
        const frag = when(
            () => cond(),
            () => { const d = document.createElement('div'); d.className = 'yes'; return d; },
            () => { const d = document.createElement('div'); d.className = 'no'; return d; },
            { exit: 'fade-out', mode: 'out-in' },
        );
        document.body.appendChild(frag);
        expect(document.querySelector('.yes')).not.toBeNull();

        cond.set(false);
        cond.set(true);

        await viFx.advanceTimersByTimeAsync(2500);
        viFx.useRealTimers();

        expect(document.querySelectorAll('.no').length).toBe(0);
        expect(document.querySelectorAll('.yes').length).toBe(1);
    });
});

// each() over a store array mutated in place.

import { store as storeFx } from '../src/reactivity/store';

describe('each over a store array', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('push in place aggiorna la lista renderizzata', () => {
        const state = storeFx({ items: [{ id: 1, name: 'a' }] });
        const frag = each(
            () => state.items,
            'id',
            (item) => { const d = document.createElement('div'); d.className = 'row'; d.textContent = String((item as { name: string }).name); return d; },
        );
        document.body.appendChild(frag);
        expect(document.querySelectorAll('.row').length).toBe(1);

        state.items.push({ id: 2, name: 'b' });
        expect(document.querySelectorAll('.row').length).toBe(2);

        state.items.length = 1; // truncation (F12 lato renderer)
        expect(document.querySelectorAll('.row').length).toBe(1);
    });
});
