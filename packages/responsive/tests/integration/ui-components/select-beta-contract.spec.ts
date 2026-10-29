// pdx-select on the beta contract (#287): its visual states are custom states, `:state(name)` on the
// host, and its frame and popup carry no state class of their own; its popup is announced as an
// overlay's, `open-change` `{ value }` and `:state(open)`. And the A-rules that apply to a picker
// (docs/language/beta/agents.md):
//   - A1, a required field marks the combobox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message;
//   - A3, a list that renders part of its options gives each its position among all of them;
//   - A4, while loading the list is `aria-busy`.
// Measured in Chromium: `:state()`, the accessible description and the virtualized list are not
// happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f">, give every select `options`, and wait for them to render. */
async function mount(page: Page, html: string, options: unknown[] = OPTIONS): Promise<void> {
    await page.evaluate(async ({ markup, opts }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const s of f.querySelectorAll('pdx-select')) (s as unknown as { options: unknown[] }).options = opts;
    }, { markup: html, opts: options });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
];

/** The host's custom states among `names`, and the classes of its frame and its popup. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; frame: string[]; popup: string[] }> {
    return page.locator('#f pdx-select').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        frame: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
        popup: [...(host.querySelector('[data-part="popup"]')?.classList ?? [])],
    }), names);
}

/** Record every `open-change` the first select dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator('#f pdx-select').first().evaluate((host) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        host.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

const STATES = ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'multiple'];
const STATE_CLASSES = ['error', 'success', 'warning', 'disabled', 'readonly', 'multiple', 'open'];

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=select-beta-contract'); });

test.describe('states', () => {
    test('control — a plain select is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick"></pdx-select>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    for (const [attr, state] of [
        ['error', 'invalid'], ['success', 'success'], ['warning', 'warning'],
        ['disabled', 'disabled'], ['readonly', 'readonly'], ['loading', 'loading'], ['multiple', 'multiple'],
    ] as const) {
        test(`${attr} is the custom state :state(${state}), and no class on the frame`, async ({ page }) => {
            await mount(page, `<pdx-select label="Pick" ${attr}></pdx-select>`);
            const r = await read(page, STATES);
            expect(r.states).toEqual([state]);
            expect(r.frame.filter((c) => STATE_CLASSES.includes(c))).toEqual([]);
        });
    }

    test('the design CSS draws each state from :state(): error, success and warning colour the frame', async ({ page }) => {
        await mount(page, `
            <pdx-select label="Plain" data-k="plain"></pdx-select>
            <pdx-select label="Error" data-k="error" error></pdx-select>
            <pdx-select label="Success" data-k="success" success></pdx-select>
            <pdx-select label="Warning" data-k="warning" warning></pdx-select>
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

    test('disabled and readonly keep their cursors, drawn from :state()', async ({ page }) => {
        await mount(page, `
            <pdx-select label="Off" data-k="off" disabled></pdx-select>
            <pdx-select label="Read" data-k="ro" readonly></pdx-select>`);
        const cursors = await page.evaluate(() => ['off', 'ro'].map((k) =>
            getComputedStyle(document.querySelector(`#f [data-k="${k}"] [data-part="root"]`)!).cursor));
        expect(cursors).toEqual(['not-allowed', 'default']);
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('a click opens it and a second closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick"></pdx-select>');
        const seen = await recordOpenChange(page);
        const trigger = page.locator('#f pdx-select [data-part="root"]');
        await trigger.click();
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeVisible();
        expect((await read(page, STATES)).states).toEqual(['open']);
        expect((await read(page, STATES)).popup).not.toContain('open');
        await trigger.click();
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeHidden();
        expect((await read(page, STATES)).states).toEqual([]);
        expect(await seen()).toEqual([true, false]);
    });

    test('ArrowDown opens it and Escape closes it, with focus on the trigger: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick"></pdx-select>');
        const seen = await recordOpenChange(page);
        const box = page.getByRole('combobox', { name: 'Pick' });
        await box.focus();
        await page.keyboard.press('ArrowDown');
        await expect(box).toHaveAttribute('aria-expanded', 'true');
        expect((await read(page, STATES)).states).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect(box).toHaveAttribute('aria-expanded', 'false');
        await expect(box).toBeFocused();
        expect(await seen()).toEqual([true, false]);
    });

    test('picking an option closes it: open-change false once, and no pdx-open or pdx-close is dispatched', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick"></pdx-select>');
        const seen = await recordOpenChange(page);
        await page.locator('#f pdx-select').evaluate((host) => {
            const alpha: string[] = [];
            (window as unknown as { __alpha: string[] }).__alpha = alpha;
            for (const n of ['pdx-open', 'pdx-close']) host.addEventListener(n, () => alpha.push(n));
        });
        await page.locator('#f pdx-select [data-part="root"]').click();
        await page.getByRole('option', { name: 'Beta' }).click();
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeHidden();
        expect(await seen()).toEqual([true, false]);
        expect(await page.evaluate(() => (window as unknown as { __alpha: string[] }).__alpha)).toEqual([]);
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick"></pdx-select>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => page.locator('#f pdx-select').evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
        await call('show');
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeVisible();
        await call('close');
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeHidden();
        await call('toggle');
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeVisible();
        await call('toggle');
        await expect(page.locator('#f pdx-select [data-part="popup"]')).toBeHidden();
        expect(await seen()).toEqual([true, false, true, false]);
    });
});

test.describe('A-rules', () => {
    test('A1 — inside a required pdx-form-field the combobox is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Country" required><pdx-select></pdx-select></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Country/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Country"><pdx-select></pdx-select></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Country/ })).not.toHaveAttribute('aria-required', 'true');
    });

    test('A2 — inside a pdx-form-field in error the combobox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Country" error="Choose a country" show-error><pdx-select></pdx-select></pdx-form-field>');
        const box = page.getByRole('combobox', { name: /Country/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Choose a country');
    });

    test('A2 — the select\'s own error marks it aria-invalid outside a field, and only while it is set', async ({ page }) => {
        await mount(page, '<pdx-select label="Country" error></pdx-select>');
        const box = page.getByRole('combobox', { name: 'Country' });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await page.locator('#f pdx-select').evaluate((el) => el.removeAttribute('error'));
        await expect(box).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('A3 — a virtualized list of 2000 options gives each rendered option its position among the 2000', async ({ page }) => {
        const many = Array.from({ length: 2000 }, (_, i) => ({ value: `v${i}`, label: `Option ${i + 1}` }));
        await mount(page, '<pdx-select label="Many"></pdx-select>', many);
        await page.locator('#f pdx-select [data-part="root"]').click();
        const options = page.locator('#f pdx-select [role="option"]');
        await expect(options.first()).toBeVisible();
        const read = await options.evaluateAll((els) => els.map((e) => ({
            size: e.getAttribute('aria-setsize'), pos: e.getAttribute('aria-posinset'), text: e.textContent?.trim(),
        })));
        expect(read.length, 'the list renders part of the 2000').toBeLessThan(2000);
        for (const o of read) {
            expect(o.size).toBe('2000');
            expect(o.text).toBe(`Option ${o.pos}`);
        }
    });

    test('A4 — while loading the list is aria-busy; after, it is not', async ({ page }) => {
        await mount(page, '<pdx-select label="City" loading></pdx-select>');
        const list = page.locator('#f pdx-select [role="listbox"]');
        await expect(list).toHaveAttribute('aria-busy', 'true');
        await page.locator('#f pdx-select').evaluate((el) => el.removeAttribute('loading'));
        await expect(list).not.toHaveAttribute('aria-busy', 'true');
    });
});

test.describe('parts', () => {
    test('the trigger, the popup, the list and each drawn piece are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-select label="Pick" multiple searchable clearable loading value="a"></pdx-select>');
        await page.locator('#f pdx-select').evaluate((el) => { (el as unknown as { value: string[] }).value = ['a']; });
        await page.locator('#f pdx-select [data-part="root"]').click();
        await expect(page.locator('#f pdx-select [data-part="option"]').first()).toBeVisible();
        const parts = await page.locator('#f pdx-select [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['clear', 'list', 'option', 'popup', 'root', 'search', 'spinner', 'tag']);
        await expect(page.locator('#f pdx-select [data-part="list"]')).toHaveAttribute('role', 'listbox');
    });
});
