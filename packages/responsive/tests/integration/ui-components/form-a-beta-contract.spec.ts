// The form family's first batch on the beta contract (#293): pdx-label, pdx-form-actions, pdx-input-group
// and pdx-form-section. Their conditions are states of the host and the design CSS draws them from there;
// their pieces are parts; no class on a host. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 3) => page.evaluate((count) => new Promise((r) => {
    let left = count;
    const tick = () => (--left <= 0 ? r(null) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
}), n);

/** A fresh <div id="f"> holding `html`, with the components it names loaded. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await frames(page);
}

/** The element's own parts, not those of a component nested in it. */
const ownParts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')]
    .filter((e) => { let p = e.parentElement; while (p && !p.tagName.includes('-')) p = p.parentElement; return p === h; })
    .map((e) => e.getAttribute('data-part')))].sort());

const matches = (page: Page, sel: string, state: string) => page.locator(sel).evaluate((h, s) => h.matches(`:state(${s})`), state);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-label', () => {
    test('required, optional and disabled are states; the marker is drawn from them, and the label keeps no class for them', async ({ page }) => {
        await mount(page, '<pdx-label id="r" required text="Email" description="Work address" hint="We never share it"></pdx-label><pdx-label id="o" optional disabled text="Phone"></pdx-label>');
        expect(await matches(page, '#r', 'required')).toBe(true);
        expect(await matches(page, '#o', 'optional')).toBe(true);
        expect(await matches(page, '#o', 'disabled')).toBe(true);
        const label = page.locator('#r [data-part="root"]');
        expect(await label.getAttribute('class')).toBe('pdx-field-label');
        // The required marker, from the state, through the custom property #249 introduced.
        expect(await label.evaluate((l) => getComputedStyle(l, '::after').content)).toContain('*');
        expect(await page.locator('#o [data-part="root"]').evaluate((l) => getComputedStyle(l, '::after').content)).not.toBe('none');
        expect(await ownParts(page, '#r')).toEqual(['description', 'hint', 'root']);
    });
});

test.describe('pdx-form-actions', () => {
    test('its alignment is a variant axis on the host, drawn from there; its buttons are parts', async ({ page }) => {
        await mount(page, '<pdx-form-actions id="a" align="between"></pdx-form-actions>');
        await expect(page.locator('#a')).toHaveAttribute('align', 'between');
        const bar = page.locator('#a [data-part="root"]');
        expect(await bar.getAttribute('class')).toBe('pdx-form-actions');
        expect(await bar.evaluate((b) => getComputedStyle(b).justifyContent)).toBe('space-between');
        expect(await ownParts(page, '#a')).toEqual(['reset', 'root', 'submit']);
    });
});

test.describe('pdx-input-group', () => {
    test('no class on its host; a named group, disabled as a state and aria-disabled; it still passes disabled to its children', async ({ page }) => {
        await mount(page, '<pdx-input-group id="g" disabled><pdx-input placeholder="Amount"></pdx-input><pdx-button label="Go"></pdx-button></pdx-input-group>');
        const g = page.locator('#g');
        expect(await g.getAttribute('class')).toBeNull();
        await expect(g).toHaveAttribute('role', 'group');
        await expect(g).toHaveAttribute('aria-disabled', 'true');
        expect(await matches(page, '#g', 'disabled')).toBe(true);
        await expect(page.locator('#g pdx-input')).toHaveAttribute('disabled', '');
    });

    test('keeps the class an author put on its host, on mount and when its size changes', async ({ page }) => {
        await mount(page, '<pdx-input-group id="g" class="author-x"><pdx-input placeholder="Amount"></pdx-input></pdx-input-group>');
        await expect(page.locator('#g')).toHaveAttribute('class', 'author-x');
        await page.locator('#g').evaluate((h) => h.setAttribute('size', 'sm'));
        await frames(page);
        await expect(page.locator('#g')).toHaveAttribute('class', 'author-x');
        await expect(page.locator('#g pdx-input')).toHaveAttribute('size', 'sm');
    });
});

test.describe('pdx-form-section', () => {
    test('active is a state: an inactive section is hidden, an active one shows; its pieces are parts', async ({ page }) => {
        await mount(page, '<pdx-form-section id="on" label="Personal"><input aria-label="Name"></pdx-form-section><pdx-form-section id="off" label="Address"><input aria-label="Street"></pdx-form-section>');
        await page.locator('#off').evaluate((h) => { (h as unknown as { active: boolean }).active = false; });
        await frames(page);
        expect(await matches(page, '#on', 'active')).toBe(true);
        expect(await matches(page, '#off', 'active')).toBe(false);
        await expect(page.locator('#on [data-part="root"]')).toBeVisible();
        await expect(page.locator('#off [data-part="root"]')).toBeHidden();
        expect(await page.locator('#on [data-part="root"]').getAttribute('class')).toBe('pdx-form-section');
        expect(await ownParts(page, '#on')).toEqual(['content', 'legend', 'root']);
    });
});
