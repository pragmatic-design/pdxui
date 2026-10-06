// Tests for Sprint 2: resource(), portal(), named slots, dynamic()

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { resource, resourceWhen } from '../src/reactivity/resource';
import { html } from '../src/renderer/template';
import { portal, dynamic } from '../src/renderer/helpers';
import { component } from '../src/component/component';
import { waitUntil } from './wait-until';

// ─── resource() ────────────────────────────────────────────────────

describe('resource()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('starts in loading state', () => {
        const res = resource(() => new Promise<string>(() => {})); // never resolves
        expect(res.state()).toBe('loading');
        expect(res.loading()).toBe(true);
        expect(res.data()).toBeUndefined();
    });

    it('transitions to success on resolve', async () => {
        const res = resource(() => Promise.resolve('hello'));
        // Wait for microtask
        await waitUntil(() => res.state() === 'success', 'the query to resolve');
        expect(res.state()).toBe('success');
        expect(res.data()).toBe('hello');
        expect(res.error()).toBeUndefined();
    });

    it('transitions to error on reject', async () => {
        const res = resource(() => Promise.reject(new Error('fail')));
        await waitUntil(() => res.state() === 'error', 'the query to fail');
        expect(res.state()).toBe('error');
        expect((res.error() as Error | undefined)?.message).toBe('fail');
    });

    it('retries on error with retry option', async () => {
        let attempts = 0;
        const res = resource(() => {
            attempts++;
            if (attempts < 3) return Promise.reject(new Error('fail'));
            return Promise.resolve('ok');
        }, { retry: 3 });

        // Wait for retries (200ms + 400ms backoff + margin)
        await waitUntil(() => res.state() === 'success', 'the query to succeed on a later attempt');
        expect(res.state()).toBe('success');
        expect(res.data()).toBe('ok');
        expect(attempts).toBe(3);
    }, 5000);

    it('mutate() sets data optimistically', async () => {
        const res = resource(() => Promise.resolve('server'));
        await new Promise(r => setTimeout(r, 10));

        res.mutate('optimistic');
        expect(res.data()).toBe('optimistic');
        expect(res.state()).toBe('local'); // 'local' = manually set via mutate()
    });

    it('refetch() triggers a new load', async () => {
        let count = 0;
        const res = resource(() => {
            count++;
            return Promise.resolve(`data-${count}`);
        });

        await waitUntil(() => res.data() === 'data-1', 'the first fetch');
        expect(res.data()).toBe('data-1');

        res.refetch();
        await waitUntil(() => res.data() === 'data-2', 'the refetch');
        expect(res.data()).toBe('data-2');
    });
});

describe('resourceWhen()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders loading state', () => {
        const res = resource(() => new Promise<string>(() => {}));
        const frag = resourceWhen(res, {
            loading: () => html`<div class="loading">Loading...</div>`,
            success: (data) => html`<div class="data">${data}</div>`,
        });
        document.body.appendChild(frag);
        expect(document.body.querySelector('.loading')).not.toBeNull();
    });

    it('renders success state after resolve', async () => {
        const res = resource(() => Promise.resolve('hello'));
        const frag = resourceWhen(res, {
            loading: () => html`<div class="loading">Loading...</div>`,
            success: (data) => html`<div class="data">${data}</div>`,
        });
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.data') !== null, 'the resource view to render its data');
        expect(document.body.querySelector('.loading')).toBeNull();
        expect(document.body.querySelector('.data')?.textContent).toBe('hello');
    });

    it('renders error state with retry callback', async () => {
        const res = resource(() => Promise.reject(new Error('oops')));
        const frag = resourceWhen(res, {
            loading: () => html`<span>Wait</span>`,
            error: (err, retry) => html`<div class="err">${(err as Error).message}<button @click=${() => retry()}>Retry</button></div>`,
        });
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.err') !== null, 'the resource view to render its error');
        expect(document.body.querySelector('.err')?.textContent).toContain('oops');
    });
});

// ─── portal() ──────────────────────────────────────────────────────

