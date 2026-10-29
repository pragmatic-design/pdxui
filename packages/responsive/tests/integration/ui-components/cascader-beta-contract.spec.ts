// pdx-cascader on the beta contract (#287): its visual states are custom states, `:state(name)` on the
// host, and its trigger carries no state class of its own; its popup is announced as an overlay's,
// `open-change` `{ value }` and `:state(open)`, and driven by the overlay verbs. And the A-rules that
// apply to it (docs/language/beta/agents.md):
//   - A1, a required field marks the combobox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message;
//   - A4, while a lazy branch loads, the list it is in is `aria-busy` and the host `:state(loading)`.
// Measured in Chromium: `:state()` and the accessible description are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const TREE = [
    { value: 'it', label: 'Italy', children: [
        { value: 'lom', label: 'Lombardy', children: [{ value: 'mi', label: 'Milan' }] },
        { value: 'laz', label: 'Lazio', children: [{ value: 'rm', label: 'Rome' }] },
    ] },
    { value: 'fr', label: 'France', children: [{ value: 'idf', label: 'Ile-de-France', children: [{ value: 'par', label: 'Paris' }] }] },
];

/** Put `html` in a fresh <div id="f">, give every cascader `options`, and wait for them to render. */
async function mount(page: Page, html: string, options: unknown[] = TREE): Promise<void> {
    await page.evaluate(async ({ markup, opts }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const c of f.querySelectorAll('pdx-cascader')) (c as unknown as { options: unknown[] }).options = opts;
    }, { markup: html, opts: options });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The host's custom states among `names`, and the trigger's classes. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; trigger: string[] }> {
    return page.locator('#f pdx-cascader').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        trigger: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
    }), names);
}

/** Record every `open-change` the first cascader dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator('#f pdx-cascader').first().evaluate((host) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        host.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

const STATES = ['open', 'disabled', 'loading'];
const popup = (page: Page) => page.locator('#f pdx-cascader [data-part="popup"]');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=cascader-beta-contract'); });

test.describe('states', () => {
    test('control — a plain cascader is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    test('disabled is the custom state :state(disabled), the trigger has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place" disabled></pdx-cascader>');
        const r = await read(page, STATES);
        expect(r.states).toEqual(['disabled']);
        expect(r.trigger).not.toContain('disabled');
        const style = await page.locator('#f pdx-cascader [data-part="root"]').evaluate((t) => ({ cursor: getComputedStyle(t).cursor, opacity: getComputedStyle(t).opacity }));
        expect(style).toEqual({ cursor: 'not-allowed', opacity: '0.5' });
    });

    test('disabled set after the mount follows: the state, and the trigger leaves the tab order', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        await page.locator('#f pdx-cascader').evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(async () => (await read(page, STATES)).states).toEqual(['disabled']);
        await expect(page.getByRole('combobox', { name: 'Place' })).toHaveAttribute('tabindex', '-1');
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('a click opens it and a second closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        const seen = await recordOpenChange(page);
        const trigger = page.getByRole('combobox', { name: 'Place' });
        await trigger.click();
        await expect(popup(page)).toBeVisible();
        expect((await read(page, STATES)).states).toEqual(['open']);
        await trigger.click();
        await expect(popup(page)).toBeHidden();
        expect((await read(page, STATES)).states).toEqual([]);
        expect(await seen()).toEqual([true, false]);
    });

    test('ArrowDown opens it and Escape closes it, with focus on the trigger: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        const seen = await recordOpenChange(page);
        const box = page.getByRole('combobox', { name: 'Place' });
        await box.focus();
        await page.keyboard.press('ArrowDown');
        await expect(box).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(box).toHaveAttribute('aria-expanded', 'false');
        await expect(box).toBeFocused();
        expect(await seen()).toEqual([true, false]);
    });

    test('picking a leaf closes it: open-change true, then false, and no pdx-open or pdx-close', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        const seen = await recordOpenChange(page);
        await page.locator('#f pdx-cascader').evaluate((host) => {
            const alpha: string[] = [];
            (window as unknown as { __alpha: string[] }).__alpha = alpha;
            for (const n of ['pdx-open', 'pdx-close']) host.addEventListener(n, () => alpha.push(n));
        });
        await page.getByRole('combobox', { name: 'Place' }).click();
        await page.getByRole('option', { name: 'Italy' }).click();
        await page.getByRole('option', { name: 'Lazio' }).click();
        await page.getByRole('option', { name: 'Rome' }).click();
        await expect(popup(page)).toBeHidden();
        expect(await seen()).toEqual([true, false]);
        expect(await page.evaluate(() => (window as unknown as { __alpha: string[] }).__alpha)).toEqual([]);
        expect(await page.locator('#f pdx-cascader').evaluate((h) => (h as unknown as { value: string[] }).value)).toEqual(['it', 'laz', 'rm']);
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => page.locator('#f pdx-cascader').evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
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
});

test.describe('A-rules', () => {
    test('A1 — inside a required pdx-form-field the combobox is aria-required', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Place" required><pdx-cascader></pdx-cascader></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Place/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Place"><pdx-cascader></pdx-cascader></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Place/ })).not.toHaveAttribute('aria-required', 'true');
    });

    test('A2 — inside a pdx-form-field in error the combobox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Place" error="Choose a place" show-error><pdx-cascader></pdx-cascader></pdx-form-field>');
        const box = page.getByRole('combobox', { name: /Place/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Choose a place');
    });

    test('A4 — while a lazy branch loads, its list is aria-busy and the host :state(loading); after, neither', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place"></pdx-cascader>', [{ value: 'it', label: 'Italy', isLeaf: false }]);
        await page.locator('#f pdx-cascader').evaluate((el) => {
            (el as unknown as { loadChildren: () => Promise<unknown[]> }).loadChildren = () => new Promise((resolve) => {
                (window as unknown as { __resolve: () => void }).__resolve = () => resolve([{ value: 'rm', label: 'Rome' }]);
            });
        });
        await page.getByRole('combobox', { name: 'Place' }).click();
        await page.getByRole('option', { name: 'Italy' }).click();
        const list = page.locator('#f pdx-cascader [role="listbox"]').first();
        await expect(list).toHaveAttribute('aria-busy', 'true');
        expect((await read(page, STATES)).states).toEqual(['open', 'loading']);
        await page.evaluate(() => (window as unknown as { __resolve: () => void }).__resolve());
        await expect(page.getByRole('option', { name: 'Rome' })).toBeVisible();
        await expect(page.locator('#f pdx-cascader [role="listbox"]').first()).not.toHaveAttribute('aria-busy', 'true');
        expect((await read(page, STATES)).states).toEqual(['open']);
    });
});

test.describe('parts', () => {
    test('the trigger, the popup, the lists, the options and the search are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-cascader label="Place" searchable value=\'["it","laz","rm"]\'></pdx-cascader>');
        await page.locator('#f pdx-cascader').evaluate((el) => { (el as unknown as { value: string[] }).value = ['it', 'laz', 'rm']; });
        await page.getByRole('combobox', { name: 'Place' }).click();
        await expect(popup(page)).toBeVisible();
        const parts = await page.locator('#f pdx-cascader [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['clear', 'list', 'option', 'popup', 'root', 'search']);
        await expect(page.locator('#f pdx-cascader [data-part="list"]').first()).toHaveAttribute('role', 'listbox');
    });
});
