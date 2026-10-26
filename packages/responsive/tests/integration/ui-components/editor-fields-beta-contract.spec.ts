// pdx-tag-input and pdx-mention on the beta contract (#286): their visual states are custom states on
// the host, their frames carry no state class, their inner elements are declared parts, and the
// A-rules hold in a browser.
//   - pdx-tag-input's control is a `role="group"` around one text box. A group may carry neither
//     aria-invalid nor aria-required (axe's aria-allowed-attr), so its own `error` marks the text box,
//     and inside a pdx-form-field the field marks it (#708). While `loading` the group is aria-busy
//     (A4), not the host.
//   - pdx-mention's control is its textarea, which a field reaches as a native field.
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

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=editor-fields-beta-contract'); });

test.describe('pdx-tag-input', () => {
    test('its states are custom states on the host, and its frame carries no state class', async ({ page }) => {
        await mount(page, `
            <pdx-tag-input data-k="error" error></pdx-tag-input>
            <pdx-tag-input data-k="success" success></pdx-tag-input>
            <pdx-tag-input data-k="warning" warning></pdx-tag-input>
            <pdx-tag-input data-k="disabled" disabled></pdx-tag-input>
            <pdx-tag-input data-k="readonly" readonly></pdx-tag-input>
            <pdx-tag-input data-k="loading" loading></pdx-tag-input>`);
        const pairs = [['error', 'invalid'], ['success', 'success'], ['warning', 'warning'], ['disabled', 'disabled'], ['readonly', 'readonly'], ['loading', 'loading']];
        for (const [k, state] of pairs) {
            expect(await inState(page, `[data-k="${k}"]`, state), `${k} → :state(${state})`).toBe(true);
            const classes = await page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluate((e) => [...e.classList]);
            expect(classes, `${k}: the frame has no state class`).not.toContain(k);
        }
        expect(await inState(page, '[data-k="error"]', 'disabled')).toBe(false);
    });

    test('its parts: the root, the text box, and each tag with its remove button', async ({ page }) => {
        await mount(page, '<pdx-tag-input></pdx-tag-input>');
        await page.locator('#f pdx-tag-input').evaluate((el) => { (el as unknown as { value: string[] }).value = ['a', 'b']; });
        await expect(page.locator('#f [data-part="tag"]')).toHaveCount(2);
        await expect(page.locator('#f [data-part="remove"]')).toHaveCount(2);
        await expect(page.locator('#f [data-part="root"]')).toHaveCount(1);
        await expect(page.locator('#f [data-part="input"]')).toHaveCount(1);
    });

    test('the design CSS draws its states from the host: an error border, a dimmed disabled field', async ({ page }) => {
        await mount(page, `
            <pdx-tag-input data-k="plain"></pdx-tag-input>
            <pdx-tag-input data-k="error" error></pdx-tag-input>
            <pdx-tag-input data-k="disabled" disabled></pdx-tag-input>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>`);
        const c = await page.evaluate(() => {
            const root = (k: string) => getComputedStyle(document.querySelector(`#f [data-k="${k}"] [data-part="root"]`)!);
            return {
                plain: root('plain').borderTopColor, error: root('error').borderTopColor,
                danger: getComputedStyle(document.querySelector('#f [data-k="danger"]')!).color,
                plainOpacity: Number(root('plain').opacity), disabledOpacity: Number(root('disabled').opacity),
                plainPointer: root('plain').pointerEvents, disabledPointer: root('disabled').pointerEvents,
            };
        });
        expect(c.error).toBe(c.danger);
        expect(c.plain).not.toBe(c.danger);
        expect(c.disabledOpacity).toBeLessThan(1);
        expect(c.plainOpacity).toBe(1);
        // tag-input.css's own rule: a disabled frame takes no clicks.
        expect(c.disabledPointer).toBe('none');
        expect(c.plainPointer).not.toBe('none');
    });

    test('A2 — its own error marks the text box aria-invalid, not the group, and axe allows it', async ({ page }) => {
        await mount(page, '<pdx-tag-input label="Skills" error></pdx-tag-input>');
        await expect(page.locator('#f [data-part="input"]')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.locator('#f [data-part="root"]')).not.toHaveAttribute('aria-invalid', /.*/);
        expect(await axe(page)).toEqual([]);
        await page.locator('#f pdx-tag-input').evaluate((el) => el.removeAttribute('error'));
        await expect(page.locator('#f [data-part="input"]')).not.toHaveAttribute('aria-invalid', /.*/);
    });

    test('A4 — while loading the group is aria-busy, the host is not, and it stops when loading does', async ({ page }) => {
        await mount(page, '<pdx-tag-input label="Skills" loading></pdx-tag-input>');
        const group = page.getByRole('group', { name: 'Skills' });
        await expect(group).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#f pdx-tag-input')).not.toHaveAttribute('aria-busy', /.*/);
        await page.locator('#f pdx-tag-input').evaluate((el) => el.removeAttribute('loading'));
        await expect(group).not.toHaveAttribute('aria-busy', /.*/);
    });

    test('A1 — inside a required pdx-form-field the text box is aria-required, and axe allows it', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Skills" required><pdx-tag-input></pdx-tag-input></pdx-form-field>');
        await expect(page.locator('#f [data-part="input"]')).toHaveAttribute('aria-required', 'true');
        expect(await axe(page)).toEqual([]);
    });

    test('A2 — inside a pdx-form-field in error the text box is aria-invalid and the group is described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Skills" error="Add a skill" show-error><pdx-tag-input></pdx-tag-input></pdx-form-field>');
        await expect(page.locator('#f [data-part="input"]')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByRole('group', { name: 'Skills' })).toHaveAccessibleDescription('Add a skill');
        expect(await axe(page)).toEqual([]);
    });

    test('the host carries `name`, and loses it when the prop is emptied', async ({ page }) => {
        await mount(page, '<pdx-tag-input name="skills"></pdx-tag-input>');
        const host = page.locator('#f pdx-tag-input');
        await expect(host).toHaveAttribute('name', 'skills');
        await host.evaluate((el) => { (el as unknown as { name: string }).name = ''; });
        await expect(host).not.toHaveAttribute('name', /.*/);
    });
});

