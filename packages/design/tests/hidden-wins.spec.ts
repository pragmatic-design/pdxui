import { test, expect } from '@playwright/test';

// `hidden` hides a component, whatever display its stylesheet gives it (#1018).
//
// The browser's `[hidden] { display: none }` is a user-agent rule, and any author rule that sets
// `display` outranks it: `:is(.pdx-empty-state, pdx-empty-state) { display: flex }` made `hidden` do
// nothing on an empty state, and a reference app showed "no activity" next to the first entry. Four
// stylesheets guarded their own `[hidden]`; every other one that sets a display was open to it.
//
// Measured in Chromium, on the full sheet (base, every component, every theme): for every `pdx-*` tag
// and every `.pdx-*` class the stylesheets name, an element carrying `hidden` is `display: none`.

const HARNESS = '/demo/test-harness.html';

/** Every `pdx-*` element name and `.pdx-*` class in the page's stylesheets, nested rules and imports included. */
async function namedInSheets(page: import('@playwright/test').Page): Promise<{ tags: string[]; classes: string[] }> {
    return page.evaluate(() => {
        const tags = new Set<string>();
        const classes = new Set<string>();
        const walk = (rules: CSSRuleList): void => {
            for (const rule of Array.from(rules)) {
                if (rule instanceof CSSImportRule && rule.styleSheet) walk(rule.styleSheet.cssRules);
                if (rule instanceof CSSStyleRule) {
                    // Match: a pdx- element name, not inside an attribute or after a dot. Groups: [1]=name
                    for (const m of rule.selectorText.matchAll(/(?<![\w.\-="'[])(pdx-[a-z0-9-]+)/g)) tags.add(m[1]);
                    // Match: a .pdx- class. Groups: [1]=class
                    for (const m of rule.selectorText.matchAll(/\.(pdx-[a-z0-9-]+)/g)) classes.add(m[1]);
                }
                if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules);
            }
        };
        // The design sheets: the harness also links Google Fonts, another origin, whose rules the browser does not expose.
        for (const sheet of Array.from(document.styleSheets)) {
            if (!sheet.href || sheet.href.startsWith(location.origin)) walk(sheet.cssRules);
        }
        return { tags: [...tags].sort(), classes: [...classes].sort() };
    });
}

test('an element of any component, with hidden, is display: none', async ({ page }) => {
    await page.goto(HARNESS);
    const { tags, classes } = await namedInSheets(page);
    expect(tags.length, 'no pdx- tag found in the sheets: the walk broke').toBeGreaterThan(50);
    expect(classes.length, 'no .pdx- class found in the sheets: the walk broke').toBeGreaterThan(200);

    const shown = await page.evaluate(({ tags, classes }) => {
        const host = document.createElement('div');
        document.body.append(host);
        const out: string[] = [];
        const check = (el: HTMLElement, label: string): void => {
            el.hidden = true;
            host.append(el);
            const display = getComputedStyle(el).display;
            if (display !== 'none') out.push(`${label} → display: ${display}`);
            el.remove();
        };
        for (const tag of tags) check(document.createElement(tag), `<${tag}>`);
        for (const cls of classes) {
            const el = document.createElement('div');
            el.className = cls;
            check(el, `.${cls}`);
        }
        return out;
    }, { tags, classes });

    expect(shown, 'hidden, and still drawn').toEqual([]);
});

test('the control: hidden="until-found" keeps the browser\'s own behaviour, not display: none', async ({ page }) => {
    await page.goto(HARNESS);
    const display = await page.evaluate(() => {
        const el = document.createElement('pdx-empty-state');
        el.setAttribute('hidden', 'until-found');
        document.body.append(el);
        return getComputedStyle(el).display;
    });
    expect(display).not.toBe('none');
});
