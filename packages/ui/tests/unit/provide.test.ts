// Tests for pdx-provide non-rendering cascading value component.

import { describe, it, expect, beforeEach } from 'vitest';
import { context, inject, clearProviders } from '@pdxui/core';
import '../../src/provide/pdx-provide';

describe('pdx-provide', () => {
    beforeEach(() => { document.body.innerHTML = ''; clearProviders(); });

    it('registers as custom element', () => {
        expect(customElements.get('pdx-provide')).toBeDefined();
    });

    it('renders nothing visible', async () => {
        const el = document.createElement('pdx-provide') as any;
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));
        expect(el.offsetHeight).toBe(0);
    });

    it('projects children through slot', async () => {
        const el = document.createElement('pdx-provide') as any;
        const child = document.createElement('span');
        child.textContent = 'hello';
        el.appendChild(child);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));
        expect(el.querySelector('span')?.textContent).toBe('hello');
    });

    it('provides a single value under its token to descendants', async () => {
        const Color = context<string>('color');
        const provider = document.createElement('pdx-provide') as any;
        provider.token = Color;
        provider.value = 'red';
        const child = document.createElement('div');
        provider.appendChild(child);
        document.body.appendChild(provider);
        await new Promise(r => setTimeout(r, 50));

        expect(inject(Color, child)).toBe('red');
    });

    it('provides multiple values via a :values Map of token to value', async () => {
        const Theme = context<string>('theme');
        const Locale = context<string>('locale');
        const provider = document.createElement('pdx-provide') as any;
        provider.values = new Map<unknown, unknown>([[Theme, 'dark'], [Locale, 'en']]);
        const child = document.createElement('div');
        provider.appendChild(child);
        document.body.appendChild(provider);
        await new Promise(r => setTimeout(r, 50));

        expect(inject(Theme, child)).toBe('dark');
        expect(inject(Locale, child)).toBe('en');
    });

    it('scoped override: nested provider shadows outer', async () => {
        const Theme = context<string>('theme');
        const outer = document.createElement('pdx-provide') as any;
        outer.token = Theme;
        outer.value = 'light';

        const inner = document.createElement('pdx-provide') as any;
        inner.token = Theme;
        inner.value = 'dark';

        const leaf = document.createElement('div');
        inner.appendChild(leaf);
        outer.appendChild(inner);
        document.body.appendChild(outer);
        await new Promise(r => setTimeout(r, 50));

        expect(inject(Theme, leaf)).toBe('dark');
    });
});
