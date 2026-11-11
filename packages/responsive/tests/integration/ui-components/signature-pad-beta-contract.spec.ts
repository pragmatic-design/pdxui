// pdx-signature-pad (#1019), measured in a browser: happy-dom has no 2D context. A pointer stroke
// becomes the PNG the form submits; the strokes count only past `min-stroke`; Ctrl+Z and Delete take
// them off; a resize and a device pixel ratio of 2 redraw them sharp; the Type mode signs from the
// keyboard alone, in the face the package ships; `required` is valueMissing while empty; a value set
// from outside is shown; the exported ink is the ink token on a transparent background.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for its components to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '400px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Draw a stroke on the canvas of `sel`, through `points` given as shares of its box. */
async function stroke(page: Page, points: Array<[number, number]>, sel = '#f pdx-signature-pad'): Promise<void> {
    const box = await page.locator(`${sel} [data-part="pad"]`).boundingBox();
    if (!box) throw new Error('no canvas');
    const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
    await page.mouse.move(...at(points[0]));
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps: 8 });
    await page.mouse.up();
}

const value = (page: Page, sel = '#f pdx-signature-pad') =>
    page.locator(sel).evaluate((h) => (h as unknown as { value: string }).value);

const statesOf = (page: Page, names: string[]) =>
    page.locator('#f pdx-signature-pad').evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), names);

/** How many pixels of the canvas carry ink (alpha > 0). */
const inked = (page: Page) =>
    page.locator('#f [data-part="pad"]').evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
        return n;
    });

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=signature-pad-beta-contract'); });

test('a stroke becomes the PNG the form submits, and the field is no longer empty', async ({ page }) => {
    await mount(page, '<form><pdx-signature-pad name="sig" label="Signature"></pdx-signature-pad></form>');
    expect(await statesOf(page, ['empty'])).toEqual(['empty']);
    await expect(page.getByRole('img', { name: 'Signature, empty' })).toBeVisible();
    await stroke(page, [[0.2, 0.6], [0.5, 0.4], [0.8, 0.7]]);
    await expect.poll(() => value(page)).toMatch(/^data:image\/png;base64,/);
    expect(await statesOf(page, ['empty'])).toEqual([]);
    await expect(page.getByRole('img', { name: 'Signature, signed' })).toBeVisible();
    const submitted = await page.evaluate(() => {
        const v = new FormData(document.querySelector('#f form') as HTMLFormElement).get('sig');
        return typeof v === 'string' ? v.slice(0, 22) : v;
    });
    expect(submitted).toBe('data:image/png;base64,');
});

test('with min-stroke, a tap does not sign; a stroke past it does', async ({ page }) => {
    await mount(page, '<pdx-signature-pad min-stroke="100"></pdx-signature-pad>');
    await stroke(page, [[0.5, 0.5], [0.52, 0.5]]);
    expect(await inked(page)).toBeGreaterThan(0);
    expect(await value(page)).toBe('');
    await stroke(page, [[0.1, 0.5], [0.9, 0.5]]);
    await expect.poll(() => value(page)).toMatch(/^data:image\/png/);
});

test('Ctrl+Z takes the last stroke off, and Delete clears it and says so', async ({ page }) => {
    await mount(page, '<pdx-signature-pad label="Signature"></pdx-signature-pad>');
    await stroke(page, [[0.2, 0.5], [0.4, 0.5]]);
    await stroke(page, [[0.5, 0.5], [0.8, 0.5]]);
    const two = await value(page);
    await page.locator('#f [data-part="pad"]').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => value(page)).not.toBe(two);
    expect(await value(page)).toMatch(/^data:image\/png/);
    await page.keyboard.press('Control+z');
    await expect.poll(() => value(page)).toBe('');
    await stroke(page, [[0.2, 0.5], [0.8, 0.5]]);
    await page.locator('#f [data-part="pad"]').focus();
    await page.keyboard.press('Delete');
    await expect.poll(() => value(page)).toBe('');
    expect(await inked(page)).toBe(0);
    await expect(page.locator('#f [aria-live="polite"]')).toHaveText('Signature cleared');
});

test('the Undo and Clear buttons are disabled while there is nothing to take off', async ({ page }) => {
    await mount(page, '<pdx-signature-pad></pdx-signature-pad>');
    await expect(page.locator('#f [data-part="undoButton"]')).toBeDisabled();
    await expect(page.locator('#f [data-part="clearButton"]')).toBeDisabled();
    await stroke(page, [[0.2, 0.5], [0.8, 0.5]]);
    await expect(page.locator('#f [data-part="undoButton"]')).toBeEnabled();
    await page.locator('#f [data-part="clearButton"]').click();
    await expect.poll(() => value(page)).toBe('');
});

test('a resize redraws the strokes at the new size instead of losing them', async ({ page }) => {
    await mount(page, '<pdx-signature-pad></pdx-signature-pad>');
    const width = () => page.locator('#f [data-part="pad"]').evaluate((c) => (c as HTMLCanvasElement).width);
    await stroke(page, [[0.1, 0.5], [0.4, 0.5]]);
    const before = await width();
    expect(await inked(page)).toBeGreaterThan(0);
    await page.evaluate(() => { (document.getElementById('f') as HTMLElement).style.width = '300px'; });
    // Nothing draws after the resize but the observer: the canvas is sized to the new box, and the
    // stroke is on it.
    await expect.poll(width).toBe(before - 100);
    expect(await inked(page)).toBeGreaterThan(0);
});

