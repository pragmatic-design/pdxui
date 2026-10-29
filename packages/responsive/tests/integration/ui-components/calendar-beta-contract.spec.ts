// pdx-calendar on the beta contract (#287): `disabled` is a custom state, `:state(disabled)` on the
// host, and its frame carries no state class of its own. It has no popup. It becomes form-associated:
// with a `name` it submits its model as the date picker does, a range as two entries, and a form's
// reset restores it; without one it submits nothing (the date picker's own calendar has none). And
// the A-rules that apply to it (docs/language/beta/agents.md). Its frame is a `group`, which may carry
// neither aria-required nor aria-invalid (axe's aria-allowed-attr):
//   - A1, inside a required pdx-form-field the group is named by the label, its marker with it;
//   - A2, inside a pdx-form-field in error the group is described by the message.
// The calendar rebuilds its frame when it moves to another month: both hold after a move too.
// Measured in Chromium: `:state()`, FormData of a custom element, the accessible name and description.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the calendars to draw. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    // Drawn: a day, a month or a year to pick, whichever view the mode opens on.
    await expect(page.locator('#f pdx-calendar button').first()).toBeVisible();
}

const host = (page: Page) => page.locator('#f pdx-calendar');
const frame = (page: Page) => page.locator('#f pdx-calendar [data-part="root"]');
const isDisabled = (page: Page) => host(page).evaluate((h) => h.matches(':state(disabled)'));
/** The form's entries, as [name, value] pairs. */
const entries = (page: Page) => page.locator('#f form').evaluate((f) => [...new FormData(f as HTMLFormElement)].map(([k, v]) => [k, String(v)]));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=calendar-beta-contract'); });

test.describe('states', () => {
    test('control — a plain calendar is not :state(disabled)', async ({ page }) => {
        await mount(page, '<pdx-calendar inline value="2026-03-14"></pdx-calendar>');
        expect(await isDisabled(page)).toBe(false);
    });

    test('disabled is the custom state :state(disabled), the frame has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-calendar inline value="2026-03-14" disabled></pdx-calendar>');
        expect(await isDisabled(page)).toBe(true);
        expect(await frame(page).evaluate((f) => [...f.classList])).not.toContain('disabled');
        expect(await frame(page).evaluate((f) => getComputedStyle(f).pointerEvents)).toBe('none');
    });

    test('disabled set after the mount follows', async ({ page }) => {
        await mount(page, '<pdx-calendar inline value="2026-03-14"></pdx-calendar>');
        await host(page).evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(() => isDisabled(page)).toBe(true);
        await expect.poll(() => frame(page).evaluate((f) => getComputedStyle(f).pointerEvents)).toBe('none');
    });
});

test.describe('the form', () => {
    test('with a name it submits the date, a pick changes it, and reset restores it', async ({ page }) => {
        await mount(page, '<form><pdx-calendar inline name="due" value="2026-03-14"></pdx-calendar></form>');
        expect(await entries(page)).toEqual([['due', '2026-03-14']]);
        await page.getByRole('gridcell', { name: /March 20, 2026/ }).click();
        await expect.poll(() => entries(page)).toEqual([['due', '2026-03-20']]);
        await page.locator('#f form').evaluate((f) => (f as HTMLFormElement).reset());
        await expect.poll(() => entries(page)).toEqual([['due', '2026-03-14']]);
        await expect(host(page)).toHaveJSProperty('value', '2026-03-14');
    });

    test('a range submits two entries under its name', async ({ page }) => {
        await mount(page, '<form><pdx-calendar inline name="stay" mode="range"></pdx-calendar></form>');
        await host(page).evaluate((el) => { (el as unknown as { value: string[] }).value = ['2026-03-02', '2026-03-06']; });
        await expect.poll(() => entries(page)).toEqual([['stay', '2026-03-02'], ['stay', '2026-03-06']]);
    });

    test('control — without a name it submits nothing', async ({ page }) => {
        await mount(page, '<form><pdx-calendar inline value="2026-03-14"></pdx-calendar></form>');
        expect(await entries(page)).toEqual([]);
    });
});

test.describe('A-rules', () => {
    test('A1 — in a required pdx-form-field the group is named by the label, and still after a move to another month', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Due" required><pdx-calendar inline value="2026-03-14"></pdx-calendar></pdx-form-field>');
        await expect(frame(page)).toHaveAccessibleName(/^Due/);
        await expect(frame(page)).not.toHaveAttribute('aria-required', /.*/);
        await page.getByRole('button', { name: 'Next month' }).click();
        await expect(frame(page)).toHaveAccessibleName(/^Due/);
    });

    test('A2 — in a pdx-form-field in error the group is described by the message, and still after a move to another month', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Due" error="Pick a weekday" show-error><pdx-calendar inline value="2026-03-14"></pdx-calendar></pdx-form-field>');
        await expect(frame(page)).toHaveAccessibleDescription('Pick a weekday');
        await expect(frame(page)).not.toHaveAttribute('aria-invalid', /.*/);
        await page.getByRole('button', { name: 'Next month' }).click();
        await expect(frame(page)).toHaveAccessibleDescription('Pick a weekday');
    });
});

test.describe('parts', () => {
    test('the frame, the navigation, its arrows and title, the grid and the cells are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-calendar inline value="2026-03-14"></pdx-calendar>');
        const parts = await page.locator('#f pdx-calendar [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['cell', 'grid', 'nav', 'next', 'prev', 'root', 'title']);
        await expect(frame(page)).toHaveAttribute('role', 'group');
        await expect(page.locator('#f pdx-calendar [data-part="grid"]')).toHaveAttribute('role', 'grid');
        await expect(page.locator('#f pdx-calendar [data-part="cell"]').first()).toHaveAttribute('role', 'gridcell');
    });

    test('in the month view the grid and the cells are the months', async ({ page }) => {
        await mount(page, '<pdx-calendar inline mode="month" value="2026-03-14"></pdx-calendar>');
        await expect(page.locator('#f pdx-calendar [data-part="cell"]')).toHaveCount(12);
        await expect(page.locator('#f pdx-calendar [data-part="grid"]')).toHaveCount(1);
    });
});
