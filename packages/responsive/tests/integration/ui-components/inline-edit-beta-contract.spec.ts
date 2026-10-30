// pdx-inline-edit on the beta contract (#286): its states are custom states on the host, its root
// carries no state class, its inner elements are declared parts, its methods are exposed, and the
// A-rules hold in a browser.
//   - Its control at rest is the display, a `role="button"` holding the value. A button may carry
//     neither aria-required nor aria-invalid (axe's aria-allowed-attr): inside a pdx-form-field it is
//     named by the label and the value, and described by the hint and the error.
//   - While editing, the editor's text box is the field's control and takes the native wiring:
//     aria-required, aria-invalid and the description.
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

/** Whether the first `sel` inside #f matches `:state(name)`. */
const inState = (page: Page, sel: string, name: string) =>
    page.locator(`#f ${sel}`).first().evaluate((h, n) => h.matches(`:state(${n})`), name);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=inline-edit-beta-contract'); });

test('disabled and readonly are custom states on the host, and the root carries no state class', async ({ page }) => {
    await mount(page, `
        <pdx-inline-edit data-k="disabled" value="Ada" disabled></pdx-inline-edit>
        <pdx-inline-edit data-k="readonly" value="Ada" readonly></pdx-inline-edit>
        <pdx-inline-edit data-k="plain" value="Ada"></pdx-inline-edit>`);
    for (const k of ['disabled', 'readonly']) {
        expect(await inState(page, `[data-k="${k}"]`, k), `:state(${k})`).toBe(true);
        expect(await inState(page, '[data-k="plain"]', k), `plain is not :state(${k})`).toBe(false);
        const classes = await page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => [...e.classList]);
        expect(classes, `${k}: the root has no state class`).not.toContain(k);
    }
});

test('editing is a custom state while the editor is open, and the root carries no class for it', async ({ page }) => {
    await mount(page, '<pdx-inline-edit value="Ada" label="Name"></pdx-inline-edit>');
    const host = page.locator('#f pdx-inline-edit');
    expect(await inState(page, 'pdx-inline-edit', 'editing')).toBe(false);
    await page.locator('#f [data-part="display"]').click();
    await expect(page.locator('#f [data-part="editor"] input')).toBeVisible();
    expect(await inState(page, 'pdx-inline-edit', 'editing')).toBe(true);
    expect(await page.locator('#f [data-part="root"]').evaluate((e) => [...e.classList])).not.toContain('editing');
    await page.keyboard.press('Escape');
    await expect.poll(() => host.evaluate((h) => h.matches(':state(editing)'))).toBe(false);
});

test('its parts: the root, the display, the editor, and in action mode the save and cancel buttons', async ({ page }) => {
    await mount(page, '<pdx-inline-edit value="Ada" label="Name" save-on="action"></pdx-inline-edit>');
    await expect(page.locator('#f [data-part="root"]')).toHaveCount(1);
    await expect(page.locator('#f [data-part="display"]')).toHaveCount(1);
    await expect(page.locator('#f [data-part="editor"]')).toHaveCount(1);
    await page.locator('#f [data-part="display"]').click();
    await expect(page.locator('#f [data-part="save"]')).toBeVisible();
    await expect(page.locator('#f [data-part="cancel"]')).toBeVisible();
});

