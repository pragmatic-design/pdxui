// pdx-tree-select on the beta contract (#287): its visual states are custom states, `:state(name)` on
// the host, and its trigger carries no state class of its own; its popup is announced as an overlay's,
// `open-change` `{ value }` and `:state(open)`, and driven by the overlay verbs. And the A-rules that
// apply to it (docs/language/beta/agents.md):
//   - A1, a required field marks the combobox `aria-required`;
//   - A2, a field in error marks it `aria-invalid` and describes it by the message;
//   - A3, a tree whose collapsed branches hide part of the nodes gives each its level, set size and position;
//   - A4, while a lazy branch loads, the tree is `aria-busy` and the host `:state(loading)`.
// Measured in Chromium: `:state()` and the accessible description are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const TREE = [
    { value: 'eng', label: 'Engineering', children: [
        { value: 'fe', label: 'Frontend' },
        { value: 'be', label: 'Backend' },
    ] },
    { value: 'ops', label: 'Operations' },
];

/** Put `html` in a fresh <div id="f">, give every tree-select `options`, and wait for them to render. */
async function mount(page: Page, html: string, options: unknown[] = TREE): Promise<void> {
    await page.evaluate(async ({ markup, opts }) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const t of f.querySelectorAll('pdx-tree-select')) (t as unknown as { options: unknown[] }).options = opts;
    }, { markup: html, opts: options });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The host's custom states among `names`, and the trigger's classes. */
async function read(page: Page, names: string[]): Promise<{ states: string[]; trigger: string[] }> {
    return page.locator('#f pdx-tree-select').first().evaluate((host, ns) => ({
        states: ns.filter((n) => host.matches(`:state(${n})`)),
        trigger: [...(host.querySelector('[data-part="root"]')?.classList ?? [])],
    }), names);
}

/** Record every `open-change` the first tree-select dispatches, from now on. */
async function recordOpenChange(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator('#f pdx-tree-select').first().evaluate((host) => {
        const seen: unknown[] = [];
        (window as unknown as { __openChange: unknown[] }).__openChange = seen;
        host.addEventListener('open-change', (e) => seen.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __openChange: unknown[] }).__openChange);
}

const STATES = ['open', 'disabled', 'loading'];
const popup = (page: Page) => page.locator('#f pdx-tree-select [data-part="popup"]');
const row = (page: Page, label: string) => page.locator('#f pdx-tree-select [role="treeitem"]').filter({ hasText: label });

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=tree-select-beta-contract'); });

test.describe('states', () => {
    test('control — a plain tree-select is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        expect((await read(page, STATES)).states).toEqual([]);
    });

    test('disabled is the custom state :state(disabled), and the trigger has no class for it', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team" disabled></pdx-tree-select>');
        const r = await read(page, STATES);
        expect(r.states).toEqual(['disabled']);
        expect(r.trigger).not.toContain('disabled');
        expect(await page.locator('#f pdx-tree-select [data-part="root"]').evaluate((t) => getComputedStyle(t).cursor)).toBe('not-allowed');
    });

    test('disabled set after the mount follows: the state, and the trigger leaves the tab order', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        await page.locator('#f pdx-tree-select').evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(async () => (await read(page, STATES)).states).toEqual(['disabled']);
        await expect(page.getByRole('combobox', { name: 'Team' })).toHaveAttribute('tabindex', '-1');
    });
});

