// An image can show the file the user just picked; a link still cannot point at one.
//
// The link policy allows http, https, mailto, tel and ftp. Applied to `src` (a resource) as well
// as `href` (navigation), it would drop `<img :src>` bound to `URL.createObjectURL(file)`, the
// ordinary upload preview: `src=""`, naturalWidth 0, no message. The same for an inline
// `data:image/png;base64,…`.
//
// So the policy follows what the URL is used for. `src` on img/source/video/audio and `poster`
// load media, and accept `blob:` and raster `data:image/*` on top of the link policy. Everything
// else keeps the link policy unchanged: `sanitizeUrl` still rejects `blob:` (sanitize-url.test.ts).
// SVG is not a raster: `data:image/svg+xml` can carry script when opened as a document, so it
// stays out. And a dropped URL says so in dev, once per element and attribute.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { sanitizeUrl, sanitizeMediaUrl } from '../src/security/sanitize-url';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { setProp } from '../src/renderer/dom';

const BLOB = 'blob:http://localhost/7c9f2e1a-4b3d-4e5f-9a8b-1c2d3e4f5a6b';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>';
const HTML_DOC = 'data:text/html,<script>alert(1)</script>';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

/** Render a template and return its first element. */
function mount<T extends Element>(frag: DocumentFragment | Node): T {
    document.body.appendChild(frag);
    return document.body.firstElementChild as T;
}

describe('sanitizeMediaUrl', () => {
    it('accepts a local object URL and the raster data: images', () => {
        expect(sanitizeMediaUrl(BLOB)).toBe(BLOB);
        expect(sanitizeMediaUrl(PNG)).toBe(PNG);
        for (const type of ['jpeg', 'gif', 'webp', 'avif']) {
            const url = `data:image/${type};base64,AAAA`;
            expect(sanitizeMediaUrl(url), type).toBe(url);
        }
    });

    it('accepts everything the link policy accepts', () => {
        for (const u of ['/photos/1.jpg', './x.png', 'https://cdn.example.com/a.webp', '?v=2']) {
            expect(sanitizeMediaUrl(u)).toBe(sanitizeUrl(u));
        }
    });

    it('rejects svg and every non-image data: type, and what the link policy rejects', () => {
        for (const bad of [SVG, HTML_DOC, 'data:application/javascript,alert(1)', 'data:image/png-evil,AAAA',
            'javascript:alert(1)', '//evil.com', 'java\tscript:alert(1)', 'blob\n:http://x/1', '']) {
            expect(sanitizeMediaUrl(bad), bad).toBeNull();
        }
    });
});

describe('<img :src> keeps a local image', () => {
    it('a bound blob: URL reaches the image, static and reactive', () => {
        const img = mount<HTMLImageElement>(html`<img :src=${BLOB} />`);
        expect(img.getAttribute('src')).toBe(BLOB);

        document.body.innerHTML = '';
        const url = signal('/placeholder.png');
        const live = mount<HTMLImageElement>(html`<img :src=${() => url()} />`);
        url.set(BLOB);
        expect(live.getAttribute('src')).toBe(BLOB);
    });

    it('a bound data:image/png reaches the image', () => {
        const img = mount<HTMLImageElement>(html`<img :src=${PNG} />`);
        expect(img.getAttribute('src')).toBe(PNG);
    });

    it('source, video, audio and poster follow the same policy', () => {
        const video = mount<HTMLVideoElement>(html`<video :src=${BLOB} :poster=${PNG}></video>`);
        expect(video.getAttribute('src')).toBe(BLOB);
        expect(video.getAttribute('poster')).toBe(PNG);

        document.body.innerHTML = '';
        const audio = mount<HTMLAudioElement>(html`<audio :src=${BLOB}></audio>`);
        expect(audio.getAttribute('src')).toBe(BLOB);

        const source = document.createElement('source');
        setProp(source, 'src', BLOB);
        expect(source.getAttribute('src')).toBe(BLOB);
    });

    it('setProp() gives an image the same policy as the template', () => {
        const img = document.createElement('img');
        setProp(img, 'src', BLOB);
        expect(img.getAttribute('src')).toBe(BLOB);
    });
});

