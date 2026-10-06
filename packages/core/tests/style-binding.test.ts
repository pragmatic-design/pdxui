// `:style="…"` sets the inline style through `style.cssText`, on any element.
//
// Not through the `style` PROPERTY. A browser forwards that to cssText
// ([PutForwards=cssText] on ElementCSSInlineStyle, HTML and SVG alike), so it works there; an
// environment that implements `style` as a bare getter throws instead — happy-dom does, for SVG. The
// spinner binds `:style` on its <svg>, so any happy-dom test that showed a loading state would throw
// "Cannot set property style … which has only a getter" from inside an effect.
import { describe, it, expect } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

const first = (frag: DocumentFragment | Node) => (frag as DocumentFragment).firstElementChild ?? (frag as Element);

describe(':style binding', () => {
    it('sets the inline style of an SVG element', () => {
        const el = first(html`<svg :style=${'opacity: 0.5'}></svg>`);
        expect(el.getAttribute('style')).toMatch(/opacity:\s*0\.5/);
    });

    it('follows a reactive value on an SVG element', () => {
        const s = signal('opacity: 0.5');
        const el = first(html`<svg :style=${() => s()}></svg>`);
        s.set('opacity: 0.25');
        expect(el.getAttribute('style')).toMatch(/opacity:\s*0\.25/);
    });

    it('control — on an HTML element it sets the style, and null removes it', () => {
        const s = signal<string | null>('color: red');
        const el = first(html`<span :style=${() => s()}></span>`) as HTMLElement;
        expect(el.style.color).toBe('red');
        s.set(null);
        expect(el.hasAttribute('style')).toBe(false);
    });
});
