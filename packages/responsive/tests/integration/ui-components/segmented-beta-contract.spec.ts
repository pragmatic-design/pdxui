// pdx-segmented on the beta contract (#286): `disabled` is a custom state on the host, its frame and
// its segments are parts, `orientation` is a variant axis reflected on the host (no
// `pdx-segmented-vertical` class), a form submits and resets it, the keyboard reaches it with no value
// chosen, and the A-rules hold in a browser. Its radiogroup is the inner frame, which takes
// aria-required and aria-invalid in a field, as pdx-radio-group's does.
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
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** axe's violations inside #f, with the axe runner's tags. */
async function axe(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze();
    return results.violations.map((v) => `${v.id} (${v.nodes.length})`);
}

const OPTS = `options='["Day","Week","Month"]'`;

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=segmented-beta-contract'); });

test('disabled is a custom state on the host', async ({ page }) => {
    await mount(page, `<pdx-segmented data-k="on" label="View" ${OPTS} disabled></pdx-segmented><pdx-segmented data-k="off" label="View" ${OPTS}></pdx-segmented>`);
    const state = (k: string) => page.locator(`#f [data-k="${k}"]`).evaluate((h) => h.matches(':state(disabled)'));
    expect(await state('on')).toBe(true);
    expect(await state('off')).toBe(false);
});

test('its frame is the root part and each segment an item part', async ({ page }) => {
    await mount(page, `<pdx-segmented label="View" ${OPTS} value="Week"></pdx-segmented>`);
    await expect(page.locator('#f [data-part="root"]')).toHaveAttribute('role', 'radiogroup');
    expect(await page.locator('#f [data-part="item"]').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['radio', 'radio', 'radio']);
});

test('orientation is reflected on the host with no class, and the design CSS stacks a vertical one', async ({ page }) => {
    await mount(page, `<pdx-segmented data-k="h" label="H" ${OPTS}></pdx-segmented><pdx-segmented data-k="v" label="V" ${OPTS} orientation="vertical"></pdx-segmented>`);
    await expect(page.locator('#f [data-k="h"]')).toHaveAttribute('orientation', 'horizontal');
    await expect(page.locator('#f [data-k="v"]')).toHaveAttribute('orientation', 'vertical');
    await expect(page.locator('#f [data-k="v"] [data-part="root"]')).toHaveAttribute('aria-orientation', 'vertical');
    expect(await page.locator('#f .pdx-segmented-vertical').count()).toBe(0);
    const rects = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="item"]`).evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top };
    }));
    const [h1, h2] = await rects('h');
    expect(Math.abs(h2.top - h1.top)).toBeLessThanOrEqual(1);
    expect(h2.left).toBeGreaterThan(h1.left);
    const [v1, v2] = await rects('v');
    expect(Math.abs(v2.left - v1.left)).toBeLessThanOrEqual(1);
    expect(v2.top).toBeGreaterThan(v1.top);
});

test('with no value chosen, Tab reaches the first enabled segment, and an arrow chooses', async ({ page }) => {
    await mount(page, `<button id="before">before</button><pdx-segmented label="View" options='[{"label":"Day","value":"day","disabled":true},{"label":"Week","value":"week"},{"label":"Month","value":"month"}]'></pdx-segmented>`);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Week' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Month' })).toBeFocused();
    await expect(page.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
});

test('a form submits its choice under its name, nothing with none, and resets it', async ({ page }) => {
    await mount(page, `<form><pdx-segmented name="view" label="View" ${OPTS} value="Day"></pdx-segmented></form>`);
    const entries = () => page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
    await expect.poll(entries).toEqual(['view=Day']);
    await page.getByRole('radio', { name: 'Month' }).click();
    await expect.poll(entries).toEqual(['view=Month']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(entries).toEqual(['view=Day']);
});

test('A1 — in a required pdx-form-field the radiogroup is aria-required, and axe allows it', async ({ page }) => {
    await mount(page, `<pdx-form-field label="View" required><pdx-segmented ${OPTS}></pdx-segmented></pdx-form-field>`);
    const group = page.getByRole('radiogroup', { name: /View/ });
    await expect(group).toHaveAttribute('aria-required', 'true');
    expect(await axe(page)).toEqual([]);
});

test('A2 — in a pdx-form-field in error the radiogroup is aria-invalid and described by the message', async ({ page }) => {
    await mount(page, `<pdx-form-field label="View" error="Pick one" show-error><pdx-segmented ${OPTS}></pdx-segmented></pdx-form-field>`);
    const group = page.getByRole('radiogroup', { name: 'View' });
    await expect(group).toHaveAttribute('aria-invalid', 'true');
    await expect(group).toHaveAccessibleDescription('Pick one');
    expect(await axe(page)).toEqual([]);
});
