// An error boundary catches what its children throw after the first render.
//
// The handler stack at the moment an effect is created is not enough to find its boundary. The
// boundary pushes its handler, builds its content, pops it — but a child component does not render
// while the content is being built: it renders when it CONNECTS, which is when the boundary's
// fragment is inserted, after the pop. Its effects would have no boundary, and an error on a later
// signal change would go to the console while the child kept its old DOM. The same for a branch an
// `@if` inside the boundary renders later: built inside a flush, with nothing on the stack.
//
// So a component's effects report to the nearest boundary that encloses its host in the DOM, found
// when the error happens; effects created while another effect runs inherit its route.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signal, computed } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when } from '../src/renderer/helpers';
import { errorBoundary } from '../src/renderer/error-boundary';
import { component } from '../src/component/component';
import { onGlobalError, clearGlobalErrorHandlers } from '../src/component/global-error';

let tagId = 0;
const uniqueTag = () => `boundary-child-${tagId++}`;

/** A component whose rendered text reads a derived value that throws once `fail` is set. */
function failingChild(fail: ReturnType<typeof signal<boolean>>): string {
    const tag = uniqueTag();
    const label = computed(() => {
        if (fail()) throw new Error('child-boom');
        return 'child ok';
    });
    component(tag, { render: () => html`<span class="child">${() => label()}</span>` });
    return tag;
}

const fallback = (cls: string) => (err: Error) => html`<div class=${cls}>${err.message}</div>`;

let globalErrors: Error[] = [];

beforeEach(() => {
    document.body.innerHTML = '';
    globalErrors = [];
    clearGlobalErrorHandlers();
    onGlobalError((err) => { globalErrors.push(err); return true; });
});
afterEach(() => clearGlobalErrorHandlers());

describe('errorBoundary — errors from children after the first render', () => {
    it('a child component whose effect throws on a later change renders the fallback', () => {
        const fail = signal(false);
        const tag = failingChild(fail);
        const host = document.createElement('div');
        host.appendChild(errorBoundary(
            () => { const el = document.createElement(tag); return el; },
            fallback('error'),
        ));
        document.body.appendChild(host);
        expect(host.querySelector('.child')?.textContent, 'the child did not render at all').toBe('child ok');

        fail.set(true);

        expect(host.querySelector('.error')?.textContent, 'the fallback is not there — the error went elsewhere').toBe('child-boom');
        expect(host.querySelector('.child'), 'the child kept its old DOM next to the fallback').toBeNull();
        expect(globalErrors, 'the error reached the global handler as well').toEqual([]);
    });

    it('also when the boundary sits in a component template, as @try compiles', () => {
        const fail = signal(false);
        const child = failingChild(fail);
        const parent = uniqueTag();
        component(parent, {
            render: () => errorBoundary(() => { const el = document.createElement(child); return el; }, fallback('error')),
        });
        document.body.appendChild(document.createElement(parent));
        expect(document.querySelector('.child')?.textContent).toBe('child ok');

        fail.set(true);

        expect(document.querySelector('.error')?.textContent).toBe('child-boom');
        expect(globalErrors).toEqual([]);
    });

    it('a branch an @if renders later inside the boundary reports to it', () => {
        const show = signal(false);
        const fail = signal(false);
        const label = computed(() => { if (fail()) throw new Error('branch-boom'); return 'branch ok'; });
        document.body.appendChild(errorBoundary(
            () => when(() => show(), () => html`<b class="branch">${() => label()}</b>`),
            fallback('error'),
        ));
        show.set(true);
        expect(document.querySelector('.branch')?.textContent).toBe('branch ok');

        fail.set(true);

        expect(document.querySelector('.error')?.textContent).toBe('branch-boom');
        expect(globalErrors).toEqual([]);
    });

    it('the nearest boundary wins: an inner one catches, the outer one keeps its content', () => {
        const fail = signal(false);
        const tag = failingChild(fail);
        document.body.appendChild(errorBoundary(
            () => {
                const outer = document.createElement('section');
                outer.className = 'outer-content';
                outer.appendChild(errorBoundary(() => document.createElement(tag), fallback('inner-error')));
                return outer;
            },
            fallback('outer-error'),
        ));

        fail.set(true);

        expect(document.querySelector('.inner-error')?.textContent).toBe('child-boom');
        expect(document.querySelector('.outer-error'), 'the outer boundary took an error the inner one owns').toBeNull();
        expect(document.querySelector('.outer-content')).not.toBeNull();
    });

    it('a sibling boundary that closed before the child does not take its error', () => {
        const fail = signal(false);
        const tag = failingChild(fail);
        const host = document.createElement('div');
        host.appendChild(errorBoundary(() => html`<i class="sibling">fine</i>`, fallback('sibling-error')));
        host.appendChild(document.createElement(tag));
        document.body.appendChild(host);

        fail.set(true);

        expect(host.querySelector('.sibling-error'), 'a closed sibling range swallowed an error from outside it').toBeNull();
        expect(host.querySelector('.sibling')?.textContent).toBe('fine');
        expect(globalErrors.map(e => e.message), 'with no boundary around it, the error goes to the global handler').toEqual(['child-boom']);
    });

    it('an error from a component inside the fallback goes to the next boundary out', () => {
        const fail = signal(false);
        const tag = failingChild(fail);
        document.body.appendChild(errorBoundary(
            () => errorBoundary(
                () => { throw new Error('first'); },
                () => { const el = document.createElement(tag); return el; },
            ),
            fallback('outer-error'),
        ));
        expect(document.querySelector('.child')?.textContent, 'the inner fallback did not render').toBe('child ok');

        fail.set(true);

        expect(document.querySelector('.outer-error')?.textContent, 'a boundary showing its fallback caught an error from that fallback').toBe('child-boom');
    });

    it('control — a synchronous throw in the content still renders the fallback, as before', () => {
        document.body.appendChild(errorBoundary(() => { throw new Error('sync'); }, fallback('error')));
        expect(document.querySelector('.error')?.textContent).toBe('sync');
    });

    it('control — a child with no boundary around it reports to the global handler, not to nothing', () => {
        const fail = signal(false);
        const tag = failingChild(fail);
        document.body.appendChild(document.createElement(tag));

        fail.set(true);

        expect(globalErrors.map(e => e.message)).toEqual(['child-boom']);
    });
});

