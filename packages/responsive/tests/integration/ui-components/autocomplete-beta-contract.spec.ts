// pdx-autocomplete on the beta contract (#287): its visual states are custom states, `:state(name)` on
// the host, and its frame and popup carry no state class of their own; its popup is announced as an
// overlay's, `open-change` `{ value }` and `:state(open)`, and driven by the overlay verbs. And the
// A-rules that apply to it (docs/language/beta/agents.md):
//   - A1, a required field marks the combobox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message;
//   - A3, a list cut at `max-items` gives each option its position among all the matches;
//   - A4, while loading the list is `aria-busy`.
// Measured in Chromium: `:state()`, the accessible description and the computed border are not
// happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const FRUIT = ['Apple', 'Apricot', 'Avocado', 'Banana', 'Blackberry', 'Cherry'];

/** Put `html` in a fresh <div id="f">, give every autocomplete `suggestions`, and wait for them to render. */
async function mount(page: Page, html: string, suggestions: unknown[] = FRUIT): Promise<void> {
    await page.evaluate(async ({ markup, items }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const a of f.querySelectorAll('pdx-autocomplete')) (a as unknown as { suggestions: unknown[] }).suggestions = items;
    }, { markup: html, items: suggestions });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The host's custom states among `names`, and the classes of its frame and its popup. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; frame: string[]; popup: string[] }> {
    return page.locator('#f pdx-autocomplete').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        frame: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
        popup: [...(host.querySelector('[data-part="popup"]')?.classList ?? [])],
    }), names);
}

