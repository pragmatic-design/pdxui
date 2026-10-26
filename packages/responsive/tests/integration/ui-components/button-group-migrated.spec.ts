// A `pdx-button-group` with a selection mode, migrated by `pdx migrate` to a `pdx-toggle-group`, keeps
// its selection and its ARIA pattern (#286, decision 51): a radio group for `single`, aria-pressed
// buttons for `multiple`. The source goes through the registry's own rewrite (button-group-modes), and
// the result is measured in a browser: roles, the checked or pressed items, the tab stop, a key and a
// click.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { buttonGroupModes } from '../../../../compiler/src/language/button-group-modes';

const migrate = buttonGroupModes.fix as (text: string) => string;

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

/** Each item's role, name and state as the accessibility attributes say it. */
const items = (page: Page) => page.locator('#f button').evaluateAll((els) => els.map((e) => ({
    role: e.getAttribute('role') ?? 'button',
    name: e.textContent?.trim(),
    checked: e.getAttribute('aria-checked'),
    pressed: e.getAttribute('aria-pressed'),
    tabStop: e.getAttribute('tabindex') !== '-1',
})));

const groupValue = (page: Page) => page.locator('#f > *').first().evaluate((g) => (g as unknown as { value: string }).value);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=button-group-migrated'); });

const SINGLE = '<pdx-button-group mode="single" value="center" label="Text alignment">'
    + '<pdx-button value="left">Left</pdx-button><pdx-button value="center">Center</pdx-button><pdx-button value="right">Right</pdx-button>'
    + '</pdx-button-group>';

test('the migration writes a toggle group with toggle items', () => {
    expect(migrate(SINGLE)).toBe('<pdx-toggle-group type="single" variant="solid" value="center" label="Text alignment">'
        + '<pdx-toggle value="left">Left</pdx-toggle><pdx-toggle value="center">Center</pdx-toggle><pdx-toggle value="right">Right</pdx-toggle>'
        + '</pdx-toggle-group>');
});

test('single, migrated: a radiogroup with the same radio checked, its tab stop on it, the arrow selecting', async ({ page }) => {
    await mount(page, migrate(SINGLE));
    await expect(page.getByRole('radiogroup', { name: 'Text alignment' })).toHaveCount(1);
    await expect.poll(() => items(page)).toEqual([
        { role: 'radio', name: 'Left', checked: 'false', pressed: null, tabStop: false },
        { role: 'radio', name: 'Center', checked: 'true', pressed: null, tabStop: true },
        { role: 'radio', name: 'Right', checked: 'false', pressed: null, tabStop: false },
    ]);
    await page.getByRole('radio', { name: 'Center' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Right' })).toBeFocused();
    await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => groupValue(page)).toBe('right');
});

test('multiple, migrated from native buttons without values: the same pressed items, each named by its text', async ({ page }) => {
    const source = '<pdx-button-group mode="multiple" value="Bold,Underline" label="Style">'
        + '<button>Bold</button><button>Italic</button><button>Underline</button>'
        + '</pdx-button-group>';
    await mount(page, migrate(source));
    await expect(page.getByRole('group', { name: 'Style' })).toHaveCount(1);
    await expect.poll(() => items(page)).toEqual([
        { role: 'button', name: 'Bold', checked: null, pressed: 'true', tabStop: true },
        { role: 'button', name: 'Italic', checked: null, pressed: 'false', tabStop: true },
        { role: 'button', name: 'Underline', checked: null, pressed: 'true', tabStop: true },
    ]);
    await page.getByRole('button', { name: 'Italic' }).click();
    await expect.poll(() => groupValue(page)).toBe('Bold,Underline,Italic');
});
