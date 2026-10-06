// pdx-rich-text keeps a data:image picture when HTML is loaded.
//
// A pasted image file is read with FileReader.readAsDataURL, so every image the editor creates
// itself is a `data:image/…` URL. Loading HTML — setHTML(), `value` with output="html", pasted HTML —
// runs the shared sanitizer; under the link policy it would remove the src, and the importer drops an
// <img> that has none. Then with output="html" a pasted picture would go out in `value` and be lost
// when that value came back: a saved draft reloaded, a form reset to its saved state. The import path
// allows data:image, as the view's render does.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';

type RichText = HTMLElement & { value: unknown; getHTML(): string; setHTML(html: string): void };

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** The editor builds in requestAnimationFrame: wait for its editing area, frame by frame. */
async function built(el: HTMLElement): Promise<void> {
    for (let i = 0; i < 20; i++) {
        if (el.querySelector('.pdx-rt-content')) return;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error('pdx-rich-text never built its editing area');
}

async function make(setup: (el: RichText) => void = () => {}): Promise<RichText> {
    const el = document.createElement('pdx-rich-text') as RichText;
    setup(el);
    document.body.appendChild(el);
    await built(el);
    return el;
}

const images = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLImageElement>('.pdx-rt-image img'));

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-rich-text: a data:image picture survives loading HTML', () => {
    it('setHTML renders it', async () => {
        const el = await make();
        el.setHTML(`<p>a</p><img src="${PNG}" alt="x"><p>b</p>`);
        expect(images(el), 'the picture was dropped on import').toHaveLength(1);
        expect(images(el)[0].getAttribute('src')).toBe(PNG);
    });

    it('with output="html" it goes out in value and comes back in', async () => {
        const el = await make(e => e.setAttribute('output', 'html'));
        el.setHTML(`<p>a</p><img src="${PNG}" alt="x"><p>b</p>`);
        const saved = el.getHTML();
        expect(saved, 'the serializer did not keep the src: the round trip measures nothing').toContain(PNG);

        const reloaded = await make(e => { e.setAttribute('output', 'html'); e.value = saved; });
        expect(images(reloaded), 'the saved draft came back without its picture').toHaveLength(1);
        expect(images(reloaded)[0].getAttribute('src')).toBe(PNG);
    });

    it('the controls: an https image loads as before, an html data: image is still dropped', async () => {
        const el = await make();
        el.setHTML('<p>a</p><img src="https://example.com/a.png" alt="x"><p>b</p>');
        expect(images(el)).toHaveLength(1);

        el.setHTML('<p>a</p><img src="data:text/html,<script>alert(1)</script>" alt="x"><p>b</p>');
        expect(images(el)).toHaveLength(0);
    });
});
