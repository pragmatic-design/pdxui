// The bindings of one block run in one effect (#1275).
//
// A compiled block made an effect per binding: `pdx-fieldset` written declaratively made 13 at every
// mount and measured 1.4× its TypeScript version, which wrote the same DOM from one effect in a frame.
// The profile put the cost in the effects — their creation, first run and subscriptions — not in the
// DOM writes. A block's bindings are now gathered in a group, and `bindGroup` runs them in one effect:
// each keeps the value it wrote last and writes only when it changes.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import {
    bindAttribute, bindAttributeOrProperty, bindComponentProp, bindGroup, bindNativeProperty, bindStyleText,
    bindText, bindUrl, type BindGroup,
} from '../src/renderer/bound-attribute';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('bindGroup — a block\'s bindings in one effect', () => {
    it('writes every binding at once, then only the one whose value changed', () => {
        const a = signal('x');
        const b = signal('y');
        const el = document.createElement('div');
        let readsA = 0;
        const g: BindGroup = [];
        bindAttribute(el, 'aria-label', () => { readsA++; return a(); }, g);
        bindAttribute(el, 'title', () => b(), g);
        // Nothing is written before the group runs: a binding given a group adds itself to it.
        expect(el.hasAttribute('aria-label')).toBe(false);
        bindGroup(g);
        expect(el.getAttribute('aria-label')).toBe('x');
        expect(el.getAttribute('title')).toBe('y');

        const set = vi.spyOn(el, 'setAttribute');
        b.set('z');
        expect(el.getAttribute('title')).toBe('z');
        // One effect: b's change re-ran a's getter too, and a's attribute was not written again.
        expect(readsA).toBe(2);
        expect(set.mock.calls.map(c => c[0])).toEqual(['title']);
    });

    it('each write is the one its binding makes alone: attribute, property, style, URL, component prop', () => {
        const on = signal(true);
        const el = document.createElement('input');
        const link = document.createElement('a');
        const host = document.createElement('x-host');
        const g: BindGroup = [];
        bindAttribute(el, 'aria-hidden', () => on() ? null : 'true', g);
        bindNativeProperty(el, 'disabled', 'disabled', () => on(), g);
        bindAttributeOrProperty(el, 'id', 'id', () => on() ? 'a' : 'b', g);
        bindStyleText(el, () => on() ? 'display:none' : '', g);
        bindUrl(link, 'href', 'href', () => on() ? 'javascript:alert(1)' : '/ok', g);
        bindComponentProp(host, 'open', () => on(), g);
        bindGroup(g);
        expect(el.hasAttribute('aria-hidden')).toBe(false);
        expect(el.disabled).toBe(true);
        expect(el.id).toBe('a');
        expect(el.style.display).toBe('none');
        expect(link.hasAttribute('href'), 'a refused URL is no attribute').toBe(false);
        expect((host as unknown as { open: boolean }).open).toBe(true);
        on.set(false);
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.disabled).toBe(false);
        expect(el.id).toBe('b');
        expect(el.style.display).toBe('');
        expect(link.getAttribute('href')).toBe('/ok');
        expect((host as unknown as { open: boolean }).open).toBe(false);
    });

    it('bindText puts a text in place of its anchor, and changes it after', () => {
        const label = signal('');
        const p = document.createElement('p');
        const anchor = document.createComment('');
        p.appendChild(anchor);
        const g: BindGroup = [];
        bindText(anchor, () => label(), g);
        bindAttribute(p, 'title', () => label(), g);
        bindGroup(g);
        // '' is the empty text, in place of the anchor, as bindInterpolation renders it.
        expect(p.textContent).toBe('');
        expect(p.firstChild?.nodeType, 'the anchor was not replaced by a text node').toBe(Node.TEXT_NODE);
        label.set('Shipping');
        expect(p.textContent).toBe('Shipping');
        expect(p.childNodes.length).toBe(1);
        label.set('Billing');
        expect(p.textContent).toBe('Billing');
        expect(p.childNodes.length).toBe(1);
        label.set(null as unknown as string);
        expect(p.textContent).toBe('');
    });

    it('a value the markup holds already is not written again; a different one is', () => {
        // The compiler writes into the static markup the value a binding has with the props at their
        // defaults, and gives it to bindGroup: the first run writes only what differs from it.
        const legend = signal('');
        const open = signal(true);
        const el = document.createElement('div');
        el.setAttribute('style', 'display:none');
        el.setAttribute('aria-expanded', 'true');
        const g: BindGroup = [];
        bindStyleText(el, () => legend() ? '' : 'display:none', g);
        bindAttribute(el, 'aria-expanded', () => open() ? 'false' : 'true', g);
        bindAttribute(el, 'title', () => legend() || null, g);
        const css = vi.spyOn(el.style, 'cssText', 'set');
        const set = vi.spyOn(el, 'setAttribute');
        const remove = vi.spyOn(el, 'removeAttribute');
        // The second differs from what the markup holds: open is true where its default was false.
        bindGroup(g, ['display:none', 'true', null]);
        expect(css, 'the style the markup holds was written again').not.toHaveBeenCalled();
        expect(remove, 'an absent attribute predicted absent was removed').not.toHaveBeenCalled();
        expect(set.mock.calls).toEqual([['aria-expanded', 'false']]);
        legend.set('Shipping');
        expect(el.style.display).toBe('');
        expect(el.getAttribute('title')).toBe('Shipping');
    });

    it('an entry with no value given (undefined, a hole) is written at the first run as before', () => {
        const el = document.createElement('div');
        const g: BindGroup = [];
        bindAttribute(el, 'title', () => 'a', g);
        bindAttribute(el, 'lang', () => 'it', g);
        bindGroup(g, [undefined, 'it']);
        expect(el.getAttribute('title')).toBe('a');
        expect(el.hasAttribute('lang'), 'the value given was taken as written').toBe(false);
    });

    it('a binding given no group keeps its own effect, as before', () => {
        const a = signal('x');
        const el = document.createElement('div');
        bindAttribute(el, 'title', () => a());
        expect(el.getAttribute('title')).toBe('x');
        a.set('y');
        expect(el.getAttribute('title')).toBe('y');
    });
});
