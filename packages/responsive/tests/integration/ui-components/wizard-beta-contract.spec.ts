// pdx-wizard on the beta contract (#289): `value` is a model, so Next, Back, a step button or `goTo(n)`
// writes it and announces `value-change` `{ value }`, which `::value` follows, in place of
// `pdx-change`; a parent's write moves the wizard and announces nothing; `pdx-before-change` stays
// cancellable and, declared, no longer bubbles; the verbs are `next()`, `prev()`, `goTo(n)`, and the
// aliases and the `step` getter are gone; A6 — the current step is `aria-current="step"`, and the
// accessibility tree gives its position and the count; the host's classes are custom states; its
// pieces are parts. Measured in Chromium.
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

const WIZARD = (attrs = '') => `<pdx-wizard ${attrs}>
    <div data-wizard-step data-label="One">Panel one</div>
    <div data-wizard-step data-label="Two">Panel two</div>
    <div data-wizard-step data-label="Three">Panel three</div>
    <div data-wizard-step data-label="Four">Panel four</div>
</pdx-wizard>`;

type Log = { value: number[]; alpha: number };

/** Record on window the `value-change` values and the count of `pdx-change` events of the wizard. */
const listen = (page: Page) => page.evaluate(() => {
    const log: Log = { value: [], alpha: 0 };
    (window as unknown as { __log: Log }).__log = log;
    const host = document.querySelector('#f pdx-wizard, #bound pdx-wizard')!;
    host.addEventListener('value-change', (e) => log.value.push((e as CustomEvent<{ value: number }>).detail.value));
    host.addEventListener('pdx-change', () => { log.alpha++; });
});
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: Log }).__log);
// The panel the wizard shows, by the attribute it writes: before its first frame no panel has it and
// the assertion waits, where `:visible` matched all four and failed at once on strict mode.
const shown = (page: Page) => page.locator('[data-wizard-step][aria-hidden="false"]');
const next = (page: Page) => page.locator('[data-wizard-next]');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=wizard-beta-contract'); });

test('Next and Back write value and announce value-change { value }, and no pdx-change', async ({ page }) => {
    await mount(page, WIZARD());
    await listen(page);
    await next(page).click();
    await expect(shown(page)).toHaveText('Panel two');
    await next(page).click();
    await page.locator('[data-wizard-back]').click();
    await expect(shown(page)).toHaveText('Panel two');
    expect(await page.locator('#f pdx-wizard').evaluate((h) => (h as HTMLElement & { value: number }).value)).toBe(1);
    expect(await log(page)).toEqual({ value: [1, 2, 1], alpha: 0 });
});

test('::value bound to a signal follows Next; setting the signal moves the wizard and announces nothing', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    const readValue = () => page.evaluate(() => (window as unknown as { __gotcha: { readValue(): number } }).__gotcha.readValue());
    const setValue = (v: number) => page.evaluate((x) => (window as unknown as { __gotcha: { setValue(v: number): void } }).__gotcha.setValue(x), v);
    await expect(shown(page)).toHaveText('Panel two');
    await listen(page);

    await next(page).click();
    await expect.poll(readValue).toBe(2);

    await setValue(0);
    await expect(shown(page)).toHaveText('Panel one');
    expect(await log(page)).toEqual({ value: [2], alpha: 0 });
});

test('a button with command="--next" moves to the next step', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await expect(shown(page)).toHaveText('Panel two');
    await page.locator('[data-test="next"]').click();
    await expect(shown(page)).toHaveText('Panel three');
});

test('pdx-before-change still cancels a move, and does not bubble; goTo(n) moves; the aliases and step are gone', async ({ page }) => {
    await mount(page, WIZARD('linear="false"'));
    const host = page.locator('#f pdx-wizard');
    const heard = await host.evaluate((h) => {
        const seen = { host: 0, parent: 0 };
        h.parentElement!.addEventListener('pdx-before-change', () => { seen.parent++; });
        const block = (e: Event) => { seen.host++; e.preventDefault(); };
        h.addEventListener('pdx-before-change', block);
        const moved = (h as HTMLElement & { goTo(n: number): boolean }).goTo(2);
        h.removeEventListener('pdx-before-change', block);
        return { ...seen, moved };
    });
    expect(heard).toEqual({ host: 1, parent: 0, moved: false });
    await expect(shown(page)).toHaveText('Panel one');
    await host.evaluate((h) => (h as HTMLElement & { goTo(n: number): boolean }).goTo(2));
    await expect(shown(page)).toHaveText('Panel three');
    expect(await host.evaluate((h) => ['goNext', 'goPrev', 'goto', 'step'].filter((n) => n in h))).toEqual([]);
});

test('A6 — the current step is aria-current="step", and the accessibility tree gives its position and the count', async ({ page }) => {
    // Without the footer, whose "Step 1 of 4" would otherwise be the one place the count is written.
    await mount(page, WIZARD('hide-nav'));
    // The selected tab and its position in the set, read off the element the accessibility tree
    // builds the tab from: Chromium's CDP tree (Accessibility.getFullAXTree) reports neither
    // posinset nor setsize for any node, so it cannot be the measure.
    const current = () => page.getByRole('tab', { selected: true }).evaluate((t) => ({
        name: t.getAttribute('aria-label'), current: t.getAttribute('aria-current'),
        posinset: t.getAttribute('aria-posinset'), setsize: t.getAttribute('aria-setsize'),
    }));
    await expect(page.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-current', 'step');
    expect(await current()).toEqual({ name: 'One', current: 'step', posinset: '1', setsize: '4' });

    // Moving moves both, and the move is said.
    await page.locator('#f pdx-wizard').evaluate((h) => (h as HTMLElement & { next(): boolean }).next());
    await expect(page.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('tab', { name: 'One' })).not.toHaveAttribute('aria-current');
    expect(await current()).toEqual({ name: 'Two', current: 'step', posinset: '2', setsize: '4' });
    await expect(page.locator('#f [role="status"]')).toHaveText('Step 2 of 4: Two');
});

test('ready, disabled and vertical are custom states on the host, with no class', async ({ page }) => {
    await mount(page, `<div data-k="plain">${WIZARD()}</div><div data-k="marked">${WIZARD('disabled orientation="vertical"')}</div>`);
    const states = (k: string) => page.locator(`#f [data-k="${k}"] pdx-wizard`).evaluate((h) =>
        ['ready', 'disabled', 'vertical'].filter((s) => h.matches(`:state(${s})`)));
    await expect.poll(() => states('plain')).toEqual(['ready']);
    await expect.poll(() => states('marked')).toEqual(['ready', 'disabled', 'vertical']);
    expect(await page.locator('#f .pdx-wizard, #f .pdx-wizard-disabled, #f .pdx-wizard-vertical').count()).toBe(0);
});

test('the stepper, its steps and connectors, the panels and the footer are parts', async ({ page }) => {
    await mount(page, WIZARD());
    const part = (name: string) => page.locator(`#f [data-part="${name}"]`);
    await expect(part('root')).toHaveAttribute('role', 'tablist');
    expect(await part('step').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['tab', 'tab', 'tab', 'tab']);
    await expect(part('connector')).toHaveCount(3);
    expect(await part('panel').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['tabpanel', 'tabpanel', 'tabpanel', 'tabpanel']);
    await expect(part('nav')).toHaveAttribute('role', 'navigation');
    await expect(part('back')).toHaveCount(1);
    await expect(part('next')).toHaveText('Next');
    await expect(part('indicator')).toHaveText('Step 1 of 4');
});
