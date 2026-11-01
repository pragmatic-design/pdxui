// pdx-page-header on the beta contract (#289): a header holds no position and no state of its own;
// the header, its breadcrumb, the title, the subtitle and the actions area are parts; the title is
// the heading `heading-level` says; the actions slot lands in the actions part; `pdx-crumb` stays on
// the header. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
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

const CRUMBS = JSON.stringify([
    { key: 'home', label: 'Home' },
    { key: 'patients', label: 'Patients' },
]);
const HEADER = (attrs = '') => `<pdx-page-header title="Patients" subtitle="1,204 records" crumbs='${CRUMBS}' ${attrs}>
    <button slot="actions" type="button">New patient</button>
</pdx-page-header>`;
const part = (page: Page, name: string) => page.locator(`#f [data-part="${name}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=page-header-beta-contract'); });

test('the header, its breadcrumb, the title, the subtitle and the actions area are parts', async ({ page }) => {
    await mount(page, HEADER());
    expect(await part(page, 'root').evaluate((e) => e.tagName)).toBe('HEADER');
    await expect(part(page, 'breadcrumb')).toHaveAttribute('aria-label', 'Breadcrumb');
    await expect(part(page, 'title')).toHaveText('Patients');
    await expect(part(page, 'subtitle')).toHaveText('1,204 records');
    // The slotted action lands in the actions part.
    await expect(part(page, 'actions').getByRole('button', { name: 'New patient' })).toBeVisible();
});

test('the title is the heading heading-level names, and the parts stay on it', async ({ page }) => {
    await mount(page, HEADER('heading-level="3"'));
    await expect(page.getByRole('heading', { name: 'Patients', level: 3 })).toBeVisible();
    expect(await part(page, 'title').evaluate((e) => e.tagName)).toBe('H3');
});

test('with no crumbs, no breadcrumb part', async ({ page }) => {
    await mount(page, '<pdx-page-header title="Dashboard"></pdx-page-header>');
    await expect(part(page, 'title')).toHaveText('Dashboard');
    await expect(part(page, 'breadcrumb')).toHaveCount(0);
    await expect(part(page, 'subtitle')).toHaveCount(0);
});

test('a crumb without href is a button the keyboard reaches; one with href stays a link', async ({ page }) => {
    // It was an <a> with no href: no link role, no focus — reachable by the mouse alone.
    const crumbs = JSON.stringify([{ key: 'home', label: 'Home' }, { key: 'clinic', label: 'Clinic', href: '#clinic' }, { key: 'p', label: 'Patients' }]);
    await mount(page, `<pdx-page-header title="Patients" crumbs='${crumbs}'></pdx-page-header>`);
    await expect(page.getByRole('link', { name: 'Clinic' })).toHaveAttribute('href', '#clinic');
    await page.locator('body').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Home' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Clinic' })).toBeFocused();
});

test('the separator is the theme\'s glyph, --pdx-breadcrumb-separator, as pdx-breadcrumb\'s', async ({ page }) => {
    // It was a written "/", whatever the theme. A theme sets the token on `.pdx-breadcrumb` (Pragmatic:
    // "›"); this page loads no theme stylesheet, so the token is set here as a theme would.
    const sep = page.locator('#f .pdx-breadcrumb-sep').first();
    const glyph = () => sep.evaluate((s) => getComputedStyle(s, '::before').content);
    await mount(page, HEADER());
    await expect(sep).toHaveText('');
    expect(await glyph(), 'the default token').toBe('"/"');
    await part(page, 'breadcrumb').evaluate((n) => (n as HTMLElement).style.setProperty('--pdx-breadcrumb-separator', "'›'"));
    expect(await glyph(), 'a theme\'s token').toBe('"›"');
});

test('pdx-crumb carries the crumb, on the header, not past it', async ({ page }) => {
    await mount(page, HEADER());
    const heard = page.evaluate(() => new Promise<{ host: unknown; parent: number }>((resolve) => {
        const host = document.querySelector('#f pdx-page-header')!;
        let parent = 0;
        host.parentElement!.addEventListener('pdx-crumb', () => { parent++; });
        host.addEventListener('pdx-crumb', (e) => {
            // After this dispatch: a bubbling event reaches the parent in the same one.
            queueMicrotask(() => resolve({ host: (e as CustomEvent<{ key: string }>).detail.key, parent }));
        });
    }));
    await page.getByRole('button', { name: 'Home' }).click();
    expect(await heard).toEqual({ host: 'home', parent: 0 });
});
