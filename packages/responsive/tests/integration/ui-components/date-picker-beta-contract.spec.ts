// pdx-date-picker on the beta contract (#287): its visual states are custom states, `:state(name)` on
// the host, and its trigger carries no state class of its own; its popup is announced as an overlay's,
// `open-change` `{ value }` and `:state(open)`, and driven by the overlay verbs. And the A-rules that
// apply to it (docs/language/beta/agents.md):
//   - A1, a required field marks the combobox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message.
// Measured in Chromium: `:state()` and the accessible description are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f">, give every picker `props` before it builds, and wait for it. */
async function mount(page: Page, html: string, props: Record<string, unknown> = {}): Promise<void> {
    await page.evaluate(async ({ markup, values }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const p of f.querySelectorAll('pdx-date-picker')) Object.assign(p, values);
    }, { markup: html, values: props });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The host's custom states among `names`, and the trigger's classes. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; trigger: string[] }> {
    return page.locator('#f pdx-date-picker').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        trigger: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
    }), names);
}

/** Record every `open-change` the first picker dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator('#f pdx-date-picker').first().evaluate((host) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        host.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

const STATES = ['open', 'disabled', 'readonly'];
const popup = (page: Page) => page.locator('#f pdx-date-picker [data-part="popup"]');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=date-picker-beta-contract'); });

test.describe('states', () => {
    test('control — a plain picker is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due"></pdx-date-picker>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    test('disabled is the custom state :state(disabled), the trigger has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due" disabled></pdx-date-picker>');
        const r = await read(page, STATES);
        expect(r.states).toEqual(['disabled']);
        expect(r.trigger).not.toContain('disabled');
        const style = await page.locator('#f pdx-date-picker [data-part="root"]').evaluate((t) => ({ cursor: getComputedStyle(t).cursor, opacity: getComputedStyle(t).opacity }));
        expect(style).toEqual({ cursor: 'not-allowed', opacity: '0.5' });
    });

    test('readonly is the custom state :state(readonly), with no class on the trigger', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due" readonly></pdx-date-picker>');
        const r = await read(page, STATES);
        expect(r.states).toEqual(['readonly']);
        expect(r.trigger).not.toContain('readonly');
    });

    test('disabled set after the mount follows: the state, and the trigger leaves the tab order', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due"></pdx-date-picker>');
        await page.locator('#f pdx-date-picker').evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(async () => (await read(page, STATES)).states).toEqual(['disabled']);
        await expect(page.getByRole('combobox', { name: 'Due' })).toHaveAttribute('tabindex', '-1');
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('a click opens it and a second closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due"></pdx-date-picker>');
        const seen = await recordOpenChange(page);
        const trigger = page.getByRole('combobox', { name: 'Due' });
        await trigger.click();
        await expect(popup(page)).toBeVisible();
        expect((await read(page, STATES)).states).toEqual(['open']);
        await trigger.click();
        await expect(popup(page)).toBeHidden();
        expect((await read(page, STATES)).states).toEqual([]);
        expect(await seen()).toEqual([true, false]);
    });

    test('Enter opens it and Escape closes it, with focus back on the trigger: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due"></pdx-date-picker>');
        const seen = await recordOpenChange(page);
        const box = page.getByRole('combobox', { name: 'Due' });
        await box.focus();
        await page.keyboard.press('Enter');
        await expect(box).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(box).toHaveAttribute('aria-expanded', 'false');
        await expect(box).toBeFocused();
        expect(await seen()).toEqual([true, false]);
    });

    test('Done closes a range: open-change true, then false, and no pdx-open or pdx-close', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due" mode="daterange"></pdx-date-picker>');
        const seen = await recordOpenChange(page);
        await page.locator('#f pdx-date-picker').evaluate((host) => {
            const alpha: string[] = [];
            (window as unknown as { __alpha: string[] }).__alpha = alpha;
            for (const n of ['pdx-open', 'pdx-close']) host.addEventListener(n, () => alpha.push(n));
        });
        await page.getByRole('combobox', { name: 'Due' }).click();
        await expect(popup(page)).toBeVisible();
        await popup(page).getByRole('button', { name: 'Done' }).click();
        await expect(popup(page)).toBeHidden();
        expect(await seen()).toEqual([true, false]);
        expect(await page.evaluate(() => (window as unknown as { __alpha: string[] }).__alpha)).toEqual([]);
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs', async ({ page }) => {
        await mount(page, '<pdx-date-picker placeholder="Due"></pdx-date-picker>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => page.locator('#f pdx-date-picker').evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
        await call('show');
        await expect(popup(page)).toBeVisible();
        await call('close');
        await expect(popup(page)).toBeHidden();
        await call('toggle');
        await expect(popup(page)).toBeVisible();
        await call('toggle');
        await expect(popup(page)).toBeHidden();
        expect(await seen()).toEqual([true, false, true, false]);
    });

    test('inline, there is no popup: the picker never enters :state(open)', async ({ page }) => {
        await mount(page, '<pdx-date-picker inline></pdx-date-picker>');
        await expect(page.locator('#f pdx-date-picker pdx-calendar')).toBeVisible();
        expect((await read(page, STATES)).states).toEqual([]);
        await expect(popup(page)).toHaveCount(0);
    });
});

test.describe('A-rules', () => {
    test('A1 — inside a required pdx-form-field the combobox is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Due" required><pdx-date-picker></pdx-date-picker></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Due/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Due"><pdx-date-picker></pdx-date-picker></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Due/ })).not.toHaveAttribute('aria-required', 'true');
    });

    test('A2 — inside a pdx-form-field in error the combobox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Due" error="Choose a date" show-error><pdx-date-picker></pdx-date-picker></pdx-form-field>');
        const box = page.getByRole('combobox', { name: /Due/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Choose a date');
    });
});

test.describe('parts', () => {
    test('the trigger, its input, the clear button, the popup, the presets and the calendar are reached by data-part', async ({ page }) => {
        // Presets are read when the panel is built, so they are given before it.
        await mount(page, '<pdx-date-picker placeholder="Due" editable value="2026-03-14"></pdx-date-picker>',
            { presets: [{ label: 'Last day', value: '2026-03-13' }] });
        await page.locator('#f pdx-date-picker').evaluate((h) => (h as unknown as { show(): void }).show());
        await expect(popup(page)).toBeVisible();
        const parts = await page.locator('#f pdx-date-picker [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        // The calendar's own parts are its own: only the picker's are asserted here.
        expect(parts.filter((p) => ['calendar', 'clear', 'input', 'popup', 'preset', 'root'].includes(p!))).toEqual(['calendar', 'clear', 'input', 'popup', 'preset', 'root']);
        await expect(popup(page)).toHaveAttribute('role', 'dialog');
    });
});
