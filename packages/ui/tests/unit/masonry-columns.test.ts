// pdx-masonry: the value the documentation gives is the value the code believes.
//
// The prop's JSDoc says "or 'auto'". Declared `Number`, `columns="auto"` coerces to NaN,
// `NaN <= 0` is false so the responsive branch is skipped, and `String(NaN)` — "NaN" — reaches
// `style.columnCount`, where the browser drops an invalid value and lays everything out in one
// column. Every step is silent: no warning, no error, and a manifest that reports `columns:number`
// beside prose promising a word.
//
// With thirty photos that is a gallery 24,883px tall, one column, on a page that expects three.
//
// happy-dom gives the host a clientWidth of 0, so the auto branch resolves to its floor of 1 column
// here — this file cannot tell "auto" from "one column", and does not try. What it pins is what
// REACHES the style: never NaN, never a word, always a positive integer. The rendered count is the
// manifest's rule (masonry-auto), measured in a browser at a real width.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, tick } from './helpers';
import '../../src/masonry/pdx-masonry';

async function masonry(attrs: string): Promise<HTMLElement> {
    const el = document.createElement('pdx-masonry');
    for (const pair of attrs.split(' ').filter(Boolean)) {
        const [name, value] = pair.split('=');
        el.setAttribute(name, value.replace(/"/g, ''));
    }
    el.innerHTML = '<div>a</div><div>b</div><div>c</div><div>d</div>';
    document.body.appendChild(el);
    await tick(20);
    return el;
}

/** The inline column-count, as a number. NaN when the style carries something that is not one. */
const columnCount = (el: HTMLElement) => Number(el.style.columnCount);

describe('pdx-masonry resolves its columns prop', () => {
    beforeEach(cleanup);

    it('a fixed number is the number asked for', async () => {
        expect(columnCount(await masonry('columns="4"'))).toBe(4);
    });

    it('the default, with no attribute at all, is three', async () => {
        expect(columnCount(await masonry(''))).toBe(3);
    });

    it('"auto" — the value the documentation gives — never reaches the style as NaN', async () => {
        const el = await masonry('columns="auto"');
        expect(el.style.columnCount, 'style.columnCount carries a value the browser cannot use').not.toBe('NaN');
        expect(columnCount(el), 'auto did not resolve to a usable column count').toBeGreaterThanOrEqual(1);
    });

    it('0 and negatives keep meaning responsive, as the code always read them', async () => {
        expect(columnCount(await masonry('columns="0"'))).toBeGreaterThanOrEqual(1);
        expect(columnCount(await masonry('columns="-1"'))).toBeGreaterThanOrEqual(1);
    });

    it('a value that is neither a number nor "auto" still leaves a usable count', async () => {
        // No app should write this, but writing it must not produce a one-column page with no
        // message — the failure this file is about.
        const el = await masonry('columns="three"');
        expect(el.style.columnCount).not.toBe('NaN');
        expect(columnCount(el)).toBeGreaterThanOrEqual(1);
    });

    it('the catalogue says what the code believes', () => {
        // The other half: a manifest that reports `columns:number` beside prose that promises a
        // word leaves an agent reading the catalogue no way to know which one is true.
        // `@type number | 'auto'` on the prop is what the manifest publishes.
        const manifest = JSON.parse(
            readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf-8'),
        ) as { modules: { declarations?: { tagName?: string; members?: { name: string; type?: { text: string } }[] }[] }[] };
        const columns = manifest.modules
            .flatMap(m => m.declarations ?? [])
            .find(d => d.tagName === 'pdx-masonry')
            ?.members?.find(m => m.name === 'columns');
        expect(columns, 'pdx-masonry.columns is missing from the manifest').toBeDefined();
        expect(columns!.type?.text, 'the catalogue does not admit the documented value').toBe("number | 'auto'");
    });

    it('a number set as a property, not an attribute, is still a number', async () => {
        // `:columns="3"` assigns the property. A String-typed prop passes a non-string through
        // untouched, so the resolver sees the number 3, not "3".
        const el = document.createElement('pdx-masonry');
        (el as unknown as { columns: number }).columns = 5;
        el.innerHTML = '<div>a</div>';
        document.body.appendChild(el);
        await tick(20);
        expect(columnCount(el)).toBe(5);
    });
});
