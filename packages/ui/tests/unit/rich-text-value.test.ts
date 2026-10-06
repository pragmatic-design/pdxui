// pdx-rich-text keeps the value contract every other input keeps: the value goes in through
// `value`, comes out through `value`, and a round trip preserves it. Five ways it can break:
//   1. output="html" must load an HTML `value`, not send the string to JSON.parse;
//   2. `value` is reflected: after an edit, el.value follows;
//   3. `pdx-ready` fires AFTER the API is attached — before it, in Chrome `el.setHTML` is the native
//      Element.prototype.setHTML (Sanitizer API), which replaces the host's children and empties it;
//   4. setHTML(getHTML()) must not double a mark (<strong><strong>…) by resolving marks twice on parse;
//   5. `label` is declared, so the editing area takes its name rather than "Rich text editor".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';

type RichText = HTMLElement & {
    value: unknown;
    getHTML(): string;
    setHTML(html: string): void;
    getJSON(): unknown;
    setJSON(json: unknown): void;
};

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

const strongCount = (html: string) => (html.match(/<strong>/g) ?? []).length;

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-rich-text value contract', () => {
    it('output="html" loads an HTML value', async () => {
        const el = await make(e => { e.setAttribute('output', 'html'); e.value = '<p>a <strong>b</strong></p>'; });
        expect(el.getHTML()).toContain('<strong>b</strong>');
        expect(strongCount(el.getHTML())).toBe(1);
    });

    it('the control: a JSON value still loads', async () => {
        const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'json' }] }] };
        const el = await make(e => { e.value = doc; });
        expect(el.getHTML()).toContain('json');
    });

    it('setHTML(getHTML()) is stable: marks do not double', async () => {
        const el = await make();
        el.setHTML('<p>x <strong>urgente</strong> <em>y</em></p>');
        for (let i = 0; i < 3; i++) el.setHTML(el.getHTML());
        expect(strongCount(el.getHTML()), el.getHTML()).toBe(1);
        expect((el.getHTML().match(/<em>/g) ?? []).length).toBe(1);
    });

    it('value is reflected after every change, equal to the pdx-change detail', async () => {
        const el = await make(e => e.setAttribute('output', 'html'));
        let last: unknown;
        el.addEventListener('pdx-change', (e) => { last = (e as CustomEvent).detail.html; });
        el.setHTML('<p>scritto</p>');
        expect(last).toContain('scritto');
        expect(el.value).toBe(last);
    });

    it('a value set from outside after mount replaces the content without rebuilding the editor', async () => {
        const el = await make(e => e.setAttribute('output', 'html'));
        el.value = '<p>dopo</p>';
        await new Promise(r => requestAnimationFrame(r));
        expect(el.getHTML()).toContain('dopo');
        expect(el.querySelectorAll('.pdx-rt-wrapper').length).toBe(1);
    });

    it('a configuration change rebuilds ONE editor, keeping the content', async () => {
        const el = await make(e => e.setAttribute('output', 'html'));
        el.setHTML('<p>tenuto</p>');
        el.setAttribute('placeholder', 'Scrivi…');
        await new Promise(r => requestAnimationFrame(r));
        await built(el);
        expect(el.querySelectorAll('.pdx-rt-wrapper').length).toBe(1);
        expect(el.getHTML()).toContain('tenuto');
    });

    it('label names the editing area', async () => {
        const el = await make(e => e.setAttribute('label', 'Referto'));
        expect(el.querySelector('.pdx-rt-content')?.getAttribute('aria-label')).toBe('Referto');
    });

    describe('pdx-ready with a native Element.prototype.setHTML (Chrome Sanitizer API)', () => {
        const proto = Element.prototype as unknown as { setHTML?: (html: string) => void };
        const had = 'setHTML' in proto;
        const original = proto.setHTML;
        beforeEach(() => {
            // What Chrome ships: setHTML replaces the element's children with the parsed markup.
            proto.setHTML = function (this: Element, html: string) { this.innerHTML = html; };
        });
        afterEach(() => {
            if (had) proto.setHTML = original; else delete proto.setHTML;
        });

        it('calling el.setHTML from a pdx-ready listener sets the content and keeps the editor', async () => {
            const el = document.createElement('pdx-rich-text') as RichText;
            el.addEventListener('pdx-ready', () => el.setHTML('<p>dal ready</p>'));
            document.body.appendChild(el);
            await built(el);
            expect(el.querySelector('.pdx-rt-wrapper'), 'the host was emptied').not.toBeNull();
            expect(el.getHTML()).toContain('dal ready');
        });
    });
});
