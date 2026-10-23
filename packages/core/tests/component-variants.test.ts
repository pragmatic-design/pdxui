// A library component's variants (#512): `variants` in the descriptor declares each axis once — a list
// of values, or a record from value to the native selector that draws it on plain HTML (#626) — and
// generates what `@variants` generates in a `.pdx`: a prop per axis, typed with its values, defaulting
// to the first, and reflected on the host as an attribute, which the design CSS keys its rules on.

import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';
import type { Signal } from '../src/utils/types';

let seq = 0;
const tag = () => `x-variants-${++seq}`;
const mounted: HTMLElement[] = [];

afterEach(() => {
    for (const el of mounted.splice(0)) el.remove();
    vi.restoreAllMocks();
});

function mount(name: string, attrs: Record<string, string> = {}): HTMLElement & Record<string, unknown> {
    const el = document.createElement(name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    mounted.push(el);
    return el as HTMLElement & Record<string, unknown>;
}

describe('a variant axis', () => {
    it('reflects its default, the first value, on the host', () => {
        const name = tag();
        component(name, { variants: { size: ['md', 'sm', 'lg'] }, render: () => html`<p>x</p>` });
        const el = mount(name);
        expect(el.getAttribute('size')).toBe('md');
        expect(el.size).toBe('md');
    });

    it('takes its value from the markup', () => {
        const name = tag();
        component(name, { variants: { size: ['md', 'sm', 'lg'] }, render: () => html`<p>x</p>` });
        const el = mount(name, { size: 'lg' });
        expect(el.size).toBe('lg');
        expect(el.getAttribute('size')).toBe('lg');
    });

    it('reflects a value set through the property', () => {
        const name = tag();
        component(name, { variants: { size: ['md', 'sm', 'lg'] }, render: () => html`<p>x</p>` });
        const el = mount(name);
        el.size = 'sm';
        expect(el.getAttribute('size')).toBe('sm');
    });

    it('reflects the default for a value the axis does not have', () => {
        const name = tag();
        component(name, { variants: { size: ['md', 'sm', 'lg'] }, render: () => html`<p>x</p>` });
        const el = mount(name, { size: 'huge' });
        expect(el.getAttribute('size')).toBe('md');
        expect(el.size).toBe('md');
    });

    it('in the record form takes its values from the keys', () => {
        const name = tag();
        component(name, {
            variants: { variant: { primary: '.pdx-primary', ghost: '.pdx-ghost' } },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name, { variant: 'ghost' });
        expect(el.getAttribute('variant')).toBe('ghost');
        el.variant = 'nope';
        expect(el.getAttribute('variant')).toBe('primary');
    });

    it('is a signal on the context, typed with its values', () => {
        const name = tag();
        const seen: string[] = [];
        component(name, {
            variants: { size: ['md', 'sm', 'lg'], variant: { primary: '.pdx-primary', ghost: '.pdx-ghost' } },
            setup(ctx) {
                expectTypeOf(ctx.size).toEqualTypeOf<Signal<'md' | 'sm' | 'lg'>>();
                expectTypeOf(ctx.variant).toEqualTypeOf<Signal<'primary' | 'ghost'>>();
                ctx.track(() => { seen.push(ctx.size()); });
            },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        el.size = 'lg';
        expect(seen).toEqual(['md', 'lg']);
    });

    it('declared also as a prop is reported, and the axis wins', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        component(name, {
            props: { size: { type: String, default: 'xl' } },
            variants: { size: ['md', 'sm'] },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        expect(el.getAttribute('size')).toBe('md');
        expect(warn.mock.calls.flat().join(' ')).toMatch(/size.*both a prop and a variant axis/);
    });
});
