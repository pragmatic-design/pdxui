// Validation sweep over the site's component pages: visit every /components/:tag, capture PDX
// console/page errors, and check the page has real content (gallery / placeholder / hero) and a
// usable playground. Run with the site dev server up:
//   cd packages/responsive && node scripts/validate-site-components.mjs   (BASE=http://localhost:5300)

import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5300';
const man = JSON.parse(readFileSync(join(here, '../../ui/custom-elements.json'), 'utf8'));
const tags = man.modules.map(m => m.declarations[0]).filter(Boolean).map(d => d.tagName).filter(Boolean);

const browser = await chromium.launch();
let page = await browser.newPage();
const issues = [];
// Recreate the page every N components so leaked observers/effects from heavy galleries don't
// accumulate and slow down later pages (which produced false HANGs in a single long-lived page).
const RECYCLE_EVERY = 12;
let _n = 0;

const timeout = ms => new Promise((_r, rej) => setTimeout(() => rej(new Error('hang')), ms));

async function inspect(tag) {
    // domcontentloaded, NOT networkidle: the Vite dev server keeps the HMR websocket open.
    await page.goto(`${BASE}/components/${tag}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(450);
    return page.evaluate(() => {
        const gallery = document.querySelector('.cmp-gallery')?.firstElementChild;
        const sections = gallery ? gallery.querySelectorAll('section').length : 0;
        const placeholder = !!document.querySelector('.cmp-placeholder');
        const hero = !!document.querySelector('#overview pdx-demo');
        const pg = document.querySelector('pdx-props-playground');
        const stage = pg?.querySelector('.pp-stage')?.firstElementChild;
        const controls = pg ? pg.querySelectorAll('.pp-control').length : null;
        const stageRendered = stage ? stage.querySelectorAll('*').length : 0;
        return { sections, placeholder, hero, hasPlayground: !!pg, hasStage: !!stage, stageRendered, controls };
    });
}

for (const tag of tags) {
    if (++_n % RECYCLE_EVERY === 0) { try { await page.close(); } catch (_e) { /* */ } page = await browser.newPage(); }
    const errs = [];
    const onConsole = m => { if (m.type() === 'error' && !/favicon|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ERR_CONNECTION|ERR_ADDRESS/i.test(m.text())) errs.push(m.text()); };
    const onError = e => errs.push(e.message);
    page.on('console', onConsole);
    page.on('pageerror', onError);

    let info;
    try { info = await Promise.race([inspect(tag), timeout(12000)]); }
    catch (e) {
        info = { hang: true }; errs.length = 0;
        try { await page.close(); } catch (_e) { /* ignore */ }
        page = await browser.newPage();   // recover — a hung page poisons later navigations
    }

    try { page.off('console', onConsole); page.off('pageerror', onError); } catch (_e) { /* page may be new */ }

    const problems = [];
    if (info.hang) problems.push('HANG (page unresponsive)');
    if (errs.length) problems.push('ERROR: ' + errs[0].slice(0, 90));
    if (info.hang) { issues.push({ tag, problems }); console.log(`✗ ${tag.padEnd(24)} ${problems.join('  |  ')}`); continue; }
    if (!(info.sections > 0 || info.placeholder || info.hero)) problems.push('no-content');
    if (info.hasPlayground && !info.hasStage) problems.push('empty-playground-stage');
    if (info.hasPlayground && info.controls === 0) problems.push('no-controls');
    if (info.hasPlayground && info.hasStage && info.stageRendered === 0) problems.push('stage-not-rendered');
    if (problems.length) { issues.push({ tag, problems }); console.log(`✗ ${tag.padEnd(24)} ${problems.join('  |  ')}`); }
    else process.stdout.write('.');
}
console.log('');

await browser.close();

console.log(`\nValidated ${tags.length} components — ${issues.length} with issues:\n`);
for (const i of issues) console.log(`  ${i.tag.padEnd(24)} ${i.problems.join('  |  ')}`);
console.log(issues.length === 0 ? '\n✓ all clean' : `\n${issues.length} need attention`);