// A child whose SETUP or RENDER throws when it mounts.
//
// The routing above covers what a child's effects throw later. Mounting itself is two other paths:
// a setup exception would become an inline red span, and a render exception leaves
// connectedCallback, where the browser reports it instead of rethrowing it to the code that
// inserted the element — so the boundary's own try never sees either, and without routing the
// fallback the author wrote with @try would never render.
describe('errorBoundary — a child that throws while it mounts', () => {
    const setupThrows = (): string => {
        const tag = uniqueTag();
        component(tag, {
            setup: () => { throw new Error('setup-boom'); },
            render: () => html`<span class="child">never</span>`,
        });
        return tag;
    };
    const renderThrows = (): string => {
        const tag = uniqueTag();
        component(tag, { render: () => { throw new Error('render-boom'); } });
        return tag;
    };

    it('a child whose setup throws renders the boundary fallback, not an inline span', () => {
        const tag = setupThrows();
        const host = document.createElement('div');
        host.appendChild(errorBoundary(() => document.createElement(tag), fallback('error')));
        document.body.appendChild(host);

        expect(host.querySelector('.error')?.textContent, 'the fallback is not there').toBe('setup-boom');
        expect(host.textContent, 'the inline span rendered instead of the fallback').not.toContain('Error in <');
        expect(host.querySelector(tag), 'the failed child is still in the boundary next to the fallback').toBeNull();
        expect(globalErrors).toEqual([]);
    });

    it('a child whose render throws renders the boundary fallback', () => {
        const tag = renderThrows();
        const host = document.createElement('div');
        host.appendChild(errorBoundary(() => document.createElement(tag), fallback('error')));
        document.body.appendChild(host);

        expect(host.querySelector('.error')?.textContent, 'the fallback is not there').toBe('render-boom');
        expect(host.querySelector(tag)).toBeNull();
        expect(globalErrors).toEqual([]);
    });

    // When the boundary's fragment is inserted straight into the document, happy-dom connects the
    // child before the boundary's end marker has landed, and the boundary finishes the insertion
    // first: one microtask. Browsers run the reaction after the insertion, so there it is immediate.
    const insertionDone = () => new Promise<void>((r) => queueMicrotask(r));

    it('also when the boundary sits in a component template, as @try compiles', async () => {
        const child = renderThrows();
        const parent = uniqueTag();
        component(parent, {
            render: () => errorBoundary(() => document.createElement(child), fallback('error')),
        });
        document.body.appendChild(document.createElement(parent));
        await insertionDone();

        expect(document.querySelector('.error')?.textContent).toBe('render-boom');
        expect(document.querySelector(child)).toBeNull();
    });

    it('the fallback\'s own children report to the next boundary out, not to the child that failed', async () => {
        // The fallback is rendered after the failed child has stopped being the error owner: a
        // fallback effect that throws later must not be routed through a detached element.
        const fail = signal(false);
        const later = failingChild(fail);
        const tag = renderThrows();
        document.body.appendChild(errorBoundary(
            () => errorBoundary(() => document.createElement(tag), () => document.createElement(later)),
            fallback('outer-error'),
        ));
        await insertionDone();
        expect(document.querySelector('.child')?.textContent, 'the inner fallback did not render').toBe('child ok');

        fail.set(true);

        expect(document.querySelector('.outer-error')?.textContent).toBe('child-boom');
        expect(globalErrors).toEqual([]);
    });

    it('control — with no boundary, a setup error still renders the inline span', () => {
        const tag = setupThrows();
        const el = document.createElement(tag);
        document.body.appendChild(el);

        expect(el.textContent).toBe('Error in <' + tag + '>: setup-boom');
    });

    it('control — with no boundary, a render error still leaves connectedCallback', () => {
        const tag = renderThrows();
        expect(() => document.body.appendChild(document.createElement(tag))).toThrow('render-boom');
    });
});