/** Record every `open-change` the first autocomplete dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator('#f pdx-autocomplete').first().evaluate((host) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        host.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

const STATES = ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'];
const STATE_CLASSES = ['pdx-input-error', 'pdx-input-success', 'pdx-input-warning', 'disabled', 'readonly', 'focused', 'open'];

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=autocomplete-beta-contract'); });

test.describe('states', () => {
    test('control — a plain autocomplete is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit"></pdx-autocomplete>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    for (const [attr, state] of [
        ['error', 'invalid'], ['success', 'success'], ['warning', 'warning'],
        ['disabled', 'disabled'], ['readonly', 'readonly'], ['loading', 'loading'],
    ] as const) {
        test(`${attr} is the custom state :state(${state}), and no class on the frame`, async ({ page }) => {
            await mount(page, `<pdx-autocomplete label="Fruit" ${attr}></pdx-autocomplete>`);
            const r = await read(page, STATES);
            expect(r.states).toEqual([state]);
            expect(r.frame.filter((c) => STATE_CLASSES.includes(c))).toEqual([]);
        });
    }

    test('focus puts no class on the frame', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit"></pdx-autocomplete>');
        await page.getByRole('combobox', { name: 'Fruit' }).focus();
        expect((await read(page, STATES)).frame.filter((c) => STATE_CLASSES.includes(c))).toEqual([]);
    });

    test('the design CSS draws each state from :state(): error, success and warning colour the frame', async ({ page }) => {
        await mount(page, `
            <pdx-autocomplete label="Plain" data-k="plain"></pdx-autocomplete>
            <pdx-autocomplete label="Error" data-k="error" error></pdx-autocomplete>
            <pdx-autocomplete label="Success" data-k="success" success></pdx-autocomplete>
            <pdx-autocomplete label="Warning" data-k="warning" warning></pdx-autocomplete>
            <span data-k="danger" style="color: var(--pdx-color-danger)"></span>
            <span data-k="ok" style="color: var(--pdx-color-success)"></span>
            <span data-k="warn" style="color: var(--pdx-color-warning)"></span>`);
        const colours = await page.evaluate(() => {
            const at = (k: string) => document.querySelector(`#f [data-k="${k}"]`)!;
            const frame = (k: string) => getComputedStyle(at(k).querySelector('[data-part="root"]')!).borderTopColor;
            const ink = (k: string) => getComputedStyle(at(k)).color;
            return {
                plain: frame('plain'), error: frame('error'), success: frame('success'), warning: frame('warning'),
                danger: ink('danger'), ok: ink('ok'), warn: ink('warn'),
            };
        });
        expect(colours.error).toBe(colours.danger);
        expect(colours.success).toBe(colours.ok);
        expect(colours.warning).toBe(colours.warn);
        expect(colours.plain).not.toBe(colours.danger);
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('typing opens it and Escape closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit"></pdx-autocomplete>');
        const seen = await recordOpenChange(page);
        const box = page.getByRole('combobox', { name: 'Fruit' });
        await box.pressSequentially('ap');
        await expect(box).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeVisible();
        expect((await read(page, STATES)).states).toEqual(['open']);
        expect((await read(page, STATES)).popup).not.toContain('open');
        await page.keyboard.press('Escape');
        await expect(box).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeHidden();
        expect((await read(page, STATES)).states).toEqual([]);
        expect(await seen(), 'a keystroke that keeps it open announces nothing').toEqual([true, false]);
    });

    test('picking a suggestion with the mouse closes it: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit"></pdx-autocomplete>');
        const seen = await recordOpenChange(page);
        await page.getByRole('combobox', { name: 'Fruit' }).pressSequentially('ch');
        await page.getByRole('option', { name: 'Cherry' }).click();
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeHidden();
        expect(await seen()).toEqual([true, false]);
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit"></pdx-autocomplete>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => page.locator('#f pdx-autocomplete').evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
        await call('show');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeVisible();
        await call('close');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeHidden();
        await call('toggle');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeVisible();
        await call('toggle');
        await expect(page.locator('#f pdx-autocomplete [data-part="popup"]')).toBeHidden();
        expect(await seen()).toEqual([true, false, true, false]);
    });
});

test.describe('A-rules', () => {
    test('A1 — inside a required pdx-form-field the combobox is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Fruit" required><pdx-autocomplete></pdx-autocomplete></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Fruit/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Fruit"><pdx-autocomplete></pdx-autocomplete></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Fruit/ })).not.toHaveAttribute('aria-required', 'true');
    });

    test('A2 — inside a pdx-form-field in error the combobox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Fruit" error="Choose a fruit" show-error><pdx-autocomplete></pdx-autocomplete></pdx-form-field>');
        const box = page.getByRole('combobox', { name: /Fruit/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Choose a fruit');
    });

    test('A2 — the autocomplete\'s own error marks it aria-invalid outside a field, and only while it is set', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit" error></pdx-autocomplete>');
        const box = page.getByRole('combobox', { name: 'Fruit' });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await page.locator('#f pdx-autocomplete').evaluate((el) => el.removeAttribute('error'));
        await expect(box).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('A3 — a list cut at max-items gives each option its position among all the matches', async ({ page }) => {
        const many = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}`);
        await mount(page, '<pdx-autocomplete label="Items" max-items="5"></pdx-autocomplete>', many);
        await page.getByRole('combobox', { name: 'Items' }).pressSequentially('item');
        const options = page.locator('#f pdx-autocomplete [role="option"]');
        await expect(options).toHaveCount(5);
        const read = await options.evaluateAll((els) => els.map((e) => [e.getAttribute('aria-setsize'), e.getAttribute('aria-posinset')]));
        expect(read).toEqual([['40', '1'], ['40', '2'], ['40', '3'], ['40', '4'], ['40', '5']]);
    });

    test('A4 — while loading the list is aria-busy; after, it is not', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="City" loading></pdx-autocomplete>');
        const list = page.locator('#f pdx-autocomplete [role="listbox"]');
        await expect(list).toHaveAttribute('aria-busy', 'true');
        await page.locator('#f pdx-autocomplete').evaluate((el) => el.removeAttribute('loading'));
        await expect(list).not.toHaveAttribute('aria-busy', 'true');
    });
});

test.describe('parts', () => {
    test('the frame, the input, the popup, the list and each drawn piece are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-autocomplete label="Fruit" clearable loading></pdx-autocomplete>');
        await page.getByRole('combobox', { name: 'Fruit' }).pressSequentially('ap');
        await expect(page.locator('#f pdx-autocomplete [data-part="option"]').first()).toBeVisible();
        const parts = await page.locator('#f pdx-autocomplete [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['clear', 'input', 'list', 'option', 'popup', 'root', 'spinner']);
        await expect(page.locator('#f pdx-autocomplete [data-part="input"]')).toHaveAttribute('role', 'combobox');
    });
});