test('the design CSS draws its states from the host: dimmed disabled, no pointer readonly, wider while editing', async ({ page }) => {
    await mount(page, `
        <pdx-inline-edit data-k="plain" value="Ada"></pdx-inline-edit>
        <pdx-inline-edit data-k="disabled" value="Ada" disabled></pdx-inline-edit>
        <pdx-inline-edit data-k="readonly" value="Ada" readonly></pdx-inline-edit>
        <pdx-inline-edit data-k="edit" value="A"></pdx-inline-edit>`);
    const opacity = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => Number(getComputedStyle(e).opacity));
    const cursor = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="display"]`).evaluate((e) => getComputedStyle(e).cursor);
    expect(await opacity('disabled')).toBeLessThan(1);
    expect(await opacity('plain')).toBe(1);
    expect(await cursor('readonly')).toBe('default');
    expect(await cursor('plain')).toBe('pointer');
    await page.locator('#f [data-k="edit"] [data-part="display"]').click();
    await expect(page.locator('#f [data-k="edit"] [data-part="editor"] input')).toBeVisible();
    const minWidth = await page.locator('#f [data-k="edit"]').evaluate((e) => getComputedStyle(e).minWidth);
    expect(minWidth).toBe('200px');
});

test('its methods are exposed on the host, and Cancel emits the declared pdx-cancel', async ({ page }) => {
    await mount(page, '<pdx-inline-edit value="Ada" label="Name"></pdx-inline-edit>');
    const host = page.locator('#f pdx-inline-edit');
    await host.evaluate((el) => {
        (window as unknown as { cancels: number }).cancels = 0;
        el.addEventListener('pdx-cancel', () => { (window as unknown as { cancels: number }).cancels++; });
        (el as unknown as { startEdit(): void }).startEdit();
    });
    await expect(page.locator('#f [data-part="editor"] input')).toBeVisible();
    await host.evaluate((el) => (el as unknown as { cancelEdit(): void }).cancelEdit());
    await expect(page.locator('#f [data-part="editor"] input')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { cancels: number }).cancels)).toBe(1);
});

test('A1 — inside a required pdx-form-field the display is named by the label and the value, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Name" required><pdx-inline-edit value="Ada"></pdx-inline-edit></pdx-form-field>');
    // A button may not carry aria-required: the label's marker says it, and the button is named by
    // the label, so the marker is read with it.
    const display = page.locator('#f [data-part="display"]');
    await expect(display).toHaveAccessibleName(/^Name\b.*Ada/);
    await expect(display).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A1 — while editing, the editor text box is aria-required', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Name" required><pdx-inline-edit value="Ada"></pdx-inline-edit></pdx-form-field>');
    await page.locator('#f [data-part="display"]').click();
    await expect(page.locator('#f [data-part="editor"] input')).toHaveAttribute('aria-required', 'true');
});

test('A2 — inside a pdx-form-field in error the display is described by the message, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Name" error="Too short" show-error><pdx-inline-edit value="Ada"></pdx-inline-edit></pdx-form-field>');
    const display = page.locator('#f [data-part="display"]');
    await expect(display).toHaveAccessibleDescription('Too short');
    await expect(display).not.toHaveAttribute('aria-invalid', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — while editing, the editor text box is aria-invalid and described by the message', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Name" error="Too short" show-error><pdx-inline-edit value="Ada"></pdx-inline-edit></pdx-form-field>');
    await page.locator('#f [data-part="display"]').click();
    const box = page.locator('#f [data-part="editor"] input');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box).toHaveAccessibleDescription('Too short');
});

test('A2 control — when the error goes, the display is no longer described by it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Name" error="Too short" show-error><pdx-inline-edit value="Ada"></pdx-inline-edit></pdx-form-field>');
    const display = page.locator('#f [data-part="display"]');
    await expect(display).toHaveAccessibleDescription('Too short');
    await page.locator('#f pdx-form-field').evaluate((el) => el.removeAttribute('show-error'));
    await expect(display).toHaveAccessibleDescription('');
});

// #710: `edit-on="icon"` was documented and behaved as `click`; the prop was also read once, at build.
test.describe('edit-on', () => {
    const editor = (page: Page) => page.locator('#f [data-part="editor"] input');

    test('icon: a click on the value does not open the editor, a click on the edit button does', async ({ page }) => {
        await mount(page, '<pdx-inline-edit value="Ada" label="Name" edit-on="icon"></pdx-inline-edit>');
        await page.locator('#f .pdx-inline-edit-text').click();
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        await expect(editor(page)).toHaveCount(0);
        const button = page.locator('#f [data-part="edit"]');
        await expect(button).toHaveRole('button');
        await expect(button).toHaveAccessibleName('Edit Ada');
        // The only way in is always shown, and the value invites no click.
        expect(await button.evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
        expect(await page.locator('#f [data-part="display"]').evaluate((d) => getComputedStyle(d).cursor)).toBe('default');
        await button.click();
        await expect(editor(page)).toBeVisible();
    });

    test('icon: the display is not a tab stop; Tab reaches the edit button and Enter opens the editor', async ({ page }) => {
        await mount(page, '<button id="before">before</button><pdx-inline-edit value="Ada" label="Name" edit-on="icon"></pdx-inline-edit>');
        const display = page.locator('#f [data-part="display"]');
        await expect(display).not.toHaveAttribute('tabindex', /.*/);
        await expect(display).not.toHaveAttribute('role', /.*/);
        await page.locator('#before').focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('#f [data-part="edit"]')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(editor(page)).toBeVisible();
    });

    test('icon: Escape closes the editor with focus back on the edit button, not on <body>', async ({ page }) => {
        await mount(page, '<pdx-inline-edit value="Ada" label="Name" edit-on="icon"></pdx-inline-edit>');
        await page.locator('#f [data-part="edit"]').click();
        await expect(editor(page)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('#f [data-part="edit"]')).toBeFocused();
    });

    test('icon: axe finds nothing, alone and inside a required pdx-form-field, where the edit button is named by the label', async ({ page }) => {
        await mount(page, `
            <pdx-inline-edit value="Ada" label="Name" edit-on="icon"></pdx-inline-edit>
            <pdx-form-field label="City" required><pdx-inline-edit value="Rome" edit-on="icon"></pdx-inline-edit></pdx-form-field>`);
        expect(await axe(page)).toEqual([]);
        await expect(page.locator('#f pdx-form-field [data-part="edit"]')).toHaveAccessibleName(/^City\b.*Rome/);
    });

    test('control — click: a click on the value opens the editor, and there is no edit button', async ({ page }) => {
        await mount(page, '<pdx-inline-edit value="Ada" label="Name"></pdx-inline-edit>');
        await expect(page.locator('#f [data-part="edit"]')).toHaveCount(0);
        await page.locator('#f .pdx-inline-edit-text').click();
        await expect(editor(page)).toBeVisible();
    });

    test('set after mount: dblclick makes a single click do nothing, and a double click opens', async ({ page }) => {
        await mount(page, '<pdx-inline-edit value="Ada" label="Name"></pdx-inline-edit>');
        await page.locator('#f pdx-inline-edit').evaluate((el) => el.setAttribute('edit-on', 'dblclick'));
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        await page.locator('#f .pdx-inline-edit-text').click();
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        await expect(editor(page)).toHaveCount(0);
        await page.locator('#f .pdx-inline-edit-text').dblclick();
        await expect(editor(page)).toBeVisible();
    });

    test('set after mount: icon puts the edit button in, and back to click takes it out', async ({ page }) => {
        await mount(page, '<pdx-inline-edit value="Ada" label="Name"></pdx-inline-edit>');
        const host = page.locator('#f pdx-inline-edit');
        await host.evaluate((el) => el.setAttribute('edit-on', 'icon'));
        await expect(page.locator('#f [data-part="edit"]')).toHaveCount(1);
        await host.evaluate((el) => el.setAttribute('edit-on', 'click'));
        await expect(page.locator('#f [data-part="edit"]')).toHaveCount(0);
        await expect(page.locator('#f [data-part="display"]')).toHaveAttribute('tabindex', '0');
    });
});

test('the host carries `name`, and loses it when the prop is emptied', async ({ page }) => {
    await mount(page, '<pdx-inline-edit value="Ada" name="first"></pdx-inline-edit>');
    const host = page.locator('#f pdx-inline-edit');
    await expect(host).toHaveAttribute('name', 'first');
    await host.evaluate((el) => { (el as unknown as { name: string }).name = ''; });
    await expect(host).not.toHaveAttribute('name', /.*/);
});
