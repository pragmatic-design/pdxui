// PdxElement — slot projection, keepAlive freeze/resume, the remount cycle, and the
// form-associated surface.
//
// Most of these paths only exist because the DOM does something behind the component's back:
// children arriving after connect, a move that looks like a removal, a re-append that has to
// re-render rather than come back dead.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { PdxElement } from '../src/component/element';
import { define } from '../src/component/define';

let tagCounter = 0;
const uniqueTag = () => `el-more-${tagCounter++}`;

/** Define a PdxElement subclass from a body function, and return its tag. */
function defineEl(
    body: (self: PdxElement) => DocumentFragment | Node | null,
    extra: Partial<{ attrs: string[]; onConnected: () => void; onDisconnected: () => void }> = {},
): string {
    const tag = uniqueTag();
    class El extends PdxElement {
        static attrs = extra.attrs ?? [];
        body() { return body(this); }
        connected() { extra.onConnected?.(); }
        disconnected() { extra.onDisconnected?.(); }
    }
    define(tag, El as unknown as new () => PdxElement);
    return tag;
}

/**
 * Build the host with its light-DOM children and only THEN insert it, which is the order the
 * element sees in a page: children are in place before the upgrade runs connectedCallback.
 * Setting document.body.innerHTML instead upgrades the host while it is still empty.
 */
