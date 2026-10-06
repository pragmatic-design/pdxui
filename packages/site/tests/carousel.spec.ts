/**
 * pdx-carousel on its gallery page, measured in Chromium: a mouse drag changes the slide, as the
 * demo's "touch/pointer swipe" promises; the region has a name; and autoplay can be stopped from a
 * control.
 */
import { test, expect, type Locator } from '@playwright/test';

const activeDot = (c: Locator) => c.locator('.pdx-carousel-dot[aria-selected="true"]');

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-carousel', { waitUntil: 'networkidle' });
});

test('a 200 px mouse drag to the left moves to the next slide', async ({ page }) => {
    const carousel = page.locator('pdx-carousel').first();
    await expect(activeDot(carousel)).toHaveAttribute('aria-label', 'Go to slide 1');
    // In view first: the mouse only reaches what is on screen, and the page above the carousel
    // grows — the component's description can push the track's middle below the fold, and the drag
    // would land on nothing.
    await carousel.locator('.pdx-carousel-track').scrollIntoViewIfNeeded();
    const box = (await carousel.locator('.pdx-carousel-track').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2 + 100, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, y, { steps: 8 });
    await page.mouse.up();
    await expect(activeDot(carousel)).toHaveAttribute('aria-label', 'Go to slide 2');
});

test('the carousel region is named, and a named landmark', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Carousel' }).first()).toBeVisible();
});

test('the autoplay carousel has a control that stops the rotation', async ({ page }) => {
    const carousel = page.locator('pdx-carousel[autoplay]');
    const stop = carousel.getByRole('button', { name: 'Stop slide rotation' });
    await stop.click();
    await expect(carousel.getByRole('button', { name: 'Start slide rotation' })).toBeVisible();
});
