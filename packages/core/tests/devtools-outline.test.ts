// `__PDX_DEVTOOLS__.outline()` (#271): the rules of docs/language/beta/agents.md, one test each.
// Only DATA repetition is summarised — the rows the runtime marks — and a run of controls sharing a
// role is kept whole: the prototype's role-based rule hid toolbar buttons until it was narrowed.

import { describe, it, expect, afterEach } from 'vitest';
import { outlineOf, selectorOf } from '../src/debug/outline';
import { eachRow } from '../src/renderer/helpers';

const roots: HTMLElement[] = [];
afterEach(() => { for (const r of roots.splice(0)) r.remove(); });

function page(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    roots.push(root);
    return root;
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => `<li data-pdx-item><a href="/c/${i}">Customer ${i}</a></li>`).join('');

describe('the outline rules', () => {
    it('data repetition above maxItems: two samples, then the count line with the next refs', () => {
        const out = outlineOf(page(`<ul data-test="list">${rows(8)}</ul>`), { maxItems: 5 });
        expect(out).toContain('link "Customer 0"');
        expect(out).toContain('link "Customer 1"');
        expect(out).not.toContain('Customer 2"');
        expect(out).toMatch(/- … 6 more listitem \[.+\]/);
    });

    it('the control: a repetition at or under maxItems is listed whole', () => {
        const out = outlineOf(page(`<ul>${rows(5)}</ul>`), { maxItems: 5 });
        for (let i = 0; i < 5; i++) expect(out).toContain(`"Customer ${i}"`);
        expect(out).not.toContain('more');
    });

    it('a toolbar is not data: every button kept, on one line', () => {
        const buttons = ['Bold', 'Italic', 'Underline', 'Strike', 'Code', 'Link', 'Quote'].map((b) => `<button>${b}</button>`).join('');
        const out = outlineOf(page(`<div role="toolbar" aria-label="Format">${buttons}</div>`), { maxItems: 2 });
        expect(out).toContain('toolbar "Format"');
        expect(out).toMatch(/button ×7: "Bold" \[.+\], "Italic"/);
        for (const b of ['Bold', 'Italic', 'Underline', 'Strike', 'Code', 'Link', 'Quote']) expect(out).toContain(`"${b}"`);
        expect(out).not.toContain('more');
    });

    it('unnamed wrappers are dropped: the button rises to their place', () => {
        const out = outlineOf(page('<div><div><section><button>Save</button></section></div></div>'));
        expect(out.split('\n')).toEqual([expect.stringMatching(/^- button "Save" \[/)]);
    });

    it('text that repeats its parent\'s name is dropped; other text is kept', () => {
        const out = outlineOf(page('<h2>Customers</h2><p>12 accounts</p>'));
        expect(out).toBe('- heading "Customers"\n- text "12 accounts"');
    });

    it('visibility is read from the DOM: hidden, aria-hidden and display:none are left out', () => {
        const out = outlineOf(page('<button hidden>A</button><button aria-hidden="true">B</button><button style="display:none">C</button><button>D</button>'));
        expect(out).toMatch(/^- button "D"/);
        expect(out).not.toMatch(/"A"|"B"|"C"/);
    });

    it('an unnamed image is dropped, a named one kept', () => {
        const out = outlineOf(page('<img src="x.png" alt=""><img src="y.png" alt="Logo">'));
        expect(out).toBe('- img "Logo"');
    });
});

describe('the runtime marks data repetition', () => {
    it('each row an @for renders carries data-pdx-item in development; the list around it does not', () => {
        const list = document.createElement('ul');
        list.appendChild(eachRow(() => [{ id: 1 }, { id: 2 }], 'id', (item) => {
            const li = document.createElement('li');
            li.textContent = String(item().id);
            return li;
        }));
        const root = page('');
        root.appendChild(list);
        expect(Array.from(list.querySelectorAll('li')).map((li) => li.hasAttribute('data-pdx-item'))).toEqual([true, true]);
        expect(list.hasAttribute('data-pdx-item')).toBe(false);
    });
});

describe('addressing', () => {
    it('a unique data-test is the selector', () => {
        const root = page('<button data-test="save">Save</button>');
        expect(selectorOf(root.querySelector('button')!)).toBe('[data-test="save"]');
    });

    it('otherwise a path from the nearest anchor, which finds the same element again', () => {
        const root = page('<div data-test="pager"><button>1</button><button>2</button></div>');
        const second = root.querySelectorAll('button')[1];
        const sel = selectorOf(second);
        expect(sel).toBe('[data-test="pager"] button:nth-of-type(2)');
        expect(document.querySelector(sel)).toBe(second);
    });
});