test.describe('at a device pixel ratio of 2', () => {
    test.use({ deviceScaleFactor: 2 });
    test('the canvas has two device pixels per CSS pixel', async ({ page }) => {
        await mount(page, '<pdx-signature-pad></pdx-signature-pad>');
        const { css, px } = await page.locator('#f [data-part="pad"]').evaluate((c) => ({
            css: Math.round(c.getBoundingClientRect().width),
            px: (c as HTMLCanvasElement).width,
        }));
        expect(px).toBe(css * 2);
    });
});

test('the Type mode signs from the keyboard alone, in the face the package ships', async ({ page }) => {
    await mount(page, '<pdx-signature-pad label="Signature"></pdx-signature-pad>');
    await page.locator('#f [data-part="modeButton"]').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    expect(await statesOf(page, ['typing'])).toEqual(['typing']);
    await page.keyboard.press('Tab');
    await expect(page.locator('#f [data-part="nameInput"]')).toBeFocused();
    await page.keyboard.type('Ada Lovelace');
    await expect.poll(() => value(page)).toMatch(/^data:image\/png/);
    // `document.fonts.check` is true when no face of the family exists at all: what is asserted is the
    // face itself, loaded.
    expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'pdx-signature' && f.status === 'loaded'))).toBe(true);
    expect(await inked(page)).toBeGreaterThan(0);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await expect.poll(() => value(page)).toBe('');
});

test('a face that does not load leaves the fallback to draw the name, never an empty image', async ({ page }) => {
    await page.route('**/*.woff2', (r) => r.abort());
    await mount(page, '<pdx-signature-pad></pdx-signature-pad>');
    await page.locator('#f [data-part="modeButton"]').last().click();
    await page.locator('#f [data-part="nameInput"]').fill('Ada Lovelace');
    await expect.poll(() => value(page)).toMatch(/^data:image\/png/);
    expect(await inked(page)).toBeGreaterThan(0);
});

test('required: an empty signature is valueMissing, a drawn one is valid, a reset empties it', async ({ page }) => {
    await mount(page, '<form><pdx-signature-pad name="sig" required></pdx-signature-pad></form>');
    const validity = () => page.locator('#f pdx-signature-pad').evaluate((h) => (h as unknown as { validity: ValidityState }).validity.valueMissing);
    await expect.poll(validity).toBe(true);
    await stroke(page, [[0.2, 0.5], [0.8, 0.5]]);
    await expect.poll(validity).toBe(false);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(() => value(page)).toBe('');
    await expect.poll(() => inked(page)).toBe(0);
    await expect.poll(validity).toBe(true);
});

test('a value set from outside is shown', async ({ page }) => {
    await mount(page, '<pdx-signature-pad></pdx-signature-pad>');
    const url = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 200; c.height = 80;
        const ctx = c.getContext('2d')!;
        ctx.fillRect(20, 30, 160, 10);
        return c.toDataURL('image/png');
    });
    await page.locator('#f pdx-signature-pad').evaluate((h, u) => { (h as unknown as { value: string }).value = u; }, url);
    await expect.poll(() => inked(page)).toBeGreaterThan(0);
    expect(await statesOf(page, ['empty'])).toEqual([]);
    expect(await value(page)).toBe(url);
});

test('a disabled pad draws nothing', async ({ page }) => {
    await mount(page, '<pdx-signature-pad disabled></pdx-signature-pad>');
    await stroke(page, [[0.2, 0.5], [0.8, 0.5]]);
    expect(await inked(page)).toBe(0);
    expect(await value(page)).toBe('');
    expect(await statesOf(page, ['disabled'])).toEqual(['disabled']);
});

test('the exported image is the ink on a transparent background', async ({ page }) => {
    await mount(page, '<pdx-signature-pad pen-width="6"></pdx-signature-pad>');
    await stroke(page, [[0.1, 0.5], [0.9, 0.5]]);
    await expect.poll(() => value(page)).toMatch(/^data:image\/png/);
    const pixels = await page.locator('#f pdx-signature-pad').evaluate(async (h) => {
        const img = new Image();
        img.src = (h as unknown as { value: string }).value;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const corner = ctx.getImageData(0, 0, 1, 1).data;
        const mid = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
        const ink = getComputedStyle(h.querySelector('[data-part="pad"]')!).color;
        return { corner: corner[3], mid: [...mid], ink };
    });
    expect(pixels.corner).toBe(0);
    expect(pixels.mid[3]).toBe(255);
    // The ink token is dark: the stroke's centre is well under mid-grey.
    expect(pixels.mid[0] + pixels.mid[1] + pixels.mid[2]).toBeLessThan(3 * 128);
});

test('axe finds nothing in the empty, the signed and the Type states', async ({ page }) => {
    await mount(page, '<pdx-signature-pad label="Signature"></pdx-signature-pad>');
    const axe = async () => (await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
    expect(await axe()).toEqual([]);
    await stroke(page, [[0.2, 0.5], [0.8, 0.5]]);
    expect(await axe()).toEqual([]);
    await page.locator('#f [data-part="modeButton"]').last().click();
    expect(await axe()).toEqual([]);
});
