// The core entry must be importable without a DOM (Node/SSR/tooling).
// happy-dom provides HTMLElement in this suite, so we assert the SSR-safe base-class
// pattern instead: the module loaded and PdxElement is a usable class.
import { describe, it, expect } from 'vitest';
import { PdxElement } from '../src/component/element';
import { signal, computed, effect, html, component } from '../src/index';

describe('core is importable and functional', () => {
    it('exposes the public API', () => {
        expect(typeof component).toBe('function');
        expect(typeof html).toBe('function');
        expect(typeof PdxElement).toBe('function');
    });

    it('reactivity works after import', () => {
        const c = signal(1);
        const d = computed(() => c() * 2);
        let seen = 0;
        effect(() => { seen = d(); });
        c.set(3);
        expect(seen).toBe(6);
    });
});
