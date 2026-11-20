// A diagnostic added tomorrow is behind `DEV`, or this fails and says which one is not.
//
// `diagnostics.spec.ts` in the showcase measures the BUNDLE, which is the honest end of it — but it
// measures the messages it knows to look for, and it needs a production build to run. This one
// reads the sources, so a new `console.warn` that teaches the author something is caught where it
// is written, in the package's own suite, with no build.
//
// The rule, and the only judgement call here:
//
//   · it teaches the AUTHOR something — a prop of the wrong shape, a missing name, two features
//     that do not compose → behind `DEV`, and it leaves the production bundle;
//   · it reports a FAILURE at runtime — an unhandled error, a loader that did not answer, a
//     reactive cycle the runtime had to break → it stays, and it is named below with the reason.
//     Silencing these in production is how an incident becomes unreadable.
//
// The list is what makes the second kind deliberate. Nothing here is a lint rule about phrasing:
// what is checked is that the CALL is guarded, which is the only thing that decides whether a
// visitor downloads the message.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PACKAGES = resolve(__dirname, '..', '..');

/**
 * Calls that stay in a production build, each because it reports something that WENT WRONG.
 *
 * Keyed by `package/path:symbol-ish`, valued by the reason — which is the part a reader needs and
 * the part that makes adding an entry a decision rather than a reflex.
 */
const REPORTS_A_FAILURE: Record<string, string> = {
    'core/src/component/component.ts': 'a component setup threw: the app is broken and says so',
    'core/src/component/global-error.ts': 'the global error handler, which exists to report failures',
    'core/src/i18n/loader.ts': 'a translation file did not load — a network failure, not a mistake',
    'core/src/reactivity/signal.ts:flush': 'a reactive cycle the runtime had to break, after 100 flushes',
    'ui/src/rich-text/view/view.ts': 'the DOM selection could not be moved: a browser refusal, caught',
};

/** Every `.ts` under a package's `src`, excluding declaration files. */
function sources(pkg: string): string[] {
    const root = join(PACKAGES, pkg, 'src');
    const out: string[] = [];
    (function walk(dir: string): void {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
        }
    })(root);
    return out;
}

/**
 * Is this `console.*` call guarded by `DEV`?
 *
 * Read from the 8 lines above the call, which is where the guard is: on the same line
 * (`if (DEV) console.warn(…)`), in the condition of the block it is in (`if (DEV && !warned) {`),
 * or in an early return (`if (!DEV || …) return;`). A call whose guard is further away than that
 * is one a reader cannot see either.
 */
function isGuarded(lines: string[], i: number): boolean {
    return lines.slice(Math.max(0, i - 8), i + 1).some((l) => /\bDEV\b/.test(l));
}

interface Call { where: string; line: number; text: string }

function unguarded(pkg: string): Call[] {
    const found: Call[] = [];
    for (const file of sources(pkg)) {
        const rel = `${pkg}/${relative(join(PACKAGES, pkg), file).replace(/\\/g, '/')}`;
        const lines = readFileSync(file, 'utf-8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!/(?<!\/\/.*)\bconsole\.(warn|error)\(/.test(lines[i])) continue;
            if (isGuarded(lines, i)) continue;
            if (Object.keys(REPORTS_A_FAILURE).some((k) => rel === k || k.startsWith(`${rel}:`))) continue;
            found.push({ where: rel, line: i + 1, text: lines[i].trim().slice(0, 90) });
        }
    }
    return found;
}

