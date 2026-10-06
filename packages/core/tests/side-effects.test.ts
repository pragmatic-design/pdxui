// A module that does something when it loads must say so, or a bundler is allowed to delete it.
//
// `component/context.ts` installs the W3C Context Protocol listener on `document` at load. With
// `sideEffects` given as an array, anything absent from it is declared pure — so a bundler that sees
// no used export from the module may drop it, and the protocol silently stops answering. `style.ts`
// and `online.ts` have exactly the same shape; every one of them has to be listed.
//
// The second half is the one that reaches a real consumer: an `import` of the published package
// resolves to `dist/`, so entries naming only `src/**` paths leave the whole published bundle read
// as pure. The array lists both forms.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

/** Files whose top level does something, not just declare things. */
function sideEffectful(srcDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) continue;
            // A template literal can hold anything at column 0 — injected CSS, an HTML string —
            // and none of it is code. Track backtick parity so those lines are not read as
            // statements; without it the scanner reported three false positives in core alone.
            let inTemplate = false;
            for (const line of readFileSync(p, 'utf8').split('\n')) {
                const wasInTemplate = inTemplate;
                if (((line.match(/`/g) ?? []).length % 2) === 1) inTemplate = !inTemplate;
                if (wasInTemplate) continue;
                // Column 0 only: anything indented belongs to a declaration's body. A top-level
                // statement that is not a declaration is a side effect at load time.
                if (/^(import|export|const|let|var|function|async|class|interface|type|enum|declare)\b/.test(line)) continue;
                if (/^[\s})\]/*>]/.test(line) || line === '') continue;
                // An object-literal entry that happens to sit at column 0 is not a statement.
                if (/^['"`][^'"`]*['"`]\s*:/.test(line)) continue;
                out.push(relative(srcDir, p).replace(/\\/g, '/'));
                break;
            }
        }
    };
    walk(srcDir);
    return out.sort();
}

/** Does any entry of the sideEffects array cover this source path? */
function covered(patterns: string[], srcRelative: string): boolean {
    const path = `src/${srcRelative}`;
    return patterns.some(p => {
        const rx = new RegExp('^' + p.replace(/^\.\//, '')
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*\//g, '(?:.*/)?')
            .replace(/\*/g, '[^/]*') + '$');
        return rx.test(path);
    });
}

const packages = readdirSync(PACKAGES, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ dir: join(PACKAGES, e.name), json: join(PACKAGES, e.name, 'package.json') }))
    .filter(p => existsSync(p.json) && existsSync(join(p.dir, 'src')))
    .map(p => ({ ...p, pkg: JSON.parse(readFileSync(p.json, 'utf8')) as Record<string, unknown> }))
    .filter(p => Array.isArray(p.pkg.sideEffects));

describe('sideEffects declarations', () => {
    it('finds packages that declare sideEffects as a list', () => {
        // A zero here would make every case below pass by iterating nothing.
        expect(packages.length).toBeGreaterThan(1);
    });

    // Calibration: the scanner is a heuristic, so pin what it finds in a package whose modules are
    // known. If this number moves, read the list before trusting anything else in this file.
    it('the scanner finds exactly the eight side-effectful modules of core', () => {
        // Each was opened and confirmed to run something at load: two resize listeners, an effect
        // on document.body, a window global, five form-control registrations, an RTL watcher, the
        // online listener, the style injector, the Context Protocol listener, the start-up splash's
        // DOMContentLoaded listener, and the `__PDX_DEVTOOLS__` global with its error
        // listeners, installed in development by debug/devtools-api.ts.
        const found = sideEffectful(join(PACKAGES, 'core', 'src'));
        expect(found).toEqual([
            'browser/online.ts',
            'browser/splash.ts',
            'component/adaptive.ts',
            'component/context.ts',
            'component/overlay-stack.ts',
            'component/style.ts',
            'component/viewport.ts',
            'debug/devtools-api.ts',
            'debug/inspector.ts',
            'form/form-registry.ts',
            'i18n/rtl.ts',
        ]);
    });

    for (const { dir, pkg } of packages) {
        const name = String(pkg.name);
        const patterns = pkg.sideEffects as string[];

        it(`${name}: every module with a load-time effect is declared`, () => {
            const missing = sideEffectful(join(dir, 'src')).filter(f => !covered(patterns, f));
            expect(missing, `${name} runs code at load in these, and declares itself pure for them`)
                .toEqual([]);
        });

        it(`${name}: the declaration also covers what a consumer imports`, () => {
            // `exports` sends consumers to dist/, so an array that anchors every pattern at src/
            // leaves the published artefact declared pure — which is where it matters. A pattern
            // with no directory anchor (`*.css`) already covers both and needs no counterpart.
            const anchored = (prefix: string) =>
                patterns.some(p => p.replace(/^\.\//, '').startsWith(prefix));
            // A package with no build ships its source and has no dist to name.
            const hasBuild = typeof (pkg.scripts as Record<string, string> | undefined)?.build === 'string';
            if (!hasBuild || !anchored('src')) return expect(patterns.length).toBeGreaterThan(0);
            expect(anchored('dist'), `${name} anchors every pattern at src/: ${patterns.join(', ')}`)
                .toBe(true);
        });
    }
});
