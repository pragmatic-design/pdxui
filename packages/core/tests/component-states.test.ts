// A component's visual states are the platform's custom states (#132): `states: ['open']` in the
// descriptor, `ctx.state('open', bool)` to set one, `:state(open)` to style it.
//
// happy-dom has no ElementInternals, so `attachInternals` is provided here with the one thing these
// tests read, a CustomStateSet (a Set of names). That `:state()` matches what this sets is measured in
// Chromium (packages/showcase/tests/demo-panel.spec.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';

let seq = 0;
const tag = () => `x-states-${++seq}`;
const mounted: HTMLElement[] = [];
let attached: Array<{ el: HTMLElement; states: Set<string> }> = [];

beforeEach(() => {
    attached = [];
    Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
        configurable: true, writable: true,
        value(this: HTMLElement) {
            const states = new Set<string>();
            attached.push({ el: this, states });
            return { states };
        },
    });
});
afterEach(() => {
    for (const el of mounted.splice(0)) el.remove();
    delete (HTMLElement.prototype as { attachInternals?: unknown }).attachInternals;
    vi.restoreAllMocks();
});

function mount(name: string): HTMLElement {
    const el = document.createElement(name);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}
const statesOf = (el: HTMLElement) => attached.find(a => a.el === el)?.states;

describe('a declared state', () => {
    it('ctx.state turns it on and off in the host\'s custom states', () => {
        const name = tag();
        let set: (on: boolean) => void = () => {};
        component(name, {
            states: ['open'],
            setup(ctx) { set = (on) => ctx.state('open', on); },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        expect([...statesOf(el)!]).toEqual([]);
        set(true);
        expect([...statesOf(el)!]).toEqual(['open']);
        set(false);
        expect([...statesOf(el)!]).toEqual([]);
    });

    it('a component that declares no state attaches no internals', () => {
        const name = tag();
        component(name, { render: () => html`<p>x</p>` });
        mount(name);
        expect(attached).toEqual([]);
    });

    it('a form-associated component with states attaches its internals once, for both', () => {
        const name = tag();
        let set: (on: boolean) => void = () => {};
        component(name, {
            formAssociated: true,
            states: ['invalid'],
            setup(ctx) { set = (on) => ctx.state('invalid', on); },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        set(true);
        expect(attached.filter(a => a.el === el)).toHaveLength(1);
        expect([...statesOf(el)!]).toEqual(['invalid']);
    });

    it('a state the descriptor does not declare is not set, and is reported in development', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        let set: () => void = () => {};
        component(name, {
            states: ['open'],
            setup(ctx) { set = () => ctx.state('busy', true); },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        set();
        expect([...statesOf(el)!]).toEqual([]);
        expect(warn.mock.calls.flat().join(' ')).toContain(`set the state 'busy', which its descriptor does not declare`);
    });
});
