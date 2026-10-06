// Tests for pages() — keep-alive page switching.

import { describe, it, expect } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { pages } from '../src/renderer/pages';

describe('pages()', () => {
    it('renders the active page', () => {
        const active = signal<'a' | 'b'>('a');
        const frag = pages(() => active(), {
            a: () => { const el = document.createElement('div'); el.textContent = 'Page A'; return el; },
            b: () => { const el = document.createElement('div'); el.textContent = 'Page B'; return el; },
        });

        document.body.appendChild(frag);
        expect(document.body.textContent).toContain('Page A');
    });

    it('switches to another page', () => {
        const active = signal<'a' | 'b'>('a');
        const frag = pages(() => active(), {
            a: () => { const el = document.createElement('div'); el.textContent = 'Page A'; return el; },
            b: () => { const el = document.createElement('div'); el.textContent = 'Page B'; return el; },
        });

        document.body.appendChild(frag);
        active.set('b');
        expect(document.body.textContent).toContain('Page B');
    });

    it('preserves cached pages (keep-alive)', () => {
        const active = signal<'a' | 'b'>('a');
        let aRenderCount = 0;
        let bRenderCount = 0;

        const frag = pages(() => active(), {
            a: () => { aRenderCount++; const el = document.createElement('div'); el.textContent = 'A'; return el; },
            b: () => { bRenderCount++; const el = document.createElement('div'); el.textContent = 'B'; return el; },
        });

        document.body.appendChild(frag);
        expect(aRenderCount).toBe(1);

        active.set('b');
        expect(bRenderCount).toBe(1);

        active.set('a'); // back to A — should NOT re-render
        expect(aRenderCount).toBe(1); // still 1, not 2
    });

    it('hides inactive pages with display:none', () => {
        const active = signal<'x' | 'y'>('x');
        const frag = pages(() => active(), {
            x: () => { const el = document.createElement('div'); el.id = 'px'; return el; },
            y: () => { const el = document.createElement('div'); el.id = 'py'; return el; },
        });

        document.body.appendChild(frag);
        active.set('y'); // create page y, hide page x

        const pageX = document.querySelector('[data-page="x"]') as HTMLElement;
        const pageY = document.querySelector('[data-page="y"]') as HTMLElement;
        expect(pageX?.style.display).toBe('none');
        expect(pageY?.style.display).toBe('contents');
    });
});
