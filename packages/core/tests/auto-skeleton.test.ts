// showSkeleton / hideSkeleton put the element's OWN nodes back, and build no markup from options.
//
// The content was kept as an HTML string in an attribute and restored with innerHTML (#65, code
// scanning alerts #34–#38): restored nodes were new nodes — their listeners and component state gone
// — and whatever wrote that attribute in between chose the HTML. The options were concatenated into
// markup and into a stylesheet.

import { describe, it, expect, afterEach } from 'vitest';
import { showSkeleton, hideSkeleton } from '../src/component/auto-skeleton';

function host(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the content comes back as it was', () => {
    it('the same nodes, with their listeners', () => {
        const el = host('<button>Save</button><p>Text</p>');
        const button = el.querySelector('button')!;
        let clicks = 0;
        button.addEventListener('click', () => clicks++);

        const dispose = showSkeleton(el);
        expect(el.querySelector('button'), 'the button is still showing under the skeleton').toBeNull();
        dispose();

        expect(el.querySelector('button'), 'a new button came back, not the one that was there').toBe(button);
        button.click();
        expect(clicks, 'the listener was lost').toBe(1);
    });

    it('an attribute written while the skeleton shows does not choose what comes back', () => {
        const el = host('<p>Text</p>');
        showSkeleton(el);
        el.setAttribute('data-pdx-skeleton-original', '<img src="x" onerror="window.__pwned = 1">');
        hideSkeleton(el);
        expect(el.querySelector('img'), 'the attribute was parsed as HTML').toBeNull();
        expect(el.querySelector('p')?.textContent).toBe('Text');
    });

    it('a skipped child stays where it was, during and after', () => {
        const el = host('<header data-keep>Head</header><p>Body</p>');
        const header = el.querySelector('header')!;
        const dispose = showSkeleton(el, { skip: '[data-keep]' });
        expect(el.firstElementChild, 'the skipped child is not shown during the skeleton').toBe(header);
        dispose();
        expect(el.firstElementChild).toBe(header);
        expect(el.querySelector('p')?.textContent).toBe('Body');
    });

    it('control — the skeleton shows, and the marker comes and goes', () => {
        const el = host('<h3>Title</h3><p>Text content</p>');
        const dispose = showSkeleton(el);
        expect(el.querySelector('.pdx-skeleton')).not.toBeNull();
        expect(el.hasAttribute('data-pdx-skeleton')).toBe(true);
        dispose();
        expect(el.querySelector('.pdx-skeleton')).toBeNull();
        expect(el.hasAttribute('data-pdx-skeleton')).toBe(false);
    });
});

describe('the options build no markup', () => {
    it('a border radius cannot add declarations', () => {
        const el = host('<img alt="">');
        showSkeleton(el, { borderRadius: '1px;background:url(x)' });
        const shape = el.querySelector<HTMLElement>('.pdx-skeleton')!;
        expect(shape.style.backgroundImage, 'the radius wrote a background').toBe('');
        expect(shape.getAttribute('style') ?? '').not.toContain('url(');
    });

    it('an animation outside the three names cannot add an attribute', () => {
        const el = host('<img alt="">');
        showSkeleton(el, { animation: 'pulse" onclick="window.__pwned = 1' as never });
        const shape = el.querySelector<HTMLElement>('.pdx-skeleton')!;
        expect(shape.hasAttribute('onclick')).toBe(false);
        expect(shape.className).toBe('pdx-skeleton pdx-skeleton-pulse');
    });

    it('a colour reaches the skeleton, and cannot rewrite the stylesheet', () => {
        const el = host('<img alt="">');
        showSkeleton(el, { color: 'red } body { display: none' });
        const sheet = document.getElementById('pdx-skeleton-styles')?.textContent ?? '';
        expect(sheet, 'the colour was written into the stylesheet').not.toContain('display: none');
        expect(el.style.getPropertyValue('--pdx-skeleton-color')).toBe('red } body { display: none');
    });
});
