// pdx-transfer on the beta contract (#287): `disabled` is a custom state, `:state(disabled)` on the
// host, and its frame carries no state class of its own; the target values are the model, `value`,
// which replaces getValue()/setValue(). And the A-rules that apply to it (docs/language/beta/agents.md).
// Its frame is a `group`, which may carry neither aria-required nor aria-invalid (axe's
// aria-allowed-attr):
//   - A1, inside a required pdx-form-field the group is named by the label, its marker with it;
//   - A2, inside a pdx-form-field in error the group is described by the message.
// Its text boxes are the two search filters, which are not the value: neither is marked required or
// invalid by the field.
// Measured in Chromium: `:state()`, the accessible name and description are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const ITEMS = [
    { value: 'r', label: 'Read' },
    { value: 'w', label: 'Write' },
    { value: 'x', label: 'Execute' },
];

/** Put `html` in a fresh <div id="f">, give every transfer `items`, and wait for them to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async ({ markup, items }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const t of f.querySelectorAll('pdx-transfer')) (t as unknown as { items: unknown[] }).items = items;
    }, { markup: html, items: ITEMS });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const host = (page: Page) => page.locator('#f pdx-transfer');
const isDisabled = (page: Page) => host(page).evaluate((h) => h.matches(':state(disabled)'));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=transfer-beta-contract'); });

test.describe('states', () => {
    test('control — a plain transfer is not :state(disabled)', async ({ page }) => {
        await mount(page, '<pdx-transfer></pdx-transfer>');
        expect(await isDisabled(page)).toBe(false);
    });

    test('disabled is the custom state :state(disabled), and the frame has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-transfer disabled></pdx-transfer>');
        expect(await isDisabled(page)).toBe(true);
        const frame = page.locator('#f pdx-transfer [data-part="root"]');
        expect(await frame.evaluate((f) => [...f.classList])).not.toContain('disabled');
        expect(await frame.evaluate((f) => getComputedStyle(f).pointerEvents)).toBe('none');
    });

    test('disabled set after the mount follows', async ({ page }) => {
        await mount(page, '<pdx-transfer></pdx-transfer>');
        await host(page).evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(() => isDisabled(page)).toBe(true);
    });
});

test.describe('the model', () => {
    test('setting value moves the items to the target list, and value-change says so once', async ({ page }) => {
        await mount(page, '<pdx-transfer></pdx-transfer>');
        await host(page).evaluate((el) => {
            const seen: unknown[] = [];
            (window as unknown as { __seen: unknown[] }).__seen = seen;
            el.addEventListener('value-change', (e) => seen.push((e as CustomEvent).detail?.value));
        });
        await host(page).evaluate((el) => { (el as unknown as { value: string[] }).value = ['w']; });
        const target = page.locator('#f pdx-transfer [data-part="list"]').nth(1);
        await expect(target.getByRole('option')).toHaveText(['Write']);
        // A write from outside is not the user's: the model does not announce it back.
        expect(await page.evaluate(() => (window as unknown as { __seen: unknown[] }).__seen)).toEqual([]);
    });
});

test.describe('A-rules', () => {
    test('A1 — in a required pdx-form-field the group is named by the label, and neither it nor a filter is marked required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Rights" required><pdx-transfer searchable></pdx-transfer></pdx-form-field>');
        const group = page.locator('#f pdx-transfer [data-part="root"]');
        await expect(group).toHaveAccessibleName(/^Rights/);
        await expect(group).not.toHaveAttribute('aria-required', /.*/);
        for (const box of await page.locator('#f pdx-transfer [data-part="search"]').all()) {
            await expect(box).not.toHaveAttribute('aria-required', /.*/);
        }
    });

    test('A2 — in a pdx-form-field in error the group is described by the message, and no filter is marked invalid', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Rights" error="Grant one right" show-error><pdx-transfer searchable></pdx-transfer></pdx-form-field>');
        const group = page.locator('#f pdx-transfer [data-part="root"]');
        await expect(group).toHaveAccessibleDescription('Grant one right');
        await expect(group).not.toHaveAttribute('aria-invalid', /.*/);
        for (const box of await page.locator('#f pdx-transfer [data-part="search"]').all()) {
            await expect(box).not.toHaveAttribute('aria-invalid', /.*/);
        }
    });
});

test.describe('parts', () => {
    test('the frame, the panels, the filters, the lists, the options and the move buttons are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-transfer searchable></pdx-transfer>');
        const parts = await page.locator('#f pdx-transfer [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['list', 'move', 'option', 'panel', 'root', 'search']);
        await expect(page.locator('#f pdx-transfer [data-part="root"]')).toHaveAttribute('role', 'group');
        await expect(page.locator('#f pdx-transfer [data-part="list"]').first()).toHaveAttribute('role', 'listbox');
    });
});
