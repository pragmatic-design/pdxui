// Category 3 — Enum coherence: an enum prop must DECLARE its allowed values in the manifest (so the
// playground + IntelliSense offer a dropdown), and the component should only honour declared values.
import { test } from '@playwright/test';
import { mount, memberOf, SUBJECT, expect } from './helpers';

/** A manifest type counts as a declared enum if it's a union of >= 2 string literals. */
function isDeclaredEnum(typeText: string): boolean {
    if (!typeText) return false;
    const parts = typeText.split('|').map(s => s.trim());
    return parts.length >= 2 && parts.every(p => /^['"][^'"]*['"]$/.test(p));
}

test.describe('enum coherence', () => {
    test('number-input: `controls` declares its enum in the manifest', () => {
        const m = memberOf('pdx-number-input', 'controls');
        expect(m, 'controls member exists').toBeTruthy();
        expect(isDeclaredEnum(m.type?.text || ''),
            `controls should be a string-literal union, got: ${m.type?.text}`).toBe(true);
    });

    test('number-input: `controls` renders the stacked layout for the declared value "right"', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { controls: 'right' } });
        const stack = await page.$(`${SUBJECT} .pdx-number-btn-stack`);
        expect(stack, 'controls="right" renders the .pdx-number-btn-stack').toBeTruthy();
    });

    // Every enum-semantic prop on the core components must DECLARE its union in the manifest
    // (a free-text String here means the playground shows a textbox where a dropdown belongs).
    const ENUM_PROPS: Array<[string, string]> = [
        ['pdx-button', 'variant'], ['pdx-button', 'size'], ['pdx-button', 'type'],
        ['pdx-input', 'type'], ['pdx-input', 'size'],
        ['pdx-select', 'size'],
        // drawer 'size' is intentionally open-ended (custom CSS widths) → not a closed enum.
        ['pdx-drawer', 'position'], ['pdx-drawer', 'mode'],
        ['pdx-dialog', 'size'],
    ];
    for (const [tag, prop] of ENUM_PROPS) {
        test(`${tag}: \`${prop}\` declares its enum in the manifest`, () => {
            const m = memberOf(tag, prop);
            expect(m, `${prop} member exists`).toBeTruthy();
            expect(isDeclaredEnum(m.type?.text || ''),
                `${tag}.${prop} should be a string-literal union, got: ${m.type?.text}`).toBe(true);
        });
    }
});
