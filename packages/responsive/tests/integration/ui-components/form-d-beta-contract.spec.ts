// The form family's last row on the beta contract (#293): pdx-form-template. Its wizard layout is a
// pdx-wizard, so A6 holds once: the current step is aria-current="step", the step says «n of N», and a
// step with an error is not left. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 3) => page.evaluate((count) => new Promise((r) => {
    let left = count;
    const tick = () => (--left <= 0 ? r(null) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
}), n);

type Win = { __gotcha: { load(m: string): Promise<void> }; __events: unknown[] };

const SCHEMA = {
    layout: 'wizard',
    sections: [
        { name: 'who', label: 'Requester' },
        { name: 'what', label: 'Request' },
        { name: 'when', label: 'Schedule' },
    ],
    fields: [
        { name: 'name', label: 'Name', type: 'text', section: 'who', required: true },
        { name: 'topic', label: 'Topic', type: 'text', section: 'what' },
        { name: 'day', label: 'Day', type: 'text', section: 'when' },
    ],
};

/** A pdx-form-template on the wizard schema, in a fresh <div id="f">. */
async function mountWizard(page: Page): Promise<void> {
    await page.evaluate(async (schema) => {
        const w = window as unknown as Win;
        await w.__gotcha.load('<pdx-form-template></pdx-form-template>');
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        const t = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown };
        t.id = 't';
        t.schema = schema;
        f.appendChild(t);
        document.body.appendChild(f);
        w.__events = [];
        t.addEventListener('pdx-submit', (e) => w.__events.push((e as CustomEvent).detail));
    }, SCHEMA);
    await expect(page.locator('#t [aria-current="step"]')).toHaveCount(1);
}

const current = (page: Page) => page.locator('#t [aria-current="step"]');
const next = (page: Page) => page.locator('#t pdx-wizard [data-part="next"]');
const setValue = (page: Page, name: string, value: string) => page.locator('#t').evaluate((t, [n, v]) => {
    (t as unknown as { getForm(): Record<string, { onChange(x: string): void }> }).getForm()[n].onChange(v);
}, [name, value] as const);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=form-b-beta-contract'); });

test.describe('pdx-form-template, a collapsible section (#847)', () => {
    // Its toggle was a <legend role="button"> with a click listener: no tabindex and no keys, so Tab went
    // past it and a collapsed section's fields could not be reached without a mouse.
    test('its toggle is a button in the legend: Tab reaches it, Enter and Space collapse and expand the section', async ({ page }) => {
        await page.evaluate(async () => {
            const w = window as unknown as Win;
            await w.__gotcha.load('<pdx-form-template></pdx-form-template>');
            document.getElementById('f')?.remove();
            const f = document.createElement('div');
            f.id = 'f';
            const before = document.createElement('button');
            before.id = 'before';
            before.textContent = 'Before';
            const t = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown; showActions: boolean };
            t.id = 't';
            t.showActions = false;
            t.schema = {
                sections: [{ name: 'address', label: 'Address', collapsible: true }],
                fields: [{ name: 'street', label: 'Street', type: 'text', section: 'address' }],
            };
            f.append(before, t);
            document.body.appendChild(f);
        });
        const toggle = page.getByRole('button', { name: 'Address' });
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const content = page.locator('#t [data-part="section"] .pdx-form-section-content');
        await expect(toggle).toHaveAttribute('aria-controls', (await content.getAttribute('id'))!);
        await expect(page.locator('#t legend')).not.toHaveAttribute('role', /.*/);

        await page.locator('#before').focus();
        await page.keyboard.press('Tab');
        await expect(toggle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(content).toBeHidden();
        await page.keyboard.press('Space');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(content).toBeVisible();
        // Expanded, the next tab stop is the section's field.
        await page.keyboard.press('Tab');
        await expect(page.getByRole('textbox', { name: 'Street' })).toBeFocused();
    });
});

