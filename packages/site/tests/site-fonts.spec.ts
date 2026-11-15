// The site suite does not read Google Fonts (#1114).
//
// The site links its fonts from fonts.googleapis.com, whose stylesheet points at fonts.gstatic.com. In
// CI the CDN once answered a font without its CORS header, the page logged "Access to font … has been
// blocked", and component-pages failed two pages of a change with no font in it. The suite's fixture
// answers both hosts itself; the production page keeps its links.

import { test, expect } from './fixture';

test('a component page reads no font from Google: the stylesheet is the fixture\'s, empty', async ({ page }) => {
    const fonts: string[] = [];
    const sheets: Promise<string>[] = [];
    page.on('request', (r) => { if (/^https:\/\/fonts\.gstatic\.com\//.test(r.url())) fonts.push(r.url()); });
    page.on('response', (r) => { if (/^https:\/\/fonts\.googleapis\.com\//.test(r.url())) sheets.push(r.text()); });
    await page.goto('/components/pdx-form', { waitUntil: 'networkidle' });
    expect(fonts, 'the page asked fonts.gstatic.com for a font').toEqual([]);
    expect(sheets.length, 'the page links no Google stylesheet: nothing is being measured').toBeGreaterThan(0);
    expect(await Promise.all(sheets), 'the Google stylesheet came from the network').toEqual(sheets.map(() => ''));
});
