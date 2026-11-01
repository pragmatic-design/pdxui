// The third batch of #291 on the beta contract: pdx-avatar and pdx-spinner. Each drew its size, shape
// and variant with an inline style built from its props; those are `@variant` axes now, reflected on the
// host and drawn by the component's own stylesheet, at the same sizes. The avatar's failed image is a
// custom state; the pieces they draw are named parts; the spinner's status names what is loading (A4) and
// no longer writes a keyframe into the document's head. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait two frames for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '360px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

/** The element's own parts: not those of a component nested in it. */
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => {
    const owner = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && !p.tagName.includes('-')) p = p.parentElement;
        return p;
    };
    return [...new Set([...h.querySelectorAll('[data-part]')].filter((e) => owner(e) === h).map((e) => e.getAttribute('data-part')))].sort();
});

/** What the element's subtree still writes inline, other than custom properties. */
const inlineStyles = (page: Page, sel: string) => page.locator(sel).evaluate((h) =>
    [...h.querySelectorAll('[style]')].flatMap((e) => [...(e as HTMLElement).style].filter((p) => !p.startsWith('--'))));

const DOT = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="teal"/></svg>');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=display-c-beta-contract'); });

test('pdx-avatar: size and shape are reflected variants, drawn at the same sizes, with no inline style', async ({ page }) => {
    await mount(page, '<pdx-avatar id="a" alt="Ada Lovelace"></pdx-avatar><pdx-avatar id="b" alt="Bo" size="xl" shape="square"></pdx-avatar><pdx-avatar id="c" alt="Cy" size="xs"></pdx-avatar>');
    await expect(page.locator('#f [data-part="root"]')).toHaveCount(3);
    const box = (id: string) => page.locator(`#${id}`).evaluate((h) => {
        const r = h.querySelector('[data-part="root"]') as HTMLElement;
        const cs = getComputedStyle(r);
        return {
            size: h.getAttribute('size'), shape: h.getAttribute('shape'),
            w: r.getBoundingClientRect().width, h: r.getBoundingClientRect().height,
            font: cs.fontSize, round: cs.borderTopLeftRadius,
        };
    });
    expect(await box('a')).toEqual({ size: 'md', shape: 'circle', w: 40, h: 40, font: '15.2px', round: '50%' });
    const b = await box('b');
    expect({ size: b.size, shape: b.shape, w: b.w, h: b.h, font: b.font }).toEqual({ size: 'xl', shape: 'square', w: 64, h: 64, font: '24.32px' });
    expect(b.round, 'a square avatar is not a circle').not.toBe('50%');
    expect(await box('c')).toMatchObject({ w: 24, h: 24 });
    expect(await inlineStyles(page, '#f'), 'only the colour, as custom properties, is left inline').toEqual([]);
    expect(await parts(page, '#a')).toEqual(['fallback', 'root']);
});

test('pdx-avatar: a failed image is the broken state and falls back to the initials', async ({ page }) => {
    await mount(page, `<pdx-avatar id="ok" alt="Ada Lovelace" src="${DOT}"></pdx-avatar><pdx-avatar id="bad" alt="Ada Lovelace" src="/no-such-avatar.png"></pdx-avatar>`);
    await expect(page.locator('#ok [data-part="image"]')).toHaveCount(1);
    await expect.poll(() => page.locator('#bad').evaluate((h) => h.matches(':state(broken)'))).toBe(true);
    await expect(page.locator('#bad [data-part="fallback"]')).toHaveText('AL');
    expect(await page.locator('#ok').evaluate((h) => h.matches(':state(broken)'))).toBe(false);
    const img = await page.locator('#ok [data-part="image"]').evaluate((i) => {
        const cs = getComputedStyle(i);
        return { fit: cs.objectFit, w: i.getBoundingClientRect().width };
    });
    expect(img).toEqual({ fit: 'cover', w: 40 });

    // A new source after a failure is tried: the old failure does not keep the initials up.
    await page.locator('#bad').evaluate((h, src) => { (h as unknown as { src: string }).src = src; }, DOT);
    await expect(page.locator('#bad [data-part="image"]'), 'a new source is shown').toHaveCount(1);
    expect(await page.locator('#bad').evaluate((h) => h.matches(':state(broken)'))).toBe(false);
});

test('pdx-spinner: size is a reflected variant, each kind drawn at the same size, with no inline style', async ({ page }) => {
    await mount(page, `<pdx-spinner id="a"></pdx-spinner><pdx-spinner id="b" size="xl"></pdx-spinner>
        <pdx-spinner id="c" variant="bar"></pdx-spinner><pdx-spinner id="d" variant="dots"></pdx-spinner>`);
    await expect(page.locator('#f [data-part="indicator"]')).toHaveCount(4);
    const ind = (id: string) => page.locator(`#${id} [data-part="indicator"]`).evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
    });
    expect(await page.locator('#a').evaluate((h) => h.getAttribute('size'))).toBe('md');
    expect(await ind('a')).toEqual({ w: 24, h: 24 });
    expect(await ind('b')).toEqual({ w: 48, h: 48 });
    // Its laid-out size, not its bounding box: the ring rotates, and a rotated box is wider.
    expect(await page.locator('#a svg').evaluate((s) => {
        const cs = getComputedStyle(s);
        return { spin: cs.animationName, w: cs.width, h: cs.height };
    })).toEqual({ spin: 'pdx-spin', w: '24px', h: '24px' });
    expect(await page.locator('#c .pdx-progress').evaluate((p) => p.getBoundingClientRect().width)).toBe(24);
    await expect(page.locator('#d .pdx-dot')).toHaveCount(3);
    const dots = await page.locator('#d .pdx-dot').evaluateAll((d) => d.map((e) => e.getBoundingClientRect()).map((r, i, a) =>
        ({ top: r.top === a[0].top, gap: i ? Math.round(r.left - a[i - 1].right) : 0 })));
    expect(dots, 'three dots in a row, 3px apart').toEqual([{ top: true, gap: 0 }, { top: true, gap: 3 }, { top: true, gap: 3 }]);
    expect(await inlineStyles(page, '#f')).toEqual([]);
    expect(await page.evaluate(() => document.getElementById('pdx-spin-kf')), 'no keyframe written into the head').toBeNull();
});

test('pdx-spinner: its status names what is loading (A4), and its label is a part', async ({ page }) => {
    await mount(page, '<pdx-spinner id="a"></pdx-spinner><pdx-spinner id="b" label="Saving" show-label></pdx-spinner>');
    await expect(page.locator('#f [data-part="indicator"]')).toHaveCount(2);
    const names = await page.locator('#f').getByRole('status').evaluateAll((s) => s.map((e) => e.getAttribute('aria-label')));
    expect(names).toEqual(['Loading', 'Saving']);
    await expect(page.locator('#b [data-part="label"]')).toHaveText('Saving');
    const label = await page.locator('#b [data-part="label"]').evaluate((l) => getComputedStyle(l).fontSize);
    expect(parseFloat(label), 'the label keeps its small type').toBeLessThan(14);
    expect(await parts(page, '#a')).toEqual(['indicator', 'root']);
    expect(await parts(page, '#b')).toEqual(['indicator', 'label', 'root']);
});
