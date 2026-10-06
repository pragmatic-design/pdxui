// `DEV` answers what a BROWSER build is, not what Node is — and it disappears from a production
// one.
//
// Not `globalThis.process.env.NODE_ENV`: no bundler rewrites that — they replace the literal
// expression `process.env.NODE_ENV` — and no browser defines `process`, so in every browser it
// would be false: the devtools debug hook never installed, and every dev-only warning in core
// silent. In the tests, run by Node, `process` exists, so a Node test alone never sees it.
//
// And not a FUNCTION, which would keep every diagnostic in the production bundle: a call
// the minifier will not inline is a branch it cannot fold, so the message ships to every visitor
// whether or not it could ever be printed. As a const the branch folds away with its string, which
// is the second half of this file: `folds()` compiles a call site the way a build does and asserts
// the message is GONE.
//
// This compiles env.ts the way a bundler does (esbuild, with and without the NODE_ENV define) and
// runs it in a scope that looks like a browser: no `process` binding at all, and a `globalThis`
// without one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformWithEsbuild } from 'vite';

const SOURCE = readFileSync(join(__dirname, '..', 'src', 'utils', 'env.ts'), 'utf-8');

/** Compile env.ts as a bundler would and read DEV where there is no `process`. */
async function devInBrowser(define?: Record<string, string>): Promise<boolean> {
    const out = await transformWithEsbuild(SOURCE, 'env.ts', { loader: 'ts', format: 'cjs', define });
    const module: { exports: { DEV?: boolean } } = { exports: {} };
    // `process` and `globalThis` are shadowed: a browser has neither a process nor one on its
    // global. Leaving the parameter out does NOT emulate that — the function's scope chain reaches
    // Node's real `process` and the module reads NODE_ENV=test. Shadowed with `undefined` the read
    // throws a TypeError where a browser throws a ReferenceError; both are the module failing to
    // load, which is the thing being asserted.
    new Function('module', 'exports', 'process', 'globalThis', out.code)(module, module.exports, undefined, {});
    return module.exports.DEV!;
}

describe('DEV in a browser build', () => {
    it('a dev build (the bundler defines NODE_ENV as development) is dev', async () => {
        expect(await devInBrowser({ 'process.env.NODE_ENV': '"development"' }), 'a Vite dev page was taken for production').toBe(true);
    });

    it('a production build is not', async () => {
        expect(await devInBrowser({ 'process.env.NODE_ENV': '"production"' })).toBe(false);
    });

    it('with no bundler and no process it THROWS — which is why the CDN bundle replaces it', async () => {
        // This is the half of the contract that pays for the folding. The guarded form,
        // `typeof process !== 'undefined' && …`, never throws and is wrong twice: esbuild alone
        // does not fold it (the diagnostics ship), and where it survives to runtime it is FALSE in
        // a browser — every dev warning silent.
        //
        // So the expression is bare, and whoever builds for a place with no `process` replaces it.
        // The one such place is the CDN bundle, and the test below is what holds it to that.
        await expect(devInBrowser(), 'env.ts loaded in a browser-shaped scope without throwing: '
            + 'the expression is no longer bare, and a bare one is what every bundler folds')
            .rejects.toThrow();
        // And with the define it neither throws nor reports dev — which is what the CDN ships.
        expect(await devInBrowser({ 'process.env.NODE_ENV': '"production"' })).toBe(false);
    });

    it('and the CDN build replaces it, so that file does not reach a browser as it is written', () => {
        const config = readFileSync(join(__dirname, '..', 'vite.config.iife.ts'), 'utf-8');
        expect(config, 'the IIFE build no longer defines NODE_ENV: a `<script src>` of it throws on '
            + 'its first line, because a browser has no `process`')
            .toMatch(/define:\s*\{[^}]*'process\.env\.NODE_ENV':\s*'"production"'/s);
    });
});

/**
 * A call site, minified the way a production build minifies it.
 *
 * `esbuild` with `minify` is what Vite runs, and the bundle measured on the showcase agrees with
 * this: the diagnostic strings are gone from it. Asserted here too because it is a property of how
 * `DEV` is WRITTEN — a bare `process.env.NODE_ENV`, which every bundler replaces and esbuild alone
 * then folds — and the next person to rewrite that line has to keep it.
 */
async function minifiedCallSite(define?: Record<string, string>): Promise<string> {
    const source = `${SOURCE}
export function f(x: unknown): void {
    if (DEV) console.warn('[pdx] a diagnostic nobody should ship: ' + String(x));
}`;
    const out = await transformWithEsbuild(source, 'env.ts', { loader: 'ts', format: 'esm', define, minify: true });
    return out.code;
}

describe('a diagnostic behind DEV', () => {
    it('is not in the output of a production build', async () => {
        const code = await minifiedCallSite({ 'process.env.NODE_ENV': '"production"' });
        expect(code, 'the branch folded but its message is still shipped')
            .not.toContain('a diagnostic nobody should ship');
    });

    it('control — it IS in the output of a dev build', async () => {
        const code = await minifiedCallSite({ 'process.env.NODE_ENV': '"development"' });
        expect(code, 'the guard removed the diagnostic from dev as well, which removes the point of it')
            .toContain('a diagnostic nobody should ship');
    });

    it('control — and in a build where nothing is defined, which is what a package publishes', async () => {
        // Vite's library build leaves `process.env.*` alone so the CONSUMING app decides. A
        // published package therefore still carries its diagnostics, and the app that bundles it
        // drops them.
        const code = await minifiedCallSite();
        expect(code).toContain('a diagnostic nobody should ship');
    });
});
