/**
 * The design score of the built showcase, as a report.
 *
 * It scores OUR screens, not live third-party sites: a live site needs the internet and its numbers
 * move whenever someone else redeploys. The screens are the ones the design review looks at, at
 * three widths. It writes `design-score/latest.json` and a markdown table, and prints the
 * delta against the previous run, so a reading says «rhythm on /tickets went 0.71 → 0.64» and not
 * just a number.
 *
 * It asserts ONE thing, and it is not a score: every screen rendered and was measured. A selector
 * set that matched nothing, or a screen that never drew, would otherwise produce a clean report of
 * zeros. There is no threshold, on purpose: a score is read, not gated.
 */
import { test, expect } from '@playwright/test';
import { r$ } from '@responsivejs/design';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The screens the design review looks at, and the element that says each one has drawn. */
const SCREENS = [
    { path: '/', ready: '[data-test="dashboard"]' },
    { path: '/tickets', ready: '[data-test="tickets"]' },
    { path: '/tickets/1', ready: '[data-test="ticket"]' },
    { path: '/customers', ready: '[data-test="customers"]' },
] as const;

/** Desktop, a narrow laptop or tablet, a phone. */
const WIDTHS = [1440, 1024, 390];

/**
 * What the score looks at: the screen's MAJOR BLOCKS, flat and not nested. That is the input the
 * metrics are defined on (Ngo's layout measures score the objects of a screen, not its DOM): the
 * shell's two regions and the page's own top-level blocks.
 *
 * A structural set (`main`, `section`, every `button`, every row…) gives `density` and `economy`
 * 0.00 on all twelve readings. `density` sums the elements' areas, so containers nested inside
 * containers cover the viewport several times over; `economy` is a bell centred on ten elements,
 * and the set counts dozens. Both columns would be artefacts of the input.
 */
function blocksOf(ready: string): string[] {
    return ['.rail', '.app-bar', `${ready} > *`];
}

const METRICS = ['overall', 'balance', 'symmetry', 'rhythm', 'proportion', 'regularity', 'density', 'economy'] as const;
type Metric = typeof METRICS[number];
type Reading = Record<Metric, number>;
/** `${path}@${width}` → the metrics. */
type Run = Record<string, Reading>;

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design-score');
const LATEST = join(OUT_DIR, 'latest.json');
const PREVIOUS = join(OUT_DIR, 'previous.json');

/** Elements the selectors match on the page as it is now. */
async function matched(page: import('@playwright/test').Page, selectors: string[]): Promise<number> {
    return page.evaluate((sels) => document.querySelectorAll(sels.join(',')).length, selectors);
}

function table(run: Run, before: Run | null): string {
    const head = `| screen | width | ${METRICS.join(' | ')} |`;
    const rule = `|---|---|${METRICS.map(() => '---').join('|')}|`;
    const rows = Object.entries(run).map(([key, reading]) => {
        const [path, width] = key.split('@');
        const cells = METRICS.map((m) => {
            const now = reading[m].toFixed(2);
            const was = before?.[key]?.[m];
            if (was === undefined) return now;
            const delta = reading[m] - was;
            return Math.abs(delta) < 0.005 ? now : `${now} (${delta > 0 ? '+' : ''}${delta.toFixed(2)})`;
        });
        return `| ${path} | ${width} | ${cells.join(' | ')} |`;
    });
    return [head, rule, ...rows].join('\n');
}

test('the design score of the built showcase', async ({ page, baseURL }) => {
    const run: Run = {};

    for (const screen of SCREENS) {
        const selectors = blocksOf(screen.ready);
        const v = r$(page);
        await v.sweep({ url: `${baseURL}${screen.path}`, selectors, widths: WIDTHS, height: 900 });

        // The one assertion. Not a score: evidence that there WAS something to score. The shell's
        // two regions plus at least one block of the page itself.
        await expect(page.locator(screen.ready), `${screen.path} never drew`).toBeVisible();
        const count = await matched(page, selectors);
        expect(count, `${screen.path}: the selectors matched almost nothing, so every number below would score nothing`)
            .toBeGreaterThan(2);

        const score = v.score();
        for (const width of WIDTHS) {
            const s = score.perWidth.get(width);
            expect(s, `${screen.path} was not measured at ${width}px`).toBeTruthy();
            const reading = Object.fromEntries(METRICS.map((m) => [m, s![m]])) as Reading;
            expect(Number.isFinite(reading.overall), `${screen.path}@${width}: the score is not a number`).toBe(true);
            run[`${screen.path}@${width}`] = reading;
        }
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const before: Run | null = existsSync(LATEST) ? JSON.parse(readFileSync(LATEST, 'utf8')) : null;
    if (before) renameSync(LATEST, PREVIOUS);
    writeFileSync(LATEST, `${JSON.stringify(run, null, 2)}\n`);

    const markdown = [
        `# Design score — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        '',
        before ? 'In brackets, the change since the previous run.' : 'First run: no previous reading to compare with.',
        '',
        table(run, before),
        '',
    ].join('\n');
    writeFileSync(join(OUT_DIR, 'latest.md'), markdown);
    console.log(`\n${markdown}\nWritten to ${OUT_DIR}`);
});
