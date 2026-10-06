// Tests for pdx-provide non-rendering cascading value component.

import { describe, it, expect, beforeEach } from 'vitest';
import { inject, clearProviders } from '@pdxui/core';
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

    it('provides single named value to descendants', async () => {
        const provider = document.createElement('pdx-provide') as any;
        provider.name = 'color';
        provider.value = 'red';
        const child = document.createElement('div');
        provider.appendChild(child);
        document.body.appendChild(provider);
        await new Promise(r => setTimeout(r, 50));

        expect(inject('color', child)).toBe('red');
    });

    it('provides multiple values via :values prop', async () => {
        const provider = document.createElement('pdx-provide') as any;
        provider.values = { theme: 'dark', locale: 'en' };
        const child = document.createElement('div');
        provider.appendChild(child);
        document.body.appendChild(provider);
        await new Promise(r => setTimeout(r, 50));

        expect(inject('theme', child)).toBe('dark');
        expect(inject('locale', child)).toBe('en');
    });

    it('scoped override: nested provider shadows outer', async () => {
        const outer = document.createElement('pdx-provide') as any;
        outer.name = 'theme';
        outer.value = 'light';

        const inner = document.createElement('pdx-provide') as any;
        inner.name = 'theme';
        inner.value = 'dark';

        const leaf = document.createElement('div');
        inner.appendChild(leaf);
        outer.appendChild(inner);
        document.body.appendChild(outer);
        await new Promise(r => setTimeout(r, 50));

        expect(inject('theme', leaf)).toBe('dark');
    });
});
