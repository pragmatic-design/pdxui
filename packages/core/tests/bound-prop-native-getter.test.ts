// A component prop whose name is also a read-only DOM property can be bound.
//
// pdx-affix declares `offsetTop`, pdx-input and pdx-statistic declare `prefix`. The DOM has both as
// getters with no setter — `HTMLElement.prototype.offsetTop`, `Element.prototype.prefix`. A component
// installs its own prop accessors when it connects, and a template binds while it builds the
// fragment, before that: `el.offsetTop = 5` reaches the native getter and throws "Cannot set property
// offsetTop of #<HTMLElement> which has only a getter", and the gallery of pdx-affix fails to render.
//
// Measured in Chromium over the UI manifest: 3 of 983 settable props collide this way. The value
// waits on the element as its own data property, which is how a value assigned before the
// upgrade already reaches the prop.

import { describe, it, expect, beforeEach } from 'vitest';
import { html, signal, component } from '../src/index';
import { waitFor } from '../src/testing/index';

component('probe-native-getter', {
    props: {
        offsetTop: { type: Number, default: 0 },
        prefix: { type: String, default: '' },
    },
    setup: () => ({}),
    render: (ctx) =>
        html`<span class="v">${() => `${ctx.offsetTop()}|${ctx.prefix()}`}</span>`,
});

const shown = () => document.querySelector('probe-native-getter .v')?.textContent;

describe('a bound prop named like a read-only DOM property', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('the DOM really has them as getters with no setter (the premise of this file)', () => {
        const probe = document.createElement('div');
        for (const name of ['offsetTop', 'prefix']) {
            let d: PropertyDescriptor | undefined;
            for (let o: object | null = probe; o && !d; o = Object.getPrototypeOf(o)) d = Object.getOwnPropertyDescriptor(o, name);
            expect(d?.get, `${name} is an accessor`).toBeTypeOf('function');
            expect(d?.set, `${name} has no setter`).toBeUndefined();
        }
    });

    it('a static value binds without throwing, and reaches the prop', async () => {
        let view: Node | undefined;
        expect(() => { view = html`<probe-native-getter :offset-top=${5} :prefix=${'$'}></probe-native-getter>` as unknown as Node; })
            .not.toThrow();
        document.body.appendChild(view!);
        await waitFor(() => shown() === '5|$');
        expect(shown()).toBe('5|$');
        expect((document.querySelector('probe-native-getter') as HTMLElement & { offsetTop: number }).offsetTop).toBe(5);
    });

    it('a reactive value binds, and later values reach the prop through its own setter', async () => {
        const top = signal(8);
        const pre = signal('€');
        document.body.appendChild(html`<probe-native-getter :offset-top=${() => top()} :prefix=${() => pre()}></probe-native-getter>` as unknown as Node);
        await waitFor(() => shown() === '8|€');
        expect(shown()).toBe('8|€');

        top.set(12);
        pre.set('£');
        await waitFor(() => shown() === '12|£');
        expect(shown()).toBe('12|£');
    });

    it('a value that goes away before the upgrade leaves the default', async () => {
        const top = signal<number | null>(3);
        const view = html`<probe-native-getter :offset-top=${() => top()}></probe-native-getter>` as unknown as Node;
        top.set(null);
        document.body.appendChild(view);
        await waitFor(() => shown() === '0|');
        expect(shown()).toBe('0|');
    });
});
