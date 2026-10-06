// Every wait on a scenario page's `data-pdx-ready` flag goes through `measure.ts`, which names what the
// page reported when the flag never comes.
//
// `goToScenario` collects a page's console errors, uncaught exceptions, failed requests and HTTP
// errors while it waits, and puts them in the timeout. A wait on the same flag written by hand in a
// spec says only "waiting for locator('html[data-pdx-ready]')" when it times out, and a flaky failure
// there carries no information. The specs call `openPage` / `waitForReady`; this fails on the next
// wait written by hand.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const INTEGRATION = join(__dirname, '..', '..', 'responsive', 'tests', 'integration');
/** The one file allowed to wait on the flag: it is where the wait and its report live. */
const HELPER = 'ui-components/contracts/measure.ts';

/**
 * A wait on the flag: `waitForSelector('…data-pdx-ready…')`, `locator('…data-pdx-ready…').waitFor()`,
 * `waitForFunction(() => …'data-pdx-ready'…)`, across lines. Reading the attribute after the page is
 * open (`page.evaluate(() => el.hasAttribute('data-pdx-ready'))`) and comments are not waits.
 */
const WAIT = /\b(?:waitForSelector|waitForFunction|locator)\s*\([^;]*?data-pdx-ready/g;

/** Lines of `source` that start a hand-written wait on the flag, comments removed. */
function handWrittenWaits(source: string): number[] {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
    const lines: number[] = [];
    for (const m of code.matchAll(WAIT)) lines.push(code.slice(0, m.index).split('\n').length);
    return lines;
}

function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : tsFiles(path);
        return name.endsWith('.ts') ? [path] : [];
    });
}

describe('the check can fail', () => {
    // Planted: a check that always returns [] would pass the real assertion perfectly.
    it('sees the three forms of the wait, over several lines too', () => {
        expect(handWrittenWaits("await page.waitForSelector('html[data-pdx-ready]');")).toEqual([1]);
        expect(handWrittenWaits("x;\nawait page.locator('html[data-pdx-ready]').waitFor();")).toEqual([2]);
        expect(handWrittenWaits('await page.waitForFunction(\n  () => document.documentElement.hasAttribute("data-pdx-ready"),\n);')).toEqual([1]);
    });
    it('does not count a comment, or a read of the attribute once the page is open', () => {
        expect(handWrittenWaits("// page.waitForSelector('html[data-pdx-ready]')")).toEqual([]);
        expect(handWrittenWaits("/* waitForSelector('html[data-pdx-ready]') */")).toEqual([]);
        expect(handWrittenWaits("expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pdx-ready'))).toBe(true);")).toEqual([]);
    });
});

describe('no spec waits on data-pdx-ready by hand', () => {
    it('every wait on the flag is measure.ts\'s own, which names the page\'s errors on a timeout', () => {
        const found: string[] = [];
        for (const file of tsFiles(INTEGRATION)) {
            const rel = relative(INTEGRATION, file).replace(/\\/g, '/');
            if (rel === HELPER) continue;
            for (const line of handWrittenWaits(readFileSync(file, 'utf8'))) found.push(`${rel}:${line}`);
        }
        expect(found, 'wait with openPage / waitForReady from ui-components/contracts/measure.ts').toEqual([]);
    });

    it('the helper itself still waits on the flag — the control', () => {
        expect(handWrittenWaits(readFileSync(join(INTEGRATION, HELPER), 'utf8')).length).toBeGreaterThan(0);
    });
});
