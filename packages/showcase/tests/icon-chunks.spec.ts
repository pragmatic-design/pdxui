/**
 * A page ships the icons it draws, not the icon set (#47).
 *
 * `pdx-icon` used to register the whole «pragmatic» set when it loaded: 359 icons, 16.3 KB gzipped
 * in this app's `pdx-icon` chunk, on every page that drew one icon. Each icon is now its own module:
 * the compiler imports the ones a template or a script names, a component imports the ones it always
 * draws, and the resolver loads any other name on demand, as its own chunk.
 *
 * Read off the sourcemaps of the build (`--sourcemap hidden`, see playwright.config.ts): which
 * modules each chunk carries, so the claim is about modules and not about file names.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const ASSETS = resolve(DIST, 'assets');

/** Every JavaScript chunk, with the source modules its sourcemap names. */
const chunks = (): { file: string; sources: string[] }[] =>
    readdirSync(ASSETS).filter((f) => f.endsWith('.js')).map((file) => ({
        file,
        sources: (JSON.parse(readFileSync(resolve(ASSETS, file + '.map'), 'utf-8')) as { sources: string[] })
            .sources.map((s) => s.replace(/\\/g, '/')),
    }));

const isIcon = (source: string, name?: string): boolean =>
    new RegExp(`ui/src/icon/pragmatic/${name ?? '[a-z0-9-]+'}\\.ts$`).test(source);

/** The chunks `index.html` names — the entry and the landing route's preloads. */
const firstPaint = (): string[] => {
    const html = readFileSync(resolve(DIST, 'index.html'), 'utf-8');
    return [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
};

test('no chunk carries the whole icon set', () => {
    const all = chunks();
    expect(all.length, 'no chunks were read: nothing is being measured').toBeGreaterThan(10);
    // The set's SVGs, or the module that registers them all — where the set lived before #47.
    const whole = all.filter((c) => c.sources.some((s) => /ui\/src\/icon\/pragmatic-(icon-data|icons)\.ts$/.test(s)));
    expect(whole.map((c) => c.file), 'the whole set is in the build again').toEqual([]);
});

test('an icon nobody draws is its own chunk, loaded only when a name asks for it', () => {
    // `archive` is in the set and named nowhere in this app.
    const holders = chunks().filter((c) => c.sources.some((s) => isIcon(s, 'archive')));
    expect(holders.length, 'the archive icon is not in the build: the on-demand chunks are missing').toBe(1);
    expect(holders[0].sources, 'the archive icon shares a chunk with other modules').toHaveLength(1);
    expect(firstPaint(), 'an icon nobody draws is on the first paint').not.toContain(holders[0].file);
});

test('the first paint carries no icon module the landing route does not name', () => {
    const preloaded = new Set(firstPaint());
    expect(preloaded.size, 'index.html names no chunk: nothing is being measured').toBeGreaterThan(0);
    const icons = chunks().filter((c) => preloaded.has(c.file))
        .flatMap((c) => c.sources.filter((s) => isIcon(s)).map((s) => s.split('/').pop()!.replace(/\.ts$/, '')));
    // The landing route's `pdx-list` brings its empty state's icon, which shows while the queue loads;
    // nothing else is a static import of the first paint.
    expect([...new Set(icons)], 'icon modules ride on the first paint').toEqual(['inbox']);
});

test('control — an icon a page names in its script is a static import of that page', () => {
    // tickets.pdx writes `actions([{ icon: 'eye', … }])`: the compiler imports `eye` with the page.
    const tickets = chunks().filter((c) => c.sources.some((s) => s.endsWith('src/pages/tickets.pdx')));
    expect(tickets.length, 'the tickets page is not in the build').toBeGreaterThan(0);
    const eye = chunks().find((c) => c.sources.some((s) => isIcon(s, 'eye')));
    expect(eye, 'the eye icon is not in the build').toBeDefined();
    const importsEye = tickets.some((c) => readFileSync(resolve(ASSETS, c.file), 'utf-8').includes(`/${eye!.file}"`)
        || readFileSync(resolve(ASSETS, c.file), 'utf-8').includes(`./${eye!.file}"`));
    expect(importsEye, 'the tickets chunk does not import the eye icon it names').toBe(true);
});
