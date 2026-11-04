// The constructor prop form is gone from component() (#300). A prop is declared with the descriptor,
// prop<T>(), prop.required<T>() or prop.optional<T>(), and a model with model<T>(); the alpha form
// `props: { label: { type: String, default: '' } }` is a type error in TypeScript, and an error that
// names the prop in development when JavaScript passes it anyway.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { component } from '../src/component/component';
import { prop, model } from '../src/component/component-descriptor';
import { html } from '../src/renderer/template';

let seq = 0;
const tag = () => `x-ctor-removed-${++seq}`;
afterEach(() => { vi.restoreAllMocks(); });

describe('the constructor prop form', () => {
    it('is a type error in TypeScript', () => {
        // The test is the compiler's: tsc fails on an @ts-expect-error that expects nothing.
        const declare = () => component(tag(), {
            // @ts-expect-error — the constructor form is not a prop declaration any more
            props: { a: { type: String, default: '' } },
            render: () => html`<span></span>`,
        });
        expect(typeof declare).toBe('function');
    });

    it('throws in development, naming the prop and the descriptor form', () => {
        const props = { a: { type: String, default: '' } } as unknown as Record<string, ReturnType<typeof prop<string>>>;
        expect(() => component(tag(), { props, render: () => html`<span></span>` }))
            .toThrow(/'a'.*prop</s);
    });

    it('throws for a model written the same way', () => {
        const models = { value: { type: String, default: '' } } as unknown as Record<string, ReturnType<typeof model<string>>>;
        expect(() => component(tag(), { models, render: () => html`<span></span>` }))
            .toThrow(/'value'.*model</s);
    });

    it('the control: the descriptor registers the element', () => {
        const name = tag();
        component(name, {
            props: { a: prop(''), b: prop.optional<number>({ type: Number }), c: prop.required<string>({ type: String }) },
            models: { value: model('') },
            render: () => html`<span></span>`,
        });
        expect(customElements.get(name)).toBeDefined();
    });
});
