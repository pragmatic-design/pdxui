// What the perf tools share: the scenario table, a static server for a build, a page that is ready,
// and the action a page is measured by. See README.md.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';

export const packageDir = resolve(import.meta.dirname, '..', '..');

/** The scenario suite's own table, so a scenario is built here the way the suite builds it. */
export { SCENARIOS } from '../../tests/scenarios-build.ts';

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

/** Serve `dir` on a free port; `index.html` for `/`. */
export function serve(dir) {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(dir, path === '/' || path === '\\' ? 'index.html' : path);
        if (!existsSync(file)) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => done({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => server.close(),
    })));
}

/** A browser, launched the way the scenario suite's Playwright launches it. */
export function launch() {
    return chromium.launch();
}

/** Open `url` in a new page of `browser` and wait for the scenario's `window.__ready`. */
export async function openScenario(browser, url) {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true);
    return page;
}

/**
 * An action, `name[:arg,arg…]`, is a call of the page's `window.__<name>(…args)`: `mount:select,100`
 * calls `window.__mount('select', 100)`. An argument that parses as JSON is passed as that value, any
 * other as a string.
 */
export function parseAction(text) {
    const [name, rest] = text.split(/:(.*)/s);
    const args = rest === undefined ? [] : rest.split(',').map((a) => {
        try {
            return JSON.parse(a);
        } catch {
            return a;
        }
    });
    return { name, args, label: text };
}

/**
 * Run an action once and return its milliseconds: what the page's function returns when it returns a
 * number (a scenario's `__mount` times itself, up to the moment every instance has drawn), otherwise
 * the time the call took to settle, measured in the page.
 */
export function runAction(page, action) {
    return page.evaluate(async ({ name, args }) => {
        const fn = window[`__${name}`];
        if (typeof fn !== 'function') throw new Error(`the page has no window.__${name}`);
        const start = performance.now();
        const result = await fn(...args);
        return typeof result === 'number' ? result : performance.now() - start;
    }, action);
}

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Read a saved `.cpuprofile`, and index its nodes. */
export function readProfile(file) {
    const profile = JSON.parse(readFileSync(file, 'utf8'));
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    /** Self milliseconds of each node, from its samples. */
    const selfMs = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
        const id = profile.samples[i];
        selfMs.set(id, (selfMs.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    }
    return { profile, byId, parent, selfMs };
}

/** A function's key in a profile: its name and its line, which tell apart two anonymous functions. */
export const functionKey = (node) => `${node.callFrame.functionName || '(anon)'}:${node.callFrame.lineNumber + 1}`;

/** Whether `node` is the function `name`: `fn` matches by name, `fn:123` by name and line. */
export const isFunction = (node, name) => name.includes(':')
    ? functionKey(node) === name
    : (node.callFrame.functionName || '(anon)') === name;
