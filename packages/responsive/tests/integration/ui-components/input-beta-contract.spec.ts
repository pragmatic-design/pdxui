// pdx-input on the beta contract (#286): its visual states are custom states, `:state(name)` on the
// host, and its frame carries no state class of its own; the design CSS draws each state from the
// custom state. And the A-rules that apply to a text field (docs/language/beta/agents.md):
//   - A1, a required field marks the textbox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message, and the input's own
//     `error` marks it outside a field too;
//   - A4, while `loading` the textbox is `aria-busy`, and the status it renders exists only then.
// Measured in Chromium: `:state()`, the accessible description and the computed border are not
// happy-dom's to tell.
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

/** The host's custom states among `names`, and the frame's classes. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; frame: string[] }> {
    return page.locator('#f pdx-input').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        frame: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
    }), names);
}

const STATES = ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'];
const STATE_CLASSES = ['error', 'success', 'warning', 'disabled', 'readonly'];

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=input-beta-contract'); });

test.describe('states', () => {
    test('control — a plain input is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-input></pdx-input>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    for (const [attr, state] of [
        ['error', 'invalid'], ['success', 'success'], ['warning', 'warning'],
        ['disabled', 'disabled'], ['readonly', 'readonly'], ['loading', 'loading'],
    ] as const) {
        test(`${attr} is the custom state :state(${state}), and no class on the frame`, async ({ page }) => {
            await mount(page, `<pdx-input ${attr}></pdx-input>`);
            const r = await read(page, STATES);
            expect(r.states).toEqual([state]);
            expect(r.frame.filter((c) => STATE_CLASSES.includes(c))).toEqual([]);
        });
    }

    test('past maxlength the input is :state(over-limit), its count has no class for it and is drawn in the danger ink', async ({ page }) => {
        await mount(page, `
            <pdx-input show-count maxlength="3" value="abcd"></pdx-input>
            <span data-k="ink" style="color: var(--pdx-color-danger-ink)"></span>`);
        const r = await page.evaluate(() => {
            const host = document.querySelector('#f pdx-input')!;
            const count = host.querySelector('[data-part="count"]')!;
            return {
                over: host.matches(':state(over-limit)'),
                classes: [...count.classList],
                colour: getComputedStyle(count).color,
                ink: getComputedStyle(document.querySelector('#f [data-k="ink"]')!).color,
            };
        });
        expect(r.over).toBe(true);
        expect(r.classes).toEqual(['pdx-input-count']);
        expect(r.colour).toBe(r.ink);
    });

    test('control — within maxlength it is not over-limit', async ({ page }) => {
        await mount(page, '<pdx-input show-count maxlength="3" value="abc"></pdx-input>');
        expect(await page.locator('#f pdx-input').evaluate((h) => h.matches(':state(over-limit)'))).toBe(false);
    });

    test('a state follows its prop: set, then cleared', async ({ page }) => {
        await mount(page, '<pdx-input></pdx-input>');
        await page.locator('#f pdx-input').evaluate((el) => el.setAttribute('warning', ''));
        await expect.poll(async () => (await read(page, STATES)).states).toEqual(['warning']);
        await page.locator('#f pdx-input').evaluate((el) => el.removeAttribute('warning'));
        await expect.poll(async () => (await read(page, STATES)).states).toEqual([]);
    });

    test('the design CSS draws each state from :state(): error, success and warning colour the frame', async ({ page }) => {
        await mount(page, `
            <pdx-input data-k="plain"></pdx-input>
            <pdx-input data-k="error" error></pdx-input>
            <pdx-input data-k="success" success></pdx-input>
            <pdx-input data-k="warning" warning></pdx-input>
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

test.describe('A-rules', () => {
    test('A1 — inside a required pdx-form-field the textbox is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Name" required><pdx-input></pdx-input></pdx-form-field>');
        await expect(page.getByRole('textbox', { name: /Name/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Name"><pdx-input></pdx-input></pdx-form-field>');
        await expect(page.getByRole('textbox', { name: /Name/ })).not.toHaveAttribute('aria-required', 'true');
    });

    // A field's error shows once it is touched, or with `show-error` (pdx-form-field's own gate).
    test('A2 — inside a pdx-form-field in error the textbox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Email" error="Enter an email address" show-error><pdx-input></pdx-input></pdx-form-field>');
        const box = page.getByRole('textbox', { name: /Email/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Enter an email address');
    });

    test('A2 — the input\'s own error marks it aria-invalid outside a field, and only while it is set', async ({ page }) => {
        await mount(page, '<pdx-input aria-label="Code" error></pdx-input>');
        const box = page.getByRole('textbox', { name: 'Code' });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await page.locator('#f pdx-input').evaluate((el) => el.removeAttribute('error'));
        await expect(box).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('A4 — while loading the textbox is aria-busy and a status is rendered; after, neither', async ({ page }) => {
        await mount(page, '<pdx-input aria-label="City" loading></pdx-input>');
        const box = page.getByRole('textbox', { name: 'City' });
        await expect(box).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#f pdx-input [role="status"]')).toHaveCount(1);
        await page.locator('#f pdx-input').evaluate((el) => el.removeAttribute('loading'));
        await expect(box).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#f pdx-input [role="status"]')).toHaveCount(0);
    });
});

test.describe('parts', () => {
    test('the frame, the textbox and each drawn piece are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-input prefix="$" suffix="kg" clearable loading show-count value="12"></pdx-input>');
        const parts = await page.locator('#f pdx-input [data-part]').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')).sort());
        expect(parts).toEqual(['clear', 'count', 'input', 'prefix', 'root', 'spinner', 'suffix']);
        await expect(page.locator('#f pdx-input [data-part="input"]')).toHaveJSProperty('tagName', 'INPUT');
    });
});