test.describe('pdx-mention', () => {
    test('disabled and readonly are custom states on the host', async ({ page }) => {
        await mount(page, `
            <pdx-mention data-k="disabled" label="Note" disabled></pdx-mention>
            <pdx-mention data-k="readonly" label="Note" readonly></pdx-mention>
            <pdx-mention data-k="plain" label="Note"></pdx-mention>`);
        expect(await inState(page, '[data-k="disabled"]', 'disabled')).toBe(true);
        expect(await inState(page, '[data-k="readonly"]', 'readonly')).toBe(true);
        expect(await inState(page, '[data-k="plain"]', 'disabled')).toBe(false);
        expect(await inState(page, '[data-k="plain"]', 'readonly')).toBe(false);
    });

    test('disabled and readonly set after mount reach the textarea and the state', async ({ page }) => {
        await mount(page, '<pdx-mention label="Note"></pdx-mention>');
        const host = page.locator('#f pdx-mention');
        const box = page.getByRole('textbox', { name: 'Note' });
        await expect(box).toBeEnabled();
        await host.evaluate((el) => el.setAttribute('disabled', ''));
        await expect(box).toBeDisabled();
        expect(await inState(page, 'pdx-mention', 'disabled')).toBe(true);
        await host.evaluate((el) => { el.removeAttribute('disabled'); el.setAttribute('readonly', ''); });
        await expect(box).toBeEnabled();
        await expect(box).not.toBeEditable();
        expect(await inState(page, 'pdx-mention', 'readonly')).toBe(true);
    });

    test('its parts: the root, the textarea, the suggestion list and its options', async ({ page }) => {
        await mount(page, '<pdx-mention label="Note"></pdx-mention>');
        await page.locator('#f pdx-mention').evaluate((el) => {
            (el as unknown as { items: unknown[] }).items = [{ value: 'ada', label: 'Ada' }, { value: 'alan', label: 'Alan' }];
        });
        await expect(page.locator('#f [data-part="root"]')).toHaveCount(1);
        await expect(page.locator('#f [data-part="input"]')).toHaveCount(1);
        await page.getByRole('textbox', { name: 'Note' }).pressSequentially('@');
        await expect(page.locator('#f [data-part="list"]')).toBeVisible();
        await expect(page.locator('#f [data-part="option"]')).toHaveCount(2);
    });

    test('A1 — inside a required pdx-form-field the textarea is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Note" required><pdx-mention></pdx-mention></pdx-form-field>');
        await expect(page.getByRole('textbox', { name: 'Note' })).toHaveAttribute('aria-required', 'true');
        expect(await axe(page)).toEqual([]);
    });

    test('A2 — inside a pdx-form-field in error the textarea is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Note" error="Mention someone" show-error><pdx-mention></pdx-mention></pdx-form-field>');
        const box = page.getByRole('textbox', { name: 'Note' });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Mention someone');
        expect(await axe(page)).toEqual([]);
    });

    test('the host carries `name`, and loses it when the prop is emptied', async ({ page }) => {
        await mount(page, '<pdx-mention label="Note" name="note"></pdx-mention>');
        const host = page.locator('#f pdx-mention');
        await expect(host).toHaveAttribute('name', 'note');
        await host.evaluate((el) => { (el as unknown as { name: string }).name = ''; });
        await expect(host).not.toHaveAttribute('name', /.*/);
    });
});
