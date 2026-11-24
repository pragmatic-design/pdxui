// Core's binding of a URL and of a component's prop, the calls a compiled template makes for `:href`,
// `:src` and `<pdx-x :title>` (#1346). The compiled module wrote each of these out as its own effect
// before: what the calls write is what that inline code wrote.

import { describe, it, expect, vi } from 'vitest';
import { bindUrl, bindComponentProp } from '../src/renderer/bound-attribute';
import { signal } from '../src/reactivity/signal';

describe('bindUrl', () => {
    it('assigns a safe URL to the property, refuses javascript:, and removes the attribute on null', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const a = document.createElement('a');
        const v = signal<string | null>('/docs');
        bindUrl(a, 'href', 'href', () => v());
        expect(a.getAttribute('href')).toBe('/docs');
        v.set('javascript:alert(1)');
        expect(a.hasAttribute('href'), 'a refused URL leaves no href').toBe(false);
        v.set('/next');
        expect(a.getAttribute('href')).toBe('/next');
        v.set(null);
        expect(a.hasAttribute('href')).toBe(false);
        warn.mockRestore();
    });

    it('does not write the same value again over what the element holds since (#44)', () => {
        const a = document.createElement('a');
        const v = signal('/a');
        const other = signal(0);
        bindUrl(a, 'href', 'href', () => { other(); return v(); });
        a.setAttribute('href', '/changed');
        other.set(1);
        expect(a.getAttribute('href')).toBe('/changed');
        v.set('/b');
        expect(a.getAttribute('href')).toBe('/b');
    });

    it('writes the attribute when no property is named, and media takes blob:', () => {
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        const img = document.createElement('img');
        bindUrl(use, 'xlink:href', null, () => '#icon');
        bindUrl(img, 'src', 'src', 'blob:http://x/1', 1);
        expect(use.getAttribute('xlink:href')).toBe('#icon');
        expect(img.getAttribute('src')).toBe('blob:http://x/1');
    });

    it('a name the element does not have is its attribute', () => {
        const div = document.createElement('div');
        bindUrl(div, 'href', 'href', () => '/x');
        expect(div.getAttribute('href')).toBe('/x');
        expect((div as unknown as Record<string, unknown>).href, 'no expando').toBeUndefined();
    });
});

describe('bindComponentProp', () => {
    it('assigns the prop of a component not yet upgraded, and skips an unchanged value', () => {
        const el = document.createElement('pdx-not-defined-1346');
        const v = signal({ n: 1 });
        const other = signal(0);
        bindComponentProp(el, 'item', () => { other(); return v(); });
        const first = (el as unknown as { item: unknown }).item;
        expect(first).toEqual({ n: 1 });
        (el as unknown as { item: unknown }).item = 'set since';
        other.set(1);
        expect((el as unknown as { item: unknown }).item, 'the same value is not written again').toBe('set since');
        v.set({ n: 2 });
        expect((el as unknown as { item: unknown }).item).toEqual({ n: 2 });
    });

    it('a component URL prop goes through bindUrl: assigned before the upgrade, javascript: refused', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = document.createElement('pdx-not-defined-1346');
        const v = signal('/ok');
        bindUrl(el, 'href', 'href', () => v());
        expect((el as unknown as { href: unknown }).href).toBe('/ok');
        v.set('javascript:x');
        expect((el as unknown as { href: unknown }).href, 'the refused value is not assigned').toBe('/ok');
        expect(el.hasAttribute('href')).toBe(false);
        warn.mockRestore();
    });
});
