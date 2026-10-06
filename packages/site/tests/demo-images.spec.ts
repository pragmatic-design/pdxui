/**
 * The image galleries show pictures this site serves.
 *
 * image, carousel and card take their pictures, and chip its avatars, from this site, not from a
 * third-party host, and the broken-image examples point at a missing file here, not at a host that
 * does not exist. The pictures are SVG files in public/demo-images/ (a `data:` SVG is dropped by the
 * bound-URL sanitiser on purpose), and the avatars are the site's portraits. `component-pages.spec.ts` fails any page that asks another host for an
 * image; this checks that the pictures really load.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** The pictures exist twice: the showcase serves its own, and the site the galleries ported from it. */
const SHOWCASE_IMAGES = fileURLToPath(new URL('../../compiler/demo/showcase-new/public/demo-images/', import.meta.url));
const SITE_IMAGES = fileURLToPath(new URL('../public/demo-images/', import.meta.url));

/** How many gallery images each page shows at least, loaded (lazy ones below the fold excluded). */
const FLOORS: Record<string, number> = { 'pdx-image': 10, 'pdx-carousel': 3, 'pdx-card': 5, 'pdx-chip': 3 };

for (const [tag, floor] of Object.entries(FLOORS)) {
    test(`${tag}: the gallery's pictures load, and none of ours is broken`, async ({ page }) => {
        await page.goto(`/components/${tag}`, { waitUntil: 'networkidle' });
        const images = () => page.locator('.cmp-gallery img').evaluateAll((els) => els
            .map((i) => i as HTMLImageElement)
            .filter((i) => i.getAttribute('src'))
            .map((i) => ({ src: i.getAttribute('src')!, complete: i.complete, width: i.naturalWidth })));
        await expect.poll(async () => (await images()).filter((i) => i.width > 0).length, `${tag}: pictures loaded`).toBeGreaterThanOrEqual(floor);
        const broken = (await images()).filter((i) => i.complete && i.width === 0 && !i.src.includes('/missing-image'));
        expect(broken.map((i) => i.src), `${tag}: images of this site that did not load`).toEqual([]);
    });
}

test('the site serves the same pictures as the showcase', () => {
    const names = readdirSync(SHOWCASE_IMAGES).sort();
    expect(names.length).toBeGreaterThan(0);
    expect(readdirSync(SITE_IMAGES).sort()).toEqual(names);
    for (const n of names) {
        expect(readFileSync(join(SITE_IMAGES, n), 'utf8'), n).toBe(readFileSync(join(SHOWCASE_IMAGES, n), 'utf8'));
    }
});

test('the broken-image examples point at a missing file of this site', async ({ page }) => {
    await page.goto('/components/pdx-image', { waitUntil: 'networkidle' });
    const broken = page.locator('.cmp-gallery pdx-image[alt="Broken"], .cmp-gallery pdx-image[alt="Custom icon"]');
    await expect(broken).toHaveCount(2);
    for (const el of await broken.all()) await expect(el).toHaveAttribute('src', /^\/missing-image/);
});
