// pdx-button and pdx-button-group on the beta contract (#291). The button has no toggle mode — the
// on/off button is pdx-toggle — and its loading is `:state(loading)` on the host, aria-busy only while it
// lasts (A4), drawn by buttons.css; `label` is a part. The group is a visual group of action buttons:
// named, with no keyboard of its own, and a pdx-toggle inside it keeps its own pressed state.
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait two frames for the components to build. */
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

const loading = (page: Page, sel: string) => page.locator(sel).evaluate((h) => h.matches(':state(loading)'));
const spinner = (page: Page, sel: string) => page.locator(`${sel} > [data-part="root"]`).evaluate((b) => getComputedStyle(b, '::after').content);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=button-beta-contract'); });

test.describe('pdx-button', () => {
    test('A4 — loading is :state(loading) and aria-busy, drawn with its spinner, and neither once it ends', async ({ page }) => {
        await mount(page, '<pdx-button id="b" loading>Save</pdx-button>');
        const root = page.locator('#b > [data-part="root"]');
        expect(await loading(page, '#b')).toBe(true);
        await expect(root).toHaveAttribute('aria-busy', 'true');
        expect(await spinner(page, '#b'), 'buttons.css draws the spinner from the state').not.toBe('none');
        await expect(root).not.toHaveClass(/pdx-loading/);

        await page.locator('#b').evaluate((h) => { (h as unknown as { loading: boolean }).loading = false; });
        await expect.poll(() => loading(page, '#b')).toBe(false);
        await expect(root).not.toHaveAttribute('aria-busy', /.*/);
        expect(await spinner(page, '#b')).toBe('none');
    });

    test('control — a button that is not loading is in no state and not busy', async ({ page }) => {
        await mount(page, '<pdx-button id="b">Save</pdx-button>');
        expect(await loading(page, '#b')).toBe(false);
        await expect(page.locator('#b > [data-part="root"]')).not.toHaveAttribute('aria-busy', /.*/);
    });

    test('label is the label part, after the slotted content, and names the button', async ({ page }) => {
        await mount(page, '<pdx-button id="b" label="Save"><pdx-icon name="check"></pdx-icon></pdx-button>');
        await expect(page.locator('#b [data-part="label"]')).toHaveText('Save');
        await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(1);
    });

    test('toggle and pressed do nothing: a click flips no state', async ({ page }) => {
        await mount(page, '<pdx-button id="b" toggle pressed>Bold</pdx-button>');
        const root = page.locator('#b > [data-part="root"]');
        await root.click();
        await expect(root).not.toHaveAttribute('aria-pressed', /.*/);
    });
});

test.describe('pdx-button-group', () => {
    const GROUP = '<pdx-button-group id="g" label="Text alignment"><pdx-button>Left</pdx-button><pdx-button>Center</pdx-button><pdx-button>Right</pdx-button></pdx-button-group>';

    test('it is a group named by its label; its buttons keep their names and are reached with Tab', async ({ page }) => {
        await mount(page, `<button id="before">Before</button>${GROUP}`);
        const group = page.getByRole('group', { name: 'Text alignment' });
        await expect(group).toHaveCount(1);
        await expect(group.getByRole('button')).toHaveText(['Left', 'Center', 'Right']);
        await page.locator('#before').focus();
        for (const name of ['Left', 'Center', 'Right']) {
            await page.keyboard.press('Tab');
            await expect(page.getByRole('button', { name })).toBeFocused();
        }
    });

    test('orientation="vertical" stacks its buttons; horizontal puts them in a row', async ({ page }) => {
        const boxes = (sel: string) => page.locator(`${sel} [data-part="root"]`).evaluateAll((bs) => bs.map((b) => {
            const r = b.getBoundingClientRect();
            return { x: Math.round(r.left), y: Math.round(r.top) };
        }));
        await mount(page, `${GROUP.replace('id="g"', 'id="h"')}${GROUP.replace('id="g"', 'id="v" orientation="vertical"')}`);
        const row = await boxes('#h');
        const column = await boxes('#v');
        expect(new Set(row.map((b) => b.y)).size, 'one row').toBe(1);
        expect(row[0].x < row[1].x && row[1].x < row[2].x).toBe(true);
        expect(new Set(column.map((b) => b.x)).size, 'one column').toBe(1);
        expect(column[0].y < column[1].y && column[1].y < column[2].y).toBe(true);
    });

    test('a pdx-toggle inside it keeps aria-pressed, and a click flips it', async ({ page }) => {
        await mount(page, '<pdx-button-group label="Format"><pdx-toggle id="t">Bold</pdx-toggle><pdx-button>Clear</pdx-button></pdx-button-group>');
        const toggle = page.getByRole('button', { name: 'Bold' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });
});
