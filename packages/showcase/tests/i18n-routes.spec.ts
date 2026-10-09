/**
 * A screen's strings travel with the screen.
 *
 * Eager is the FIRST SCREEN's strings, in the active locale; everything else is a chunk. One eager
 * dictionary would carry every screen's copy — the intake wizard's, the import screen's, the
 * account page's — to a visitor who opened a dashboard, and raise the entry's size with every
 * handful of strings a screen adds.
 *
 * The first test here is the one that keeps it honest as the app grows: it reads the pages and the
 * map, and fails naming the section a page uses and its route does not declare.
 */
import { test, expect } from './fixture';
import { pickLocale } from './locale';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { sectionsFor, EAGER, ROUTE_SECTIONS } from '../src/locales/sections';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src');
const DIST = resolve(HERE, '..', 'dist', 'assets');

/** Every `$t('<section>.…')` a file reaches for, as section names. */
function sectionsUsedBy(file: string): string[] {
    const src = readFileSync(file, 'utf-8');
    return [...new Set([...src.matchAll(/\$t\('([a-zA-Z]+)\./g)].map((m) => m[1]))].sort();
}

/** The `@page` path a page declares, or null for a component. */
function routeOf(file: string): string | null {
    return readFileSync(file, 'utf-8').match(/@page\s+'([^']+)'/)?.[1] ?? null;
}

test('every section a page uses is one its route declares', () => {
    const pages = readdirSync(join(SRC, 'pages')).filter((f) => f.endsWith('.pdx'));
    const gaps: string[] = [];

    for (const name of pages) {
        const file = join(SRC, 'pages', name);
        const route = routeOf(file);
        if (!route) continue;
        // The route's own sections plus the eager ones: `app` is the shell's and is always there.
        const available = new Set([...EAGER, ...sectionsFor(route)]);
        for (const used of sectionsUsedBy(file)) {
            if (!available.has(used)) gaps.push(`${name} (${route}) reads ${used}.*`);
        }
    }

    expect(gaps, 'a page reads a dictionary its route never asks for: those strings render as their keys')
        .toEqual([]);
});

test('control — the map does not just declare everything', () => {
    // Without this, the test above is satisfied by a map that hands every route every section,
    // which is the eager dictionary with more steps.
    const all = new Set(ROUTE_SECTIONS.flatMap((r) => r.sections));
    for (const { pattern, sections } of ROUTE_SECTIONS) {
        expect(sections.length, `${pattern} asks for every section there is`).toBeLessThan(all.size);
    }
    // And the shell's own section is not in any route's list: it is eager, once.
    expect(ROUTE_SECTIONS.some((r) => r.sections.includes('app')), 'the shell\'s strings are per-route')
        .toBe(false);
});

test('the shell knows what the landing route needs, and nothing else', () => {
    expect([...EAGER].sort()).toEqual(['app', 'dashboard']);
    expect(sectionsFor('/'), 'the landing route fetches strings it already has').toEqual([]);
    // The list's create modal picks the ticket's asset in the assets' words.
    expect(sectionsFor('/tickets')).toEqual(['assets', 'tickets']);
    // THE CHAIN: the ticket renders inside the list, so the list's strings are needed too.
    expect(sectionsFor('/tickets/42')).toEqual(['assets', 'attachments', 'ticket', 'tickets']);
    expect(sectionsFor('/tickets/42/interventions/2')).toEqual(['assets', 'attachments', 'intervention', 'ticket', 'tickets']);
    expect(sectionsFor('/customers/import'), 'the import screen reads the customer columns too')
        .toEqual(['customers', 'import']);
    expect(sectionsFor('/nowhere'), 'an unknown path asks for nothing rather than for everything')
        .toEqual([]);
});

const entryJs = () => readFileSync(join(DIST, readdirSync(DIST).find((f) => /^index-.*\.js$/.test(f))!), 'utf-8');

test('a screen\'s strings are NOT in the first download', () => {
    const js = entryJs();
    const leaked = [
        ['tickets', 'Make the next archive fail'],
        ['intake', 'New intake'],
        ['import', 'Drop a .csv here, or pick one'],
        ['account', 'Who the server says you are'],
    ].filter(([, probe]) => js.includes(probe)).map(([section]) => section);

    expect(leaked, 'a screen the visitor has not opened put its strings in the first download')
        .toEqual([]);
});

test('control — the shell\'s and the landing route\'s ARE, where a flash would be', () => {
    // Without this, "no screen strings in the entry" is satisfied by a build that ships no
    // dictionary at all — which is the version that paints the first screen in its keys.
    const js = entryJs();
    expect(js.includes('PDX Service Desk'), 'the shell\'s own strings are not eager either').toBe(true);
});

test('a screen opened cold reads in words, not in keys', async ({ page }) => {
    // A section's fetch that is not waited for is a screen painted in `tickets.title`. The shell holds the outlet until the section is in.
    await page.goto('/tickets');
    const title = page.locator('[data-test="tickets"] h1');
    await expect(title).toBeVisible();
    await expect(title, 'the page painted its key instead of its title').not.toHaveText(/^tickets\./);
    await expect(title).toHaveText('Tickets');
    // The grid's own header too: a section that arrives after the imperative components are built
    // must still reach them.
    await expect(page.locator('[data-test="grid"] .pdx-dg-th[data-field="subject"]')).toContainText('Subject');
});

test('and in the other language, where the whole dictionary arrives at once', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"] h1')).toBeVisible();
    await pickLocale(page, 'it');
    await expect(page.locator('[data-test="tickets"] h1')).toHaveText('Ticket');
    await expect(page.locator('[data-test="tickets"] h1')).not.toHaveText(/^tickets\./);
});
