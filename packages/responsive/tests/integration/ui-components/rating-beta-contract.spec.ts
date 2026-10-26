// pdx-rating on the beta contract (#286): `disabled`, `readonly` and `focused` are custom states on
// the host, its frame and its stars are parts, a form submits and resets it, and the A-rules hold in a
// browser. Its frame is a `slider`, which may not carry aria-required (axe's aria-allowed-attr): the
// label's marker says the field is required; it takes aria-invalid and the error as its description.
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

const statesOf = (page: Page, sel: string, names: string[]) =>
    page.locator(`#f ${sel}`).first().evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), names);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=rating-beta-contract'); });

test('disabled and readonly are custom states on the host, and the frame carries no state class', async ({ page }) => {
    await mount(page, '<pdx-rating data-k="dis" label="Score" disabled></pdx-rating><pdx-rating data-k="ro" label="Score" readonly></pdx-rating><pdx-rating data-k="off" label="Score"></pdx-rating>');
    expect(await statesOf(page, '[data-k="dis"]', ['disabled', 'readonly'])).toEqual(['disabled']);
    expect(await statesOf(page, '[data-k="ro"]', ['disabled', 'readonly'])).toEqual(['readonly']);
    expect(await statesOf(page, '[data-k="off"]', ['disabled', 'readonly'])).toEqual([]);
    const classes = await page.locator('#f [data-part="root"]').evaluateAll((els) => els.flatMap((e) => [...e.classList]));
    expect(classes.filter((c) => /disabled|readonly|focused/.test(c))).toEqual([]);
});

test('focused is a custom state while the slider has focus', async ({ page }) => {
    await mount(page, '<pdx-rating label="Score"></pdx-rating>');
    await page.getByRole('slider', { name: 'Score' }).focus();
    await expect.poll(() => statesOf(page, 'pdx-rating', ['focused'])).toEqual(['focused']);
    await page.getByRole('slider', { name: 'Score' }).blur();
    await expect.poll(() => statesOf(page, 'pdx-rating', ['focused'])).toEqual([]);
});

test('its frame is the root part and each star a star part', async ({ page }) => {
    await mount(page, '<pdx-rating label="Score" count="4" value="2"></pdx-rating>');
    await expect(page.locator('#f [data-part="root"]')).toHaveAttribute('role', 'slider');
    expect(await page.locator('#f [data-part="star"]').count()).toBe(4);
});

test('the design CSS draws the states: disabled dimmed, readonly with no pointer cursor', async ({ page }) => {
    await mount(page, '<pdx-rating data-k="dis" label="A" disabled></pdx-rating><pdx-rating data-k="ro" label="B" readonly></pdx-rating><pdx-rating data-k="on" label="C"></pdx-rating>');
    const style = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => {
        const s = getComputedStyle(e);
        return { opacity: Number(s.opacity), cursor: s.cursor };
    });
    expect((await style('dis')).opacity).toBeLessThan(1);
    expect((await style('ro')).cursor).toBe('default');
    expect((await style('on')).opacity).toBe(1);
});

test('a form submits its value under its name, and resets it', async ({ page }) => {
    await mount(page, '<form><pdx-rating name="score" label="Score" value="3"></pdx-rating></form>');
    const entries = () => page.evaluate(() => [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));
    await expect.poll(entries).toEqual(['score=3']);
    await page.getByRole('slider', { name: 'Score' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(entries).toEqual(['score=4']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(entries).toEqual(['score=3']);
});

test('A1 — in a required pdx-form-field the slider is named by the label, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Score" required><pdx-rating></pdx-rating></pdx-form-field>');
    const slider = page.locator('#f pdx-rating [data-part="root"]');
    await expect(slider).toHaveAccessibleName(/^Score/);
    await expect(slider).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — in a pdx-form-field in error the slider is aria-invalid and described by the message', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Score" error="Rate it" show-error><pdx-rating></pdx-rating></pdx-form-field>');
    const slider = page.locator('#f pdx-rating [data-part="root"]');
    await expect(slider).toHaveAttribute('aria-invalid', 'true');
    await expect(slider).toHaveAccessibleDescription('Rate it');
    expect(await axe(page)).toEqual([]);
});
