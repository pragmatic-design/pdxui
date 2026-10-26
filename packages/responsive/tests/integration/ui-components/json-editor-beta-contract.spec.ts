// pdx-json-editor on the beta contract (#286): its inner elements are declared parts, a form submits
// and resets it, and the A-rules hold in a browser.
//   - It holds a form of library fields, each named by its own label. Its host is a `role="group"`:
//     inside a pdx-form-field the group is named by the field's label and described by the hint and
//     the error. A group may carry neither aria-required nor aria-invalid (axe's aria-allowed-attr),
//     and its sub-fields are not marked either: the field's error and requirement are the
//     document's, not each sub-field's. The label's marker says it is required.
//   - Before, the field took the first sub-field's input as its control: the field's label named
//     that one sub-field, and the error described it alone.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const SCHEMA = {
    label: 'Profile',
    fields: [
        { k: 'name', label: 'Name' },
        { k: 'age', label: 'Age', type: 'number' },
        { k: 'address', label: 'Address', type: 'object', fields: [{ k: 'city', label: 'City' }] },
    ],
};

/**
 * Put `html` in a fresh <div id="f">, give every json editor SCHEMA and `value` BEFORE it is
 * connected — the value a form reset puts back is the one it mounted with (#135) — and wait for it.
 */
async function mount(page: Page, html: string, value: unknown = { name: 'Ada', age: 36 }): Promise<void> {
    await page.evaluate(async ({ markup, schema, value }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        for (const el of f.querySelectorAll('pdx-json-editor')) Object.assign(el, { schema, value });
        document.body.appendChild(f);
    }, { markup: html, schema: SCHEMA, value });
    await expect(page.locator('#f pdx-json-editor [data-part="entry"]').first()).toBeVisible();
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

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=json-editor-beta-contract'); });

test('it is a group named by its schema\'s label, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-json-editor></pdx-json-editor>');
    await expect(page.getByRole('group', { name: 'Profile' })).toHaveCount(1);
    expect(await axe(page)).toEqual([]);
});

test('its parts: an entry per scalar, a branch per object, and the dialog a branch opens', async ({ page }) => {
    await mount(page, '<pdx-json-editor></pdx-json-editor>');
    await expect(page.locator('#f pdx-json-editor > * > [data-part="entry"]')).toHaveCount(2);
    await expect(page.locator('#f [data-part="branch"]')).toHaveCount(1);
    await page.locator('#f [data-part="branch"] button').click();
    await expect(page.getByRole('dialog', { name: 'Address' })).toHaveAttribute('data-part', 'dialog');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-part="dialog"]')).toHaveCount(0);
});

test('a form submits it as JSON under its name, and form.reset() puts back the mounted document', async ({ page }) => {
    await mount(page, '<form><pdx-json-editor name="profile"></pdx-json-editor></form>');
    const read = () => page.evaluate(() => {
        const v = new FormData(document.querySelector('#f form') as HTMLFormElement).get('profile');
        return v == null ? null : JSON.parse(String(v));
    });
    await expect.poll(read).toEqual({ name: 'Ada', age: 36 });
    await page.getByRole('textbox', { name: 'Name' }).fill('Grace');
    await expect.poll(read).toEqual({ name: 'Grace', age: 36 });
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(read).toEqual({ name: 'Ada', age: 36 });
});

test('A1 — inside a required pdx-form-field the group is named by the field; no sub-field is marked, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Owner" required><pdx-json-editor></pdx-json-editor></pdx-form-field>');
    await expect(page.getByRole('group', { name: /Owner/ })).toHaveCount(1);
    // The sub-fields keep their own names, and are not each required.
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveCount(1);
    await expect(name).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — inside a pdx-form-field in error the group is described by the message; no sub-field is marked, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Owner" error="Fill the profile" show-error><pdx-json-editor></pdx-json-editor></pdx-form-field>');
    await expect(page.getByRole('group', { name: /Owner/ })).toHaveAccessibleDescription('Fill the profile');
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(name).toHaveAccessibleDescription('');
    expect(await axe(page)).toEqual([]);
});

test('A2 control — when the error goes, the group is no longer described by it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Owner" error="Fill the profile" show-error><pdx-json-editor></pdx-json-editor></pdx-form-field>');
    const group = page.getByRole('group', { name: /Owner/ });
    await expect(group).toHaveAccessibleDescription('Fill the profile');
    await page.locator('#f pdx-form-field').evaluate((el) => el.removeAttribute('show-error'));
    await expect(group).toHaveAccessibleDescription('');
});