test.describe('the popup, an overlay\'s open state', () => {
    test('a click opens it and a second closes it: open-change true, then false, once each; :state(open) while open', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        const seen = await recordOpenChange(page);
        const trigger = page.getByRole('combobox', { name: 'Team' });
        await trigger.click();
        await expect(popup(page)).toBeVisible();
        expect((await read(page, STATES)).states).toEqual(['open']);
        await trigger.click();
        await expect(popup(page)).toBeHidden();
        expect((await read(page, STATES)).states).toEqual([]);
        expect(await seen()).toEqual([true, false]);
    });

    test('ArrowDown opens it and Escape closes it, with focus on the trigger: open-change true, then false', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        const seen = await recordOpenChange(page);
        const box = page.getByRole('combobox', { name: 'Team' });
        await box.focus();
        await page.keyboard.press('ArrowDown');
        await expect(box).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(box).toHaveAttribute('aria-expanded', 'false');
        await expect(box).toBeFocused();
        expect(await seen()).toEqual([true, false]);
    });

    test('picking a node closes it: open-change true, then false, and no pdx-open or pdx-close', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        const seen = await recordOpenChange(page);
        await page.locator('#f pdx-tree-select').evaluate((host) => {
            const alpha: string[] = [];
            (window as unknown as { __alpha: string[] }).__alpha = alpha;
            for (const n of ['pdx-open', 'pdx-close']) host.addEventListener(n, () => alpha.push(n));
        });
        await page.getByRole('combobox', { name: 'Team' }).click();
        await row(page, 'Operations').click();
        await expect(popup(page)).toBeHidden();
        expect(await seen()).toEqual([true, false]);
        expect(await page.evaluate(() => (window as unknown as { __alpha: string[] }).__alpha)).toEqual([]);
        expect(await page.locator('#f pdx-tree-select').evaluate((h) => (h as unknown as { value: string }).value)).toBe('ops');
    });

    test('show(), close() and toggle() drive it, as an overlay\'s verbs', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        const seen = await recordOpenChange(page);
        const call = (m: string) => page.locator('#f pdx-tree-select').evaluate((h, name) => (h as unknown as Record<string, () => void>)[name](), m);
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
        await mount(page, '<pdx-form-field label="Team" required><pdx-tree-select></pdx-tree-select></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Team/ })).toHaveAttribute('aria-required', 'true');
    });

    test('A1 control — outside a required field it is not', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Team"><pdx-tree-select></pdx-tree-select></pdx-form-field>');
        await expect(page.getByRole('combobox', { name: /Team/ })).not.toHaveAttribute('aria-required', 'true');
    });

    test('A2 — inside a pdx-form-field in error the combobox is aria-invalid and described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Team" error="Choose a team" show-error><pdx-tree-select></pdx-tree-select></pdx-form-field>');
        const box = page.getByRole('combobox', { name: /Team/ });
        await expect(box).toHaveAttribute('aria-invalid', 'true');
        await expect(box).toHaveAccessibleDescription('Choose a team');
    });

    test('A3 — each node carries its level, set size and position, the collapsed branch hiding its children', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>');
        await page.getByRole('combobox', { name: 'Team' }).click();
        await expect(row(page, 'Engineering')).toHaveAttribute('aria-expanded', 'false');
        const roots = await page.locator('#f pdx-tree-select [role="treeitem"]').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-level'), e.getAttribute('aria-setsize'), e.getAttribute('aria-posinset')]));
        expect(roots).toEqual([['1', '2', '1'], ['1', '2', '2']]);
        await row(page, 'Engineering').locator('[data-part="toggle"]').click();
        await expect(row(page, 'Backend')).toHaveAttribute('aria-level', '2');
        await expect(row(page, 'Backend')).toHaveAttribute('aria-setsize', '2');
        await expect(row(page, 'Backend')).toHaveAttribute('aria-posinset', '2');
    });

    test('A4 — while a lazy branch loads, the tree is aria-busy and the host :state(loading); after, neither', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team"></pdx-tree-select>', [{ value: 'eng', label: 'Engineering', isLeaf: false }]);
        await page.locator('#f pdx-tree-select').evaluate((el) => {
            (el as unknown as { loadChildren: () => Promise<unknown[]> }).loadChildren = () => new Promise((resolve) => {
                (window as unknown as { __resolve: () => void }).__resolve = () => resolve([{ value: 'fe', label: 'Frontend' }]);
            });
        });
        await page.getByRole('combobox', { name: 'Team' }).click();
        await row(page, 'Engineering').locator('[data-part="toggle"]').click();
        const tree = page.locator('#f pdx-tree-select [role="tree"]');
        await expect(tree).toHaveAttribute('aria-busy', 'true');
        expect((await read(page, STATES)).states).toEqual(['open', 'loading']);
        await page.evaluate(() => (window as unknown as { __resolve: () => void }).__resolve());
        await expect(row(page, 'Frontend')).toBeVisible();
        await expect(tree).not.toHaveAttribute('aria-busy', 'true');
        expect((await read(page, STATES)).states).toEqual(['open']);
    });
});

test.describe('parts', () => {
    test('the trigger, the popup, the tree, its nodes and their toggles are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-tree-select label="Team" searchable></pdx-tree-select>');
        await page.locator('#f pdx-tree-select').evaluate((el) => { (el as unknown as { value: string }).value = 'ops'; });
        await page.getByRole('combobox', { name: 'Team' }).click();
        await expect(popup(page)).toBeVisible();
        const parts = await page.locator('#f pdx-tree-select [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['clear', 'node', 'popup', 'root', 'search', 'toggle', 'tree']);
        await expect(page.locator('#f pdx-tree-select [data-part="tree"]')).toHaveAttribute('role', 'tree');
    });
});
