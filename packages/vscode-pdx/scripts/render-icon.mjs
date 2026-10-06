// render-icon.mjs — the extension's Marketplace icon, images/icon.png, rendered from the site's logo
// (packages/site/public/favicon.svg) at 128×128. The Marketplace asks for a PNG of at
// least 128×128; the PNG is committed and this is how it was made.
//
// Usage: node scripts/render-icon.mjs   (Chromium through the Playwright the site already declares)

import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(ext, '..', 'site');
const { chromium } = createRequire(join(site, 'package.json'))('@playwright/test');

const SIZE = 128;
const svg = readFileSync(join(site, 'public', 'favicon.svg'), 'utf-8')
    .replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" `);

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    mkdirSync(join(ext, 'images'), { recursive: true });
    await page.locator('svg').screenshot({ path: join(ext, 'images', 'icon.png'), omitBackground: true });
    console.log(`images/icon.png: ${SIZE}×${SIZE}`);
} finally {
    await browser.close();
}
