// A field whose control is a group (#286): pdx-otp-input's cells are a `role="group"`, and
// pdx-radio-group is a `role="radiogroup"`. pdx-form-field used to wire a group's name and nothing
// else, so the A-rules did not reach it:
//   - A1, required. `aria-required` is not allowed on a `group` (axe's aria-allowed-attr), so it goes
//     on each text box in the group. A radiogroup takes it itself, as before.
//   - A2, in error. A radiogroup takes `aria-invalid` itself. A group's text boxes take it, since a
//     group may not carry it either. The group is described by the message: `aria-describedby` is
//     global.
// pdx-otp-input on the beta contract: its states are custom states, its container carries no state
// class, and its own `error` marks its cells aria-invalid.
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

/** Each OTP cell's aria-invalid and aria-required. */
async function cells(page: Page): Promise<{ invalid: string | null; required: string | null }[]> {
    return page.locator('#f pdx-otp-input [data-part="cell"]').evaluateAll((els) =>
        els.map((e) => ({ invalid: e.getAttribute('aria-invalid'), required: e.getAttribute('aria-required') })));
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

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=group-fields-beta-contract'); });

test.describe('pdx-otp-input', () => {
    test('error is :state(invalid), its cells are aria-invalid, and its container has no state class', async ({ page }) => {
        await mount(page, '<pdx-otp-input length="4" error></pdx-otp-input>');
        const host = page.locator('#f pdx-otp-input');
        expect(await host.evaluate((h) => h.matches(':state(invalid)'))).toBe(true);
        await expect.poll(() => cells(page)).toEqual(Array(4).fill({ invalid: 'true', required: null }));
        const classes = await page.locator('#f pdx-otp-input [data-part="root"]').evaluate((e) => [...e.classList]);
        expect(classes).not.toContain('error');
        await host.evaluate((el) => el.removeAttribute('error'));
        await expect.poll(() => cells(page)).toEqual(Array(4).fill({ invalid: null, required: null }));
        expect(await host.evaluate((h) => h.matches(':state(invalid)'))).toBe(false);
    });

    test('disabled is :state(disabled), and its container has no state class', async ({ page }) => {
        await mount(page, '<pdx-otp-input length="4" disabled></pdx-otp-input>');
        expect(await page.locator('#f pdx-otp-input').evaluate((h) => h.matches(':state(disabled)'))).toBe(true);
        const classes = await page.locator('#f pdx-otp-input [data-part="root"]').evaluate((e) => [...e.classList]);
        expect(classes).not.toContain('disabled');
    });

    test('its parts: the root, one cell per digit, and the separators', async ({ page }) => {
        await mount(page, '<pdx-otp-input length="6" separator="3"></pdx-otp-input>');
        await expect(page.locator('#f pdx-otp-input [data-part="cell"]')).toHaveCount(6);
        await expect(page.locator('#f pdx-otp-input [data-part="separator"]')).toHaveCount(1);
        await expect(page.locator('#f pdx-otp-input [data-part="root"]')).toHaveCount(1);
    });

    test('the design CSS draws its error from :state(invalid): the cells take the danger colour', async ({ page }) => {
        await mount(page, `
            <pdx-otp-input data-k="plain" length="4"></pdx-otp-input>
            <pdx-otp-input data-k="error" length="4" error></pdx-otp-input>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>`);
        await expect(page.locator('#f [data-k="error"] [data-part="cell"]')).toHaveCount(4);
        const c = await page.evaluate(() => {
            const cell = (k: string) => getComputedStyle(document.querySelector(`#f [data-k="${k}"] [data-part="cell"]`)!).borderTopColor;
            return { plain: cell('plain'), error: cell('error'), danger: getComputedStyle(document.querySelector('#f [data-k="danger"]')!).color };
        });
        expect(c.error).toBe(c.danger);
        expect(c.plain).not.toBe(c.danger);
    });

    test('A1 — inside a required pdx-form-field each cell is aria-required, and axe allows it', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Code" required><pdx-otp-input length="4"></pdx-otp-input></pdx-form-field>');
        await expect.poll(() => cells(page)).toEqual(Array(4).fill({ invalid: null, required: 'true' }));
        expect(await axe(page)).toEqual([]);
    });

    test('A1 control — outside a required field no cell is', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Code"><pdx-otp-input length="4"></pdx-otp-input></pdx-form-field>');
        await expect.poll(() => cells(page)).toEqual(Array(4).fill({ invalid: null, required: null }));
    });

    test('A2 — inside a pdx-form-field in error each cell is aria-invalid, the group is described by the message, and axe allows it', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Code" error="Wrong code" show-error><pdx-otp-input length="4"></pdx-otp-input></pdx-form-field>');
        await expect.poll(() => cells(page)).toEqual(Array(4).fill({ invalid: 'true', required: null }));
        await expect(page.getByRole('group', { name: 'Code' })).toHaveAccessibleDescription('Wrong code');
        expect(await axe(page)).toEqual([]);
    });
});

test.describe('pdx-radio-group, a radiogroup', () => {
    test('A2 — inside a pdx-form-field in error the radiogroup is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, `
            <pdx-form-field label="Size" error="Pick a size" show-error>
                <pdx-radio-group><pdx-radio value="s">Small</pdx-radio><pdx-radio value="l">Large</pdx-radio></pdx-radio-group>
            </pdx-form-field>`);
        const group = page.getByRole('radiogroup', { name: 'Size' });
        await expect(group).toHaveAttribute('aria-invalid', 'true');
        await expect(group).toHaveAccessibleDescription('Pick a size');
        expect(await axe(page)).toEqual([]);
    });

    test('A2 control — when the error goes, so do aria-invalid and the description', async ({ page }) => {
        await mount(page, `
            <pdx-form-field label="Size" error="Pick a size" show-error>
                <pdx-radio-group><pdx-radio value="s">Small</pdx-radio><pdx-radio value="l">Large</pdx-radio></pdx-radio-group>
            </pdx-form-field>`);
        const group = page.getByRole('radiogroup', { name: 'Size' });
        await expect(group).toHaveAttribute('aria-invalid', 'true');
        await page.locator('#f pdx-form-field').evaluate((el) => el.removeAttribute('show-error'));
        await expect(group).not.toHaveAttribute('aria-invalid', /.*/);
        await expect(group).toHaveAccessibleDescription('');
    });
});
