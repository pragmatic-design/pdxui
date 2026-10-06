// pdx-image loads pdx-icon only when an image fails and its fallback icon shows.
//
// This file is its own module graph: it imports nothing but the image.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/image/pdx-image';

async function mount(): Promise<HTMLElement> {
    const el = document.createElement('pdx-image');
    Object.assign(el, { src: '/a.png', alt: 'A' });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-image and pdx-icon', () => {
    beforeEach(cleanup);

    it('an image that has not failed never loads pdx-icon', async () => {
        const el = await mount();
        expect(el.querySelector('img')).not.toBeNull();
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for an image that did not fail').toBeUndefined();
    });

    it('control — a failed image shows its fallback icon, and loads it', async () => {
        const el = await mount();
        el.querySelector('img')!.dispatchEvent(new Event('error'));
        await tick(100);
        expect(el.querySelector('.pdx-img-fallback pdx-icon')).not.toBeNull();
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
