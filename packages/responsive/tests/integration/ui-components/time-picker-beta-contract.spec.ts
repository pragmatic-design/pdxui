// pdx-time-picker on the beta contract (#287): `disabled` is a custom state, `:state(disabled)` on the
// host, and its frame carries no state class of its own. It has no popup: its segments are spinbuttons
// in a `group`, so it has neither an `open` state nor `open-change`. And the A-rules that apply to it
// (docs/language/agents.md). Its frame is a `group`, which may carry neither aria-required nor
// aria-invalid (axe's aria-allowed-attr):
//   - A1, inside a required pdx-form-field the group is named by the label, its marker with it;
//   - A2, inside a pdx-form-field in error the group is described by the message.
// Measured in Chromium: `:state()`, the accessible name and description are not happy-dom's to tell.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage, loadMarkup } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the pickers to build. */
async function mount(page: Page, html: string): Promise<void> {
    await loadMarkup(page, html);
    await page.evaluate((markup) => {
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const host = (page: Page) => page.locator('#f pdx-time-picker');
const frame = (page: Page) => page.locator('#f pdx-time-picker [data-part="root"]');
const isDisabled = (page: Page) => host(page).evaluate((h) => h.matches(':state(disabled)'));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=time-picker-beta-contract'); });

// The AM/PM segment of a 12-hour clock is a spinbutton too, and a spinbutton's aria-valuenow is a
// number: it was the text «AM», which axe's aria-valid-attr-value rejects. AM is 0 and PM 1, and the
// word is its aria-valuetext.
test.describe('the 12-hour clock', () => {
    const period = (page: Page) => page.getByRole('spinbutton', { name: 'AM/PM' });

    test('AM/PM is a spinbutton from 0 to 1, its word in aria-valuetext, and stepping it says the other', async ({ page }) => {
        await mount(page, '<pdx-time-picker locale="en-US" value="14:30"></pdx-time-picker>');
        await expect(period(page)).toHaveAttribute('aria-valuenow', '1');
        await expect(period(page)).toHaveAttribute('aria-valuetext', 'PM');
        await expect(period(page)).toHaveAttribute('aria-valuemin', '0');
        await expect(period(page)).toHaveAttribute('aria-valuemax', '1');
        await period(page).focus();
        await page.keyboard.press('ArrowDown');
        await expect(period(page)).toHaveAttribute('aria-valuenow', '0');
        await expect(period(page)).toHaveAttribute('aria-valuetext', 'AM');
        expect(await host(page).evaluate((h) => (h as HTMLElement & { value: string }).value)).toBe('02:30');
    });

    test('axe finds nothing wrong with it', async ({ page }) => {
        await mount(page, '<pdx-time-picker locale="en-US" value="09:00" aria-label="Start"></pdx-time-picker>');
        const results = await new AxeBuilder({ page }).include('#f').disableRules(['color-contrast']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    });
});

test.describe('states', () => {
    test('control — a plain time picker is not :state(disabled)', async ({ page }) => {
        await mount(page, '<pdx-time-picker value="09:30"></pdx-time-picker>');
        expect(await isDisabled(page)).toBe(false);
    });

    test('disabled is the custom state :state(disabled), the frame has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-time-picker value="09:30" disabled></pdx-time-picker>');
        expect(await isDisabled(page)).toBe(true);
        expect(await frame(page).evaluate((f) => [...f.classList])).not.toContain('disabled');
        expect(await frame(page).evaluate((f) => getComputedStyle(f).pointerEvents)).toBe('none');
    });

    test('disabled set after the mount follows: the state, and every segment leaves the tab order', async ({ page }) => {
        await mount(page, '<pdx-time-picker value="09:30"></pdx-time-picker>');
        await host(page).evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(() => isDisabled(page)).toBe(true);
        for (const seg of await page.getByRole('spinbutton').all()) await expect(seg).toHaveAttribute('tabindex', '-1');
        await host(page).evaluate((el) => el.removeAttribute('disabled'));
        await expect.poll(() => isDisabled(page)).toBe(false);
        for (const seg of await page.getByRole('spinbutton').all()) await expect(seg).toHaveAttribute('tabindex', '0');
    });

    test('no popup: it never announces open-change', async ({ page }) => {
        await mount(page, '<pdx-time-picker value="09:30"></pdx-time-picker>');
        await host(page).evaluate((el) => {
            const seen: unknown[] = [];
            (window as unknown as { __seen: unknown[] }).__seen = seen;
            el.addEventListener('open-change', () => seen.push(1));
        });
        const hour = page.getByRole('spinbutton', { name: 'Hour' });
        await hour.focus();
        await page.keyboard.press('ArrowUp');
        await expect(host(page)).toHaveJSProperty('value', '10:30');
        expect(await page.evaluate(() => (window as unknown as { __seen: unknown[] }).__seen)).toEqual([]);
    });
});

test.describe('A-rules', () => {
    test('A1 — in a required pdx-form-field the group is named by the label, and is not marked required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Start" required><pdx-time-picker></pdx-time-picker></pdx-form-field>');
        await expect(frame(page)).toHaveAccessibleName(/^Start/);
        await expect(frame(page)).not.toHaveAttribute('aria-required', /.*/);
    });

    test('A2 — in a pdx-form-field in error the group is described by the message, and is not marked invalid', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Start" error="Pick a start time" show-error><pdx-time-picker></pdx-time-picker></pdx-form-field>');
        await expect(frame(page)).toHaveAccessibleDescription('Pick a start time');
        await expect(frame(page)).not.toHaveAttribute('aria-invalid', /.*/);
    });
});

test.describe('parts', () => {
    test('the frame, the segments, the arrows and the separators are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-time-picker value="09:30" format="12h"></pdx-time-picker>');
        const parts = await page.locator('#f pdx-time-picker [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['arrow', 'root', 'segment', 'separator']);
        await expect(frame(page)).toHaveAttribute('role', 'group');
        // Hour, minute and the AM/PM period: each a spinbutton.
        await expect(page.locator('#f pdx-time-picker [data-part="segment"]')).toHaveCount(3);
        for (const seg of await page.locator('#f pdx-time-picker [data-part="segment"]').all()) await expect(seg).toHaveAttribute('role', 'spinbutton');
    });
});
