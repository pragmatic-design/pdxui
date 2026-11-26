// A component's visual states are the platform's custom states (#132): `states: ['open']` in the
// descriptor, `ctx.state('open', bool)` to set one, `:state(open)` to style it.
//
// happy-dom has no ElementInternals, so `attachInternals` is provided here with the one thing these
// tests read, a CustomStateSet (a Set of names). That `:state()` matches what this sets is measured in
// Chromium (packages/showcase/tests/demo-panel.spec.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { PdxElement } from '../src/component/element';
import { html } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';

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

    it('ctx.states keeps each state in step with its own function (#1207)', () => {
        const name = tag();
        const open = signal(false);
        const count = signal(0);
        component(name, {
            states: ['open', 'busy'],
            setup(ctx) {
                ctx.states({
                    open: () => open(),
                    busy: () => count() > 0,
                });
            },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        expect([...statesOf(el)!]).toEqual([]);
        open.set(true);
        expect([...statesOf(el)!]).toEqual(['open']);
        count.set(2);
        expect([...statesOf(el)!].sort()).toEqual(['busy', 'open']);
        open.set(false);
        expect([...statesOf(el)!]).toEqual(['busy']);
        count.set(0);
        expect([...statesOf(el)!]).toEqual([]);
    });

    it('ctx.states tracks all its states in one effect, whatever their number (#1432)', () => {
        // Each effect is paid at every mount; a TypeScript component set its states in one track or
        // none, so a compiled @state must not cost one per state.
        const proto = PdxElement.prototype as unknown as { track: (...args: unknown[]) => unknown };
        const tracks = vi.spyOn(proto, 'track');
        const countTracks = (states: string[], map: (flag: () => boolean) => Record<string, () => unknown>) => {
            const name = tag();
            const flag = signal(false);
            component(name, {
                states,
                setup(ctx) { if (states.length > 0) ctx.states(map(flag)); },
                render: () => html`<p>x</p>`,
            });
            tracks.mockClear();
            mount(name);
            return tracks.mock.calls.length;
        };
        const none = countTracks([], () => ({}));
        const three = countTracks(['a', 'b', 'c'], flag => ({ a: () => flag(), b: () => !flag(), c: () => flag() }));
        expect(three - none).toBe(1);
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