test.describe('pdx-form-template, wizard layout', () => {
    test('A6: one stepper, the wizard\'s; its current step is aria-current="step" and says «1 of 3»', async ({ page }) => {
        await mountWizard(page);
        await expect(page.locator('#t [role="tablist"]')).toHaveCount(1);
        await expect(page.locator('#t pdx-wizard [role="tablist"]')).toHaveCount(1);
        await expect(current(page)).toHaveAttribute('aria-posinset', '1');
        await expect(current(page)).toHaveAttribute('aria-setsize', '3');
        await expect(current(page)).toHaveAccessibleName(/Requester/);
        await expect(page.locator('#t [data-part="indicator"]')).toHaveText('Step 1 of 3');
    });

    test('A6: moving forward past an invalid step is refused, and the mark does not move', async ({ page }) => {
        await mountWizard(page);
        await next(page).click();
        await frames(page, 4);
        await expect(current(page)).toHaveAttribute('aria-posinset', '1');
        // The step's error is shown, and its control says so (A2).
        await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');

        await setValue(page, 'name', 'Ada');
        await next(page).click();
        await expect(current(page)).toHaveAttribute('aria-posinset', '2');
        await expect(page.locator('#t [data-part="indicator"]')).toHaveText('Step 2 of 3');
    });

    test('Back is never blocked, and the last step\'s button submits the form', async ({ page }) => {
        await mountWizard(page);
        await setValue(page, 'name', 'Ada');
        await next(page).click();
        await expect(current(page)).toHaveAttribute('aria-posinset', '2');
        await page.locator('#t pdx-wizard [data-part="back"]').click();
        await expect(current(page)).toHaveAttribute('aria-posinset', '1');

        await next(page).click();
        await expect(current(page)).toHaveAttribute('aria-posinset', '2');
        await next(page).click();
        await expect(current(page)).toHaveAttribute('aria-posinset', '3');
        await setValue(page, 'day', 'Monday');
        await next(page).click();
        await expect.poll(() => page.evaluate(() => (window as unknown as Win).__events))
            .toEqual([{ values: { name: 'Ada', topic: '', day: 'Monday' } }]);
    });

    test('next(), prev() and goTo(n) move the wizard through the same gate', async ({ page }) => {
        await mountWizard(page);
        const call = (m: string, ...args: unknown[]) => page.locator('#t').evaluate(
            (t, [name, a]) => (t as unknown as Record<string, (...x: unknown[]) => unknown>)[name as string](...(a as unknown[])), [m, args] as const);
        expect(await call('next')).toBe(false);
        await expect(current(page)).toHaveAttribute('aria-posinset', '1');
        await setValue(page, 'name', 'Ada');
        expect(await call('next')).toBe(true);
        await expect(current(page)).toHaveAttribute('aria-posinset', '2');
        await call('prev');
        await expect(current(page)).toHaveAttribute('aria-posinset', '1');
        await call('goTo', 1);
        await expect(current(page)).toHaveAttribute('aria-posinset', '2');
    });

    // tabs.css drew the pill tab style's panel padding on every [role="tabpanel"] of the page, and a
    // wizard's panels are tabpanels. At equal weight the later stylesheet won: once the template brought
    // wizard.css in before tabs.css, the wizards on a pill-style page (five themes) took the tabs' padding.
    // Measured on the rules, not the computed padding: which one wins depends on the order the page loaded
    // the two stylesheets in, and this page loads them in the order that hides it.
    test('the pill tab style draws the tabs\' panels, not a wizard\'s', async ({ page }) => {
        await page.evaluate(async () => {
            document.documentElement.setAttribute('pdx-tab-style', 'pill');
            await (window as unknown as Win).__gotcha.load('<pdx-tabs></pdx-tabs>'); // brings tabs.css
        });
        await mountWizard(page);
        // The pill style is `[pdx-tab-style="pill"] X` under baseline-2024 and, under baseline-2026, X inside
        // `@container style(--pdx-tab-…: pill)`: a rule is the pill style's when either says pill.
        const pillRulesSelecting = (sel: string) => page.locator(sel).first().evaluate((el) => {
            const found: string[] = [];
            const walk = (rules: CSSRuleList, underPill: boolean) => {
                for (const r of Array.from(rules)) {
                    if (r instanceof CSSStyleRule) {
                        const pill = underPill || r.selectorText.includes('pdx-tab-style="pill"');
                        if (pill && el.matches(r.selectorText)) found.push(r.selectorText);
                    } else if (r instanceof CSSImportRule) {
                        // A layered entry imports its stylesheet: `@import url(…) layer(pdx.components)`.
                        if (r.styleSheet) walk(r.styleSheet.cssRules, underPill);
                    } else if (r instanceof CSSContainerRule) {
                        walk(r.cssRules, underPill || /pill/.test(r.conditionText));
                    } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules, underPill);
                }
            };
            for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, false);
            return found;
        });
        // Control: a native tab panel is drawn by the pill style, so the rules are on the page.
        await page.evaluate(() => {
            const p = document.createElement('div');
            p.setAttribute('data-tab-panel', '');
            p.id = 'native-panel';
            document.getElementById('f')!.appendChild(p);
        });
        expect(await pillRulesSelecting('#native-panel')).not.toEqual([]);
        expect(await pillRulesSelecting('#t pdx-wizard > [data-wizard-step]'), 'a pill tab style rule selects a wizard panel').toEqual([]);
    });

    test('its pieces are parts: the form, its content, the wizard, whose panels are a step per section', async ({ page }) => {
        await mountWizard(page);
        for (const part of ['form', 'content', 'wizard']) await expect(page.locator(`#t [data-part="${part}"]`), part).toHaveCount(1);
        await expect(page.locator('#t pdx-wizard > [data-part="panel"][data-wizard-step]')).toHaveCount(3);
    });
});