describe('portal()', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="portal-root"></div><div id="app"></div>';
    });

    it('renders content into target element', () => {
        const app = document.getElementById('app')!;
        const frag = portal(
            () => html`<div class="modal">Modal Content</div>`,
            '#portal-root'
        );
        app.appendChild(frag);

        // Content should be in portal root, NOT in app
        expect(document.getElementById('portal-root')!.querySelector('.modal')).not.toBeNull();
        expect(document.getElementById('app')!.querySelector('.modal')).toBeNull();
    });

    it('accepts Element target directly', () => {
        const root = document.getElementById('portal-root')!;
        const app = document.getElementById('app')!;
        const frag = portal(
            () => html`<span class="tip">Tooltip</span>`,
            root
        );
        app.appendChild(frag);

        expect(root.querySelector('.tip')).not.toBeNull();
    });

    it('leaves a comment marker at original position', () => {
        const app = document.getElementById('app')!;
        const frag = portal(
            () => html`<div>Teleported</div>`,
            '#portal-root'
        );
        app.appendChild(frag);

        // App should have the comment marker
        const comments = Array.from(app.childNodes).filter(n => n.nodeType === Node.COMMENT_NODE);
        expect(comments.some(c => (c as Comment).data === 'portal')).toBe(true);
    });
});

// ─── Named Slots ───────────────────────────────────────────────────

describe('named slots', () => {
    let tagId = 200;
    beforeEach(() => { document.body.innerHTML = ''; });

    it('projects default slot content', () => {
        const tag = `test-slot-${tagId++}`;
        component(tag, {
            render: () => html`<div class="wrapper"><slot></slot></div>`,
        });

        const el = document.createElement(tag);
        el.innerHTML = '<span>Projected</span>';
        document.body.appendChild(el);

        expect(el.querySelector('.wrapper span')?.textContent).toBe('Projected');
    });

    it('projects named slot content', () => {
        const tag = `test-slot-${tagId++}`;
        component(tag, {
            render: () => html`<header><slot name="header">Default</slot></header><main><slot></slot></main>`,
        });

        const el = document.createElement(tag);
        el.innerHTML = '<h2 slot="header">Custom Header</h2><p>Body</p>';
        document.body.appendChild(el);

        expect(el.querySelector('header h2')?.textContent).toBe('Custom Header');
        expect(el.querySelector('main p')?.textContent).toBe('Body');
    });

    it('keeps default slot content when nothing projected', () => {
        const tag = `test-slot-${tagId++}`;
        component(tag, {
            render: () => html`<div><slot>Fallback</slot></div>`,
        });

        const el = document.createElement(tag);
        // No children — slot default should show
        document.body.appendChild(el);

        expect(el.textContent).toContain('Fallback');
    });
});

// ─── dynamic() ─────────────────────────────────────────────────────

describe('dynamic()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders element by tag name', () => {
        const current = signal('div');
        const frag = html`${dynamic(() => current())}`;
        document.body.appendChild(frag);

        expect(document.body.querySelector('div')).not.toBeNull();
    });

    it('switches element when tag changes', () => {
        const current = signal('div');
        const frag = html`${dynamic(() => current())}`;
        document.body.appendChild(frag);

        expect(document.body.querySelector('div')).not.toBeNull();
        expect(document.body.querySelector('span')).toBeNull();

        current.set('span');
        expect(document.body.querySelector('div')).toBeNull();
        expect(document.body.querySelector('span')).not.toBeNull();
    });

    it('sets attributes from props', () => {
        const frag = html`${dynamic(() => 'input', () => ({ type: 'text', placeholder: 'Search' }))}`;
        document.body.appendChild(frag);

        const input = document.body.querySelector('input')!;
        expect(input.getAttribute('type')).toBe('text');
        expect(input.getAttribute('placeholder')).toBe('Search');
    });

    it('renders nothing for empty tag', () => {
        const current = signal('');
        const frag = html`<div id="host">${dynamic(() => current())}</div>`;
        document.body.appendChild(frag);

        const host = document.getElementById('host')!;
        // Only comments, no element
        const elements = host.querySelectorAll('*');
        expect(elements.length).toBe(0);
    });
});