describe('a diagnostic costs nothing in production', () => {
    for (const pkg of ['core', 'ui']) {
        it(`every console.warn|error in @pdxui/${pkg} is behind DEV, or named as a failure report`, () => {
            const calls = unguarded(pkg);
            expect(calls.map((c) => `${c.where}:${c.line} — ${c.text}`),
                'a message that explains a mistake is downloaded by every visitor and can be acted '
                + 'on by none of them. Put the call behind `if (DEV)` (core/src/utils/env.ts), or, '
                + 'if it reports a runtime FAILURE, name the file in REPORTS_A_FAILURE with why')
                .toEqual([]);
        });
    }

    it('reads real files, and the guard list still names calls that exist', () => {
        // Without this the two assertions above pass on an empty scan — the failure mode of every
        // source-reading check. Both numbers are the zero this was written against.
        expect(sources('core').length, 'no core sources were read').toBeGreaterThan(50);
        expect(sources('ui').length, 'no ui sources were read').toBeGreaterThan(100);

        const guarded = ['core', 'ui'].flatMap(sources)
            .filter((f) => /\bDEV\b/.test(readFileSync(f, 'utf-8')));
        expect(guarded.length, 'nothing in either package guards a diagnostic any more')
            .toBeGreaterThan(15);

        for (const key of Object.keys(REPORTS_A_FAILURE)) {
            const file = join(PACKAGES, key.split(':')[0]);
            expect(readFileSync(file, 'utf-8'), `${key} no longer logs anything: drop its entry`)
                .toMatch(/console\.(warn|error)\(/);
        }
    });
});

// ─── The inspector and the devtools API are development's (#1246) ──────────────────────────────────
//
// A production bundle carries neither `debug/inspector.ts` nor `debug/devtools-api.ts`: every call
// into them from the rest of core is behind `DEV`, so the branch folds away with the import. The one
// telemetry production may turn on, level 1, reaches the flush through `debug/telemetry-hooks.ts`,
// installed by `setTelemetryLevel` — the flush names nothing of the inspector.

/** The names `debug/inspector.ts` and `debug/devtools-api.ts` export that a module imports from them. */
function debugImports(text: string): string[] {
    // Match: `import { a, b as c } from '…/debug/inspector'` (or devtools-api), not `import type`.
    // Groups: [1]=the braces' content
    const names: string[] = [];
    for (const m of text.matchAll(/^import\s+\{([^}]*)\}\s+from\s+'[./]+(?:debug\/)?(?:inspector|devtools-api)';/gm)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
            if (name && !part.trim().startsWith('type ')) names.push(name);
        }
    }
    return names;
}

describe('a production bundle carries no debug code', () => {
    // The debug modules themselves and the devtools overlay, which is development's by its entry.
    const outside = sources('core').filter((f) => !/[\\/]src[\\/](debug|devtools)[\\/]/.test(f));

    it('every call into the inspector or the devtools API is behind DEV', () => {
        const unguardedCalls: string[] = [];
        for (const file of outside) {
            const text = readFileSync(file, 'utf-8');
            const names = debugImports(text);
            if (names.length === 0) continue;
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (/^import\b/.test(lines[i])) continue;
                for (const name of names) {
                    if (!new RegExp(`(?<![\\w$.])${name}\\(`).test(lines[i])) continue;
                    if (!isGuarded(lines, i)) unguardedCalls.push(`${relative(PACKAGES, file).replace(/\\/g, '/')}:${i + 1} — ${lines[i].trim().slice(0, 90)}`);
                }
            }
        }
        expect(unguardedCalls, 'a call into the debug modules outside DEV keeps them in every production '
            + 'bundle: put it behind `if (DEV)`, or, for level-1 telemetry, go through debug/telemetry-hooks.ts')
            .toEqual([]);
    });

    it('HMR\'s instance registry and saved state are filled only in development (#1246, part 3a)', () => {
        // Match: a call that fills what only a hot update reads — the live instances by tag, the setup's
        // signals. Groups: none
        const hmr = /(?<![\w$.])(trackInstance|untrackInstance)\(|\._setupSignals\s*=/;
        const unguardedHmr: string[] = [];
        for (const file of outside) {
            if (file.endsWith(`${'define'}.ts`)) continue;
            const lines = readFileSync(file, 'utf-8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (/^import\b/.test(lines[i]) || !hmr.test(lines[i])) continue;
                if (!isGuarded(lines, i)) unguardedHmr.push(`${relative(PACKAGES, file).replace(/\\/g, '/')}:${i + 1} — ${lines[i].trim().slice(0, 90)}`);
            }
        }
        expect(unguardedHmr, 'HMR\'s bookkeeping runs on every mount of a production app: put it behind DEV').toEqual([]);
    });

    it('reads modules that import the debug modules, and the flush goes through the hooks', () => {
        const importers = outside.filter((f) => debugImports(readFileSync(f, 'utf-8')).length > 0);
        // The zero this was written against: signal, element, component, list, global-store, global-error.
        expect(importers.length, 'no module imports the debug modules: the check above read nothing').toBeGreaterThanOrEqual(5);
        const signal = readFileSync(join(PACKAGES, 'core', 'src', 'reactivity', 'signal.ts'), 'utf-8');
        expect(signal).toMatch(/telemetryHooks/);
        expect(debugImports(signal), 'the flush calls the inspector\'s level-1 counters directly')
            .not.toEqual(expect.arrayContaining(['flushStart']));
    });
});
