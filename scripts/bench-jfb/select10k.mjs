// Selecting a row among 10,000, measured outside the benchmark's own list (#117).
//
// js-framework-benchmark's select test uses 1,000 rows, where re-running one effect per row on a
// selection is inside the run's noise. A keyed selector makes a selection re-run two rows, whatever the
// list's length: the difference shows at 10,000. This drives the same built apps the benchmark serves,
// with the benchmark's own puppeteer and the Chrome it uses, and prints its own table — it is not one of
// the benchmark's results and is never mixed into them.
//
// What is timed: from a click on a row's label to the end of the task that follows it, so the
// microtasks a signal write schedules are inside the measure. Median of the selections after warm-up.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROWS = 10_000;
const WARMUP = 3;
const SELECTIONS = 15;

/** The Chrome the benchmark uses: the one given with --chrome, or the platform's default. */
function chromePath(chrome) {
    if (chrome) return chrome;
    if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'linux') return '/snap/bin/chromium';
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

/** Where the benchmark serves a framework: its folder, plus the customURL its package.json names. */
function frameworkUrl(jfb, port, name) {
    const pkg = JSON.parse(readFileSync(join(jfb, 'frameworks', 'keyed', name, 'package.json'), 'utf8'));
    const custom = pkg['js-framework-benchmark']?.customURL ?? '';
    return `http://localhost:${port}/frameworks/keyed/${name}${custom}/`;
}

/** Median selection time among 10,000 rows, in ms, for each framework. */
export async function measureSelect10k({ jfb, port, frameworks, chrome, headless }) {
    // The benchmark's own puppeteer-core: its package.json's `import` entry.
    const puppeteerEntry = join(jfb, 'webdriver-ts', 'node_modules', 'puppeteer-core', 'lib', 'puppeteer', 'puppeteer-core.js');
    const { default: puppeteer } = await import(pathToFileURL(puppeteerEntry).href);
    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        executablePath: chromePath(chrome),
        args: ['--window-size=1280,800', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
        defaultViewport: { width: 1280, height: 800 },
    });
    const results = {};
    try {
        for (const name of frameworks) {
            const page = await browser.newPage();
            await page.goto(frameworkUrl(jfb, port, name), { waitUntil: 'load' });
            await page.click('#runlots');
            await page.waitForSelector(`tbody tr:nth-child(${ROWS})`, { timeout: 60_000 });
            const times = [];
            for (let i = 0; i < WARMUP + SELECTIONS; i++) {
                // Spread over the list: a different row each time, never the one already selected.
                const row = 1 + ((i * 997) % ROWS);
                const ms = await page.evaluate(async (n) => {
                    const label = document.querySelector(`tbody tr:nth-child(${n}) td:nth-child(2) a`);
                    const afterTask = () => new Promise((resolve) => {
                        const channel = new MessageChannel();
                        channel.port1.onmessage = () => resolve();
                        channel.port2.postMessage(0);
                    });
                    const start = performance.now();
                    label.click();
                    await afterTask();
                    return performance.now() - start;
                }, row);
                if (i >= WARMUP) times.push(ms);
            }
            await page.close();
            times.sort((a, b) => a - b);
            results[name] = times[Math.floor(times.length / 2)];
        }
    } finally {
        await browser.close();
    }
    return results;
}

/** The table, frameworks in the order measured. */
export function select10kMarkdown(results) {
    const names = Object.keys(results);
    return [
        `| select a row among ${ROWS.toLocaleString('en')} (ms, median of ${SELECTIONS}) | ${names.join(' | ')} |`,
        `|---|${names.map(() => '---').join('|')}|`,
        `| click to the end of the next task | ${names.map(n => results[n].toFixed(2)).join(' | ')} |`,
    ].join('\n');
}
