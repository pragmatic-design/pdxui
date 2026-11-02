// pdx-icon drawn at a size given in pixels. Its `size` took a name only (xs 12, sm 16, md 20, lg 24, xl 32),
// and any number fell back to 20px: `<pdx-icon size="48">` was a 20px icon. The library passes numbers in a
// dozen places — pdx-empty-state 48, pdx-image's fallback 32, pdx-statistic 20/24/32, pdx-fab 18/24/28,
// pdx-split-button 14/16, pdx-description-list 14/16/18, pdx-command and pdx-bulk-actions 15, pdx-entity-grid
// 16 — and each was drawn at 20. A number is now that many pixels. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

/** The drawn box of an icon: its container, which the SVG fills. */
const box = (page: Page, sel: string) => page.locator(`${sel} > *`).first().evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=icon-pixel-size'); });

test('pdx-icon: a named size and a size in pixels are each drawn at their size', async ({ page }) => {
    await mount(page, '<pdx-icon id="n" name="check" size="lg"></pdx-icon><pdx-icon id="p" name="check" size="48"></pdx-icon><pdx-icon id="d" name="check"></pdx-icon><pdx-icon id="s" name="check" size="15"></pdx-icon>');
    await expect(page.locator('#f svg')).toHaveCount(4);
    expect(await box(page, '#d'), 'the default is md').toEqual({ w: 20, h: 20 });
    expect(await box(page, '#n'), 'lg').toEqual({ w: 24, h: 24 });
    expect(await box(page, '#p'), 'a size in pixels, as pdx-empty-state passes').toEqual({ w: 48, h: 48 });
    expect(await box(page, '#s'), 'a size in pixels, as pdx-command passes').toEqual({ w: 15, h: 15 });
});

test('pdx-icon: what is neither a name nor a positive number is drawn at md', async ({ page }) => {
    await mount(page, '<pdx-icon id="x" name="check" size="huge"></pdx-icon><pdx-icon id="z" name="check" size="0"></pdx-icon>');
    await expect(page.locator('#f svg')).toHaveCount(2);
    expect(await box(page, '#x')).toEqual({ w: 20, h: 20 });
    expect(await box(page, '#z')).toEqual({ w: 20, h: 20 });
});

test('pdx-empty-state draws its icon at the size it asks for', async ({ page }) => {
    await mount(page, '<pdx-empty-state title="Nothing yet"></pdx-empty-state>');
    await expect(page.locator('#f pdx-empty-state svg')).toHaveCount(1);
    expect(await box(page, '#f pdx-empty-state pdx-icon')).toEqual({ w: 48, h: 48 });
});