// A component's `src` is a prop it owns, and it hands the URL to a native sink of its own — pdx-avatar
// renders an <img>, pdx-image assigns one — where that element's policy applies again. With the link
// policy at the binding, `<pdx-image :src=${previewUrl}>` would never receive the preview.
describe('a custom element\'s :src gets the media policy', () => {
    it('a bound blob: or data:image URL reaches the component, static and reactive', () => {
        const el = mount<HTMLElement>(html`<pdx-media-x :src=${BLOB}></pdx-media-x>`);
        expect((el as unknown as { src?: string }).src).toBe(BLOB);

        document.body.innerHTML = '';
        const url = signal('/placeholder.png');
        const live = mount<HTMLElement>(html`<pdx-media-x :src=${() => url()}></pdx-media-x>`);
        url.set(PNG);
        expect((live as unknown as { src?: string }).src).toBe(PNG);
    });

    it('setProp() gives a component\'s src the same policy', () => {
        const el = document.createElement('pdx-media-x');
        setProp(el, 'src', BLOB);
        expect((el as unknown as { src?: string }).src ?? el.getAttribute('src')).toBe(BLOB);
    });

    it('the controls: its :href with a blob: URL, and its :src with javascript: or svg, are dropped', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const link = mount<HTMLElement>(html`<pdx-media-x :href=${BLOB}></pdx-media-x>`);
        expect((link as unknown as { href?: string }).href).toBeUndefined();
        expect(link.hasAttribute('href')).toBe(false);

        for (const bad of ['javascript:alert(1)', SVG]) {
            document.body.innerHTML = '';
            const el = mount<HTMLElement>(html`<pdx-media-x :src=${bad}></pdx-media-x>`);
            expect((el as unknown as { src?: string }).src, bad).toBeUndefined();
            expect(el.hasAttribute('src'), bad).toBe(false);
        }
    });
});

describe('the controls: nothing else widened', () => {
    it('<a :href> with a blob: URL is still dropped', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const a = mount<HTMLAnchorElement>(html`<a :href=${BLOB}>file</a>`);
        expect(a.getAttribute('href')).toBeNull();
    });

    it('<img :src> with an svg or an html data: URL is dropped', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (const bad of [SVG, HTML_DOC]) {
            const img = mount<HTMLImageElement>(html`<img :src=${bad} />`);
            expect(img.getAttribute('src'), bad).toBeNull();
            document.body.innerHTML = '';
        }
    });

    it('<iframe :src> with a blob: URL is dropped, and so is setProp on an iframe', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const frame = mount<HTMLIFrameElement>(html`<iframe :src=${BLOB}></iframe>`);
        expect(frame.getAttribute('src')).toBeNull();

        const other = document.createElement('iframe');
        setProp(other, 'src', BLOB);
        expect(other.hasAttribute('src')).toBe(false);
    });
});

describe('a dropped URL says so in dev', () => {
    it('warns once per element and attribute, naming the scheme', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const url = signal('javascript:alert(1)');
        mount(html`<a :href=${() => url()}>x</a>`);
        url.set('vbscript:msgbox(1)');
        url.set('javascript:alert(2)');

        const dropped = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('href'));
        expect(dropped, 'one warning for this <a href>, however many bad values it receives').toHaveLength(1);
        expect(dropped[0]).toContain('javascript:');
        expect(dropped[0]).toContain('<a>');
    });

    it('a second element warns again, and setProp warns too', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mount(html`<a :href=${'javascript:alert(1)'}>x</a>`);
        const img = document.createElement('img');
        setProp(img, 'src', SVG);

        const messages = warn.mock.calls.map(c => String(c[0]));
        expect(messages.filter(m => m.includes('href'))).toHaveLength(1);
        expect(messages.filter(m => m.includes('src') && m.includes('data:'))).toHaveLength(1);
    });

    it('a kept URL warns nothing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mount(html`<a :href=${'/users/1'}>x</a>`);
        const img = document.createElement('img');
        setProp(img, 'src', BLOB);
        expect(warn).not.toHaveBeenCalled();
    });
});
