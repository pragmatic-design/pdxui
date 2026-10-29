// pdx-color-picker on the beta contract (#287): its visual states are custom states, `:state(name)` on
// the host, and its swatch carries no state class of its own; its popup is announced as an overlay's,
// `open-change` `{ value }` and `:state(open)`, and driven by the overlay verbs. Inline, it has no
// popup and never enters `:state(open)`. And the A-rules that apply to it
// (docs/language/beta/agents.md). Its swatch is a button, which carries neither aria-required nor
// aria-invalid:
//   - A1, inside a required pdx-form-field the swatch is named by the label, its marker with it;
//   - A2, inside a pdx-form-field in error the swatch is described by the message.
// Measured in Chromium: `:state()`, the accessible name and description are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f">, give every picker `props` before it draws, and wait for it. */
async function mount(page: Page, html: string, props: Record<string, unknown> = {}): Promise<void> {
    await page.evaluate(async ({ markup, values }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const p of f.querySelectorAll('pdx-color-picker')) Object.assign(p, values);
    }, { markup: html, values: props });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const host = (page: Page) => page.locator('#f pdx-color-picker');
const swatch = (page: Page) => page.locator('#f pdx-color-picker > [data-part="root"]');
const popup = (page: Page) => page.locator('#f pdx-color-picker > [data-part="popup"]');
const STATES = ['open', 'disabled', 'readonly'];
const states = (page: Page) => host(page).evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), STATES);

/** Record every `open-change` the picker dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await host(page).evaluate((h) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        h.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=color-picker-beta-contract'); });

test.describe('states', () => {
    test('control — a plain picker is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6"></pdx-color-picker>');
        expect(await states(page)).toEqual([]);
    });

    test('disabled is the custom state :state(disabled), the swatch has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6" disabled></pdx-color-picker>');
        expect(await states(page)).toEqual(['disabled']);
        expect(await swatch(page).evaluate((s) => [...s.classList])).not.toContain('disabled');
        expect(await swatch(page).evaluate((s) => getComputedStyle(s).opacity)).toBe('0.5');
    });

    test('readonly is the custom state :state(readonly)', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6" readonly></pdx-color-picker>');
        expect(await states(page)).toEqual(['readonly']);
    });

    test('disabled set after the mount follows', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6"></pdx-color-picker>');
        await host(page).evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(() => states(page)).toEqual(['disabled']);
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('a click opens it and a second closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6"></pdx-color-picker>');
        const seen = await recordOpenChange(page);
        await swatch(page).click();
        await expect(popup(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await expect(swatch(page)).toHaveAttribute('aria-expanded', 'true');
        await swatch(page).click();
        await expect(popup(page)).toBeHidden();
        expect(await states(page)).toEqual([]);
        expect(await seen()).toEqual([true, false]);
    });

    test('Escape closes it with focus back on the swatch: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6"></pdx-color-picker>');
        const seen = await recordOpenChange(page);
        await swatch(page).focus();
        await page.keyboard.press('Enter');
        await expect(popup(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popup(page)).toBeHidden();
        await expect(swatch(page)).toBeFocused();
        expect(await seen()).toEqual([true, false]);
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs; open() is gone', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6"></pdx-color-picker>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => host(page).evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
        await call('show');
        await expect(popup(page)).toBeVisible();
        await call('close');
        await expect(popup(page)).toBeHidden();
        await call('toggle');
        await expect(popup(page)).toBeVisible();
        await call('toggle');
        await expect(popup(page)).toBeHidden();
        expect(await seen()).toEqual([true, false, true, false]);
        expect(await host(page).evaluate((h) => 'open' in h)).toBe(false);
    });

    test('inline, there is no popup to open: never :state(open), and show() does nothing', async ({ page }) => {
        await mount(page, '<pdx-color-picker inline value="#3b82f6"></pdx-color-picker>');
        const seen = await recordOpenChange(page);
        await host(page).evaluate((h) => (h as unknown as { show(): void }).show());
        expect(await states(page)).toEqual([]);
        expect(await seen()).toEqual([]);
    });
});

test.describe('A-rules', () => {
    test('A1 — in a required pdx-form-field the swatch is named by the label', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Brand colour" required><pdx-color-picker value="#3b82f6"></pdx-color-picker></pdx-form-field>');
        await expect(swatch(page)).toHaveAccessibleName(/^Brand colour/);
    });

    test('A2 — in a pdx-form-field in error the swatch is described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Brand colour" error="Pick a darker colour" show-error><pdx-color-picker value="#3b82f6"></pdx-color-picker></pdx-form-field>');
        await expect(swatch(page)).toHaveAccessibleDescription('Pick a darker colour');
    });
});

test.describe('parts', () => {
    test('the swatch, the popup, the area, the sliders, the field, the clear button and the presets are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-color-picker label="Brand" value="#3b82f6" show-alpha clearable></pdx-color-picker>', { presets: ['#ef4444', '#22c55e'] });
        await host(page).evaluate((h) => (h as unknown as { show(): void }).show());
        await expect(popup(page)).toBeVisible();
        const parts = await page.locator('#f pdx-color-picker [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['alpha', 'area', 'clear', 'hue', 'input', 'popup', 'preset', 'root']);
        await expect(popup(page)).toHaveAttribute('role', 'dialog');
        await expect(page.locator('#f pdx-color-picker [data-part="area"]')).toHaveAttribute('role', 'slider');
    });
});
