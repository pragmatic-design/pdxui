/**
 * `<pdx-demo>` keeps a multi-line source.
 *
 * Core treats the `src` of every custom element as a media URL, and a newline is a control character
 * there: a demo's HTML taken in a prop named `src` drops a multi-line source, preview and Source
 * accordion both empty, and in dev warns `<pdx-demo> src: dropped a bound URL with a control
 * character`. HTML source is not a URL: the prop is `code`.
 */
import { test, expect } from '@playwright/test';

const MULTI_LINE = '<pdx-button variant="primary">One</pdx-button>\n<pdx-button>Two</pdx-button>';

// The warning is dev-only (`isDevEnv()` in sanitize-url.ts) and this suite runs the production build,
// where the value is dropped in silence. So the checks are on what renders, not on the console.

test('a fallback page\'s hero, bound through the template, renders its source', async ({ page }) => {
    // A tag with no gallery: the page renders the hero through `<pdx-demo :code="heroSrc">` — the
    // binding path of the `code` prop. Every component has a gallery, so the tag here is one the
    // library does not have; the fallback is what a new component gets until its page
    // exists. Its source is one line, so this guards the call sites rather than the newline.
    await page.goto('/components/pdx-no-gallery-probe', { waitUntil: 'networkidle' });
    await expect(page.locator('#overview pdx-demo .pdx-demo-preview > *').first()).toBeAttached();
    await expect(page.locator('#overview pdx-demo .pdx-demo-source')).toContainText('pdx-no-gallery-probe');
});

test('pdx-demo renders a multi-line source in the preview and shows it in the Source accordion', async ({ page }) => {
    await page.goto('/components/pdx-button', { waitUntil: 'networkidle' });
    await page.evaluate((code) => {
        const demo = document.createElement('pdx-demo') as HTMLElement & { code: string };
        demo.id = 'probe-demo';
        demo.code = code;
        document.querySelector('main')!.appendChild(demo);
    }, MULTI_LINE);
    const demo = page.locator('#probe-demo');
    await expect(demo.locator('.pdx-demo-preview pdx-button')).toHaveCount(2);
    await expect(demo.locator('.pdx-demo-source')).toContainText('<pdx-button>Two</pdx-button>');
});