function mountWith(tag: string, childrenHtml: string): HTMLElement {
    const host = document.createElement(tag);
    host.innerHTML = childrenHtml;
    document.body.appendChild(host);
    return host;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('slot projection', () => {
    it('puts the default children where the unnamed slot is', () => {
        const tag = defineEl(() => html`<div class="box"><slot></slot></div>`);
        mountWith(tag, '<p>projected</p>');

        const box = document.querySelector('.box')!;
        expect(box.querySelector('p')!.textContent).toBe('projected');
        expect(document.querySelector('slot'), 'the placeholder was left in the DOM').toBeNull();
    });

    it('routes each child to the slot it names', () => {
        const tag = defineEl(() => html`
            <header><slot name="title"></slot></header>
            <footer><slot name="actions"></slot></footer>`);
        mountWith(tag, '<h1 slot="title">T</h1><button slot="actions">A</button>');

        expect(document.querySelector('header h1')!.textContent).toBe('T');
        expect(document.querySelector('footer button')!.textContent).toBe('A');
    });

    it('keeps the slot default content when nothing was projected into it', () => {
        const tag = defineEl(() => html`<div><slot name="empty">fallback</slot></div>`);
        mountWith(tag, '');

        expect(document.querySelector('div')!.textContent).toBe('fallback');
    });

    it('a child naming a slot the component does not have is dropped, not appended anywhere', () => {
        const tag = defineEl(() => html`<div><slot></slot></div>`);
        mountWith(tag, '<p slot="nowhere">x</p>');

        expect(document.querySelector('p'), 'an unmatched child was rendered anyway').toBeNull();
    });

    it('a template with no slot at all drops the children', () => {
        const tag = defineEl(() => html`<div>only mine</div>`);
        mountWith(tag, '<p>dropped</p>');

        expect(document.body.textContent).toBe('only mine');
    });

    it('a child appended after connect lands in the empty slot it belongs to', async () => {
        const tag = defineEl(() => html`<main><slot name="late"></slot></main>`);
        const el = document.createElement(tag);
        document.body.appendChild(el);

        const p = document.createElement('p');
        p.setAttribute('slot', 'late');
        p.textContent = 'late';
        el.appendChild(p);
        await new Promise((r) => setTimeout(r, 0));

        expect(document.querySelector('main')!.textContent,
            'a child added after connect never reached its slot').toBe('late');
    });

    it('a late child with no slot name goes to the unnamed slot', async () => {
        const tag = defineEl(() => html`<main><slot></slot></main>`);
        const el = document.createElement(tag);
        document.body.appendChild(el);

        el.appendChild(document.createElement('b'));
        await new Promise((r) => setTimeout(r, 0));

        expect(document.querySelector('main b'), 'the late child stayed outside the slot')
            .not.toBeNull();
    });

    it('stops watching for late children once the component is gone', async () => {
        const tag = defineEl(() => html`<main><slot></slot></main>`);
        const el = document.createElement(tag);
        document.body.appendChild(el);
        el.remove();

        expect(() => el.appendChild(document.createElement('b'))).not.toThrow();
    });
});

describe('the mount cycle', () => {
    it('renders once, and re-renders after a removal', () => {
        // A move IS a remount: appendChild on a node already in the tree removes and re-inserts
        // it, so the element sees disconnect then connect. Surviving a move is what keepAlive is
        // for, and it has its own tests below.
        let bodies = 0;
        const tag = defineEl(() => { bodies++; return html`<p>${String(bodies)}</p>`; });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(bodies).toBe(1);

        el.remove();
        document.body.appendChild(el);

        expect(bodies, 'a re-appended element came back dead').toBe(2);
        expect(el.textContent).toBe('2');
    });

    it('calls connected() and disconnected() at the right times', () => {
        const onConnected = vi.fn();
        const onDisconnected = vi.fn();
        const tag = defineEl(() => html`<p>x</p>`, { onConnected, onDisconnected });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(onConnected).toHaveBeenCalledTimes(1);
        expect(onDisconnected).not.toHaveBeenCalled();

        el.remove();
        expect(onDisconnected).toHaveBeenCalledTimes(1);
    });

    it('disposes the template effects, so a removed component stops re-rendering', () => {
        const count = signal(0);
        let renders = 0;
        const tag = defineEl(() => html`<p>${() => { renders++; return String(count()); }}</p>`);

        const el = document.createElement(tag);
        document.body.appendChild(el);
        const after = renders;

        el.remove();
        count.set(1);

        expect(renders, 'the binding outlived the element it belonged to').toBe(after);
    });
});

describe('keepAlive — freeze and resume', () => {
    it('a frozen element keeps its DOM and does not re-render on return', () => {
        let bodies = 0;
        const tag = defineEl(() => { bodies++; return html`<p>kept</p>`; });

        const el = document.createElement(tag) as PdxElement;
        document.body.appendChild(el);
        (el as unknown as { _keepAlive: boolean })._keepAlive = true;

        const frozen = document.createDocumentFragment();
        frozen.appendChild(el);
        expect(el.textContent, 'the frozen subtree was torn down').toBe('kept');

        document.body.appendChild(el);
        expect(bodies, 'a resumed element was rebuilt instead of resumed').toBe(1);
    });

    it('a frozen element keeps its effects live', () => {
        const count = signal(0);
        const tag = defineEl(() => html`<p>${count}</p>`);

        const el = document.createElement(tag) as PdxElement;
        document.body.appendChild(el);
        (el as unknown as { _keepAlive: boolean })._keepAlive = true;
        document.createDocumentFragment().appendChild(el);

        count.set(5);

        expect(el.textContent, 'a frozen component stopped following its state').toBe('5');
    });
});

describe('attributes', () => {
    it('reads a declared attribute at construction, whatever the markup order', () => {
        const seen: (string | null)[] = [];
        const tag = defineEl((self) => { seen.push(self.attr('initial')()); return html`<p></p>`; },
            { attrs: ['initial'] });
        const host = document.createElement(tag);
        host.setAttribute('initial', '7');
        document.body.appendChild(host);

        expect(seen).toEqual(['7']);
    });

    it('an undeclared attribute still gets a signal, read from the DOM on demand', () => {
        const tag = defineEl((self) => html`<p>${self.attr('title')}</p>`);
        const host = document.createElement(tag);
        host.setAttribute('title', 'from-dom');
        document.body.appendChild(host);

        expect(host.querySelector('p')!.textContent).toBe('from-dom');
    });

    it('the same signal is handed back on every call', () => {
        let a: unknown, b: unknown;
        const tag = defineEl((self) => { a = self.attr('x'); b = self.attr('x'); return html`<p></p>`; });
        document.body.appendChild(document.createElement(tag));
        expect(a).toBe(b);
    });

    it('a change to an undeclared attribute does not reach the signal', () => {
        // observedAttributes only lists the declared ones — this records the cost of not
        // declaring, so nobody debugs it twice.
        const tag = defineEl((self) => html`<p>${self.attr('title')}</p>`);
        const host = document.createElement(tag);
        host.setAttribute('title', 'one');
        document.body.appendChild(host);

        host.setAttribute('title', 'two');

        expect(host.querySelector('p')!.textContent).toBe('one');
    });

    it('observedAttributes is what the class declared', () => {
        const tag = defineEl(() => html`<p></p>`, { attrs: ['a', 'b'] });
        const ctor = customElements.get(tag)! as unknown as { observedAttributes: string[] };
        expect(ctor.observedAttributes).toEqual(['a', 'b']);
    });
});

describe('emit', () => {
    it('dispatches a bubbling, composed CustomEvent carrying the detail', () => {
        const tag = defineEl(() => html`<p></p>`);
        const el = document.createElement(tag) as PdxElement;
        document.body.appendChild(el);

        const seen: CustomEvent[] = [];
        document.body.addEventListener('pdx-thing', (e) => seen.push(e as CustomEvent));

        el.emit('pdx-thing', { id: 1 });

        expect(seen, 'the event did not reach an ancestor listener').toHaveLength(1);
        expect(seen[0].detail).toEqual({ id: 1 });
        expect(seen[0].composed).toBe(true);
    });

    it('an event with no detail is still dispatched', () => {
        const tag = defineEl(() => html`<p></p>`);
        const el = document.createElement(tag) as PdxElement;
        document.body.appendChild(el);

        const fn = vi.fn();
        el.addEventListener('ping', fn);
        el.emit('ping');

        expect(fn).toHaveBeenCalled();
        // CustomEvent.detail defaults to null, not undefined — the platform's answer, not ours.
        expect((fn.mock.calls[0][0] as CustomEvent).detail).toBeNull();
    });
});

describe('the form-associated surface without ElementInternals', () => {
    it('answers safely rather than throwing when internals were never attached', () => {
        const tag = defineEl(() => html`<input />`);
        const el = document.createElement(tag) as PdxElement;
        document.body.appendChild(el);

        // No formAssociated → no _internals. Every accessor has to degrade, because a
        // component that is not in a form still gets asked these by generic form code.
        expect(el.form).toBeNull();
        expect(el.validationMessage).toBe('');
        expect(el.validity).toEqual({});
        expect(el.checkValidity()).toBe(true);
        expect(el.reportValidity()).toBe(true);
        expect(() => el.setFormValue('x')).not.toThrow();
        expect(() => el.setValidity({ valueMissing: true }, 'required')).not.toThrow();
        expect(() => el.formResetCallback()).not.toThrow();
        expect(() => el.formStateRestoreCallback('x', 'restore')).not.toThrow();
    });
});

describe('a body that renders nothing', () => {
    it('mounts an empty element instead of failing', () => {
        const tag = defineEl(() => null);
        const el = document.createElement(tag);
        expect(() => document.body.appendChild(el)).not.toThrow();
        expect(el.childNodes).toHaveLength(0);
    });
});
