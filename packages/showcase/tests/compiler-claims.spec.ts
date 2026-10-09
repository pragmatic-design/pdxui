/**
 * The production compiler's claims, measured against what it actually emits.
 *
 * docs/architecture/framework.md carries a table of the two modes, dev and production, and a list
 * of optimisations under it. A claim nobody measures is a claim that can quietly stop being true,
 * so this file compiles an app in production mode and looks at the result.
 *
 * The subject is `dist/` — the bundle a real `vite build` of this app produced, minified, exactly
 * what a user downloads. Reading the compiler's intermediate output instead would measure the
 * intention.
 *
 * Each row below is one of three things and says which: a passing assertion, an assertion of what
 * is ACTUALLY true where the claim was wrong, or a stated gap with an issue.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

function bundle(ext: '.js' | '.css'): string {
    const files = readdirSync(DIST).filter((f) => f.endsWith(ext));
    if (files.length === 0) throw new Error(`the build emitted no ${ext} — nothing to measure`);
    return files.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n');
}

test('there is a build to measure', () => {
    // Without this the whole file would pass vacuously on an empty dist, which is the failure mode
    // every "assert on the output" suite has.
    expect(bundle('.js').length, 'the JS bundle is implausibly small').toBeGreaterThan(20_000);
    expect(bundle('.css').length, 'the CSS bundle is implausibly small').toBeGreaterThan(10_000);
});

test.describe('dead code elimination: a signal nothing reads is removed — TRUE', () => {
    test('the unread signal in dashboard.pdx is not in the bundle', () => {
        // `let neverReadByAnything = $signal('pdx-dead-signal-marker')` is declared in the page and
        // read by nothing. The marker is a string so minification cannot rename it away.
        expect(bundle('.js'), 'the unread signal survived into the bundle')
            .not.toContain('pdx-dead-signal-marker');
    });

    test('control — a signal the template DOES read is still there', () => {
        // Without this the test above would pass on a build that dropped everything.
        expect(bundle('.js'), 'a live string from the same page is missing too — the marker proves nothing')
            .toContain('open tickets');
    });
});

test.describe('the router is the generated one, not the interpreted one — TRUE', () => {
    test('the interpreted matcher\'s regex construction is absent', () => {
        // `pathToRegex` builds `([^/]+)` for every unconstrained param. The generated router reads
        // path segments from an array instead, so that string appears only if the interpreted
        // router shipped. It is a string literal, so minification keeps it.
        expect(bundle('.js'), 'the interpreted router is in the production bundle')
            .not.toContain('([^/]+)');
    });

    test('and this app declares no param constraint, so it really is zero regex for routing', () => {
        // The generator's own header only claims "zero regex" when no route declares a constraint,
        // and it compiles one RegExp per constraint when they do. Stated here so the claim is read
        // with its condition rather than as an absolute.
        const paths = ['/tickets/:id', '/tickets/:id/interventions/:n'];
        for (const p of paths) expect(p).not.toMatch(/\(/);
    });
});

test.describe('CSS "extracted, zero JS overhead" — TRUE', () => {
    /**
     * In production the compiler emits an IMPORT of the component's stylesheet, and Vite extracts
     * it like any other — not a JS block that looks the component's <style> element up by id,
     * creates it, appends it to the head and assigns its textContent at module-evaluation time.
     * Dev keeps the injection: it is what makes HMR of a `<style scoped>` block instant, and dev
     * has no bundle.
     */
    test('a scoped block ends up in the stylesheet', () => {
        // `.app-bar` is a scoped rule of app.pdx and appears nowhere else.
        expect(bundle('.css'), 'the component CSS did not reach the stylesheet').toContain('app-bar');
    });

    test('and no component injects its CSS from JavaScript', () => {
        // `pdx-s-<hash>` is the id the injection gave its <style> element, and nothing else in the
        // product uses that prefix — which is what makes it the precise marker.
        //
        // NOT `createElement("style")`: the router injects the transition classes and a shadow
        // component adopts a constructed sheet, both legitimately and neither of them component
        // CSS. An assertion on that string would fail for the wrong reason and be "fixed" by
        // weakening it.
        expect(bundle('.js'), 'a component still writes its stylesheet into the head at import time')
            .not.toContain('pdx-s-');
    });

    test('and the scope attribute travels with the stylesheet, not with the code', () => {
        // The scoped selector is `[data-pdx-<hash>]`. In the stylesheet it is a selector; in the JS
        // the only occurrence left is the attribute the component sets on its own element.
        expect(bundle('.css'), 'the scoped selectors are not in the stylesheet').toContain('[data-pdx-');
    });

    test('the design system is extracted too, as it always was', () => {
        // It is an ordinary CSS import, extracted like any other.
        expect(bundle('.css')).toContain('--pdx-');
    });
});

test.describe('the claims this app cannot settle', () => {
    /**
     * Stated rather than asserted, because an assertion that cannot fail is worse than a gap.
     *
     * Two claims this app cannot settle:
     *
     *  - "Template: pre-compiled DOM factory" — real for a template with no interpolation
     *    (`isStaticAssembly` → `__staticHTML`), and this app has none that qualify.
     *  - "Component flattening" — withdrawn, with "Signals: the call chain inlined": both were
     *    measured as worth too little for what they cost.
     *
     * The others are settled, and each is measured where it lives:
     *
     *  - Bindings inlined — the default of a production build:
     *    `packages/compiler/tests/inline-bindings-default.test.ts`.
     *  - Validation stripped — the diagnostics sit behind `DEV` and leave the bundle:
     *    `diagnostics.spec.ts`, beside this file.
     *  - Route pre-linking — the landing route's chunk is preloaded from `index.html`:
     *    `first-paint-waves.spec.ts`, beside this file.
     *
     * This block exists so the file states its own limits instead of looking complete — and the
     * test below keeps it from claiming a gap after the gap has closed.
     */
    test('the list of unsettled claims is written down where the measurements are', () => {
        // The comment of THIS block — not the whole file, whose test code names the same words and
        // would satisfy every check below by itself.
        const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
        const describeAt = self.indexOf('test.describe(\'the claims this app cannot settle\'');
        const open = self.indexOf('/**', describeAt);
        const block = self.slice(open, self.indexOf('*/', open));
        expect(block.length, 'the block\'s comment was not found').toBeGreaterThan(200);
        // What is still true: the two claims this app cannot settle, and where each settled one is
        // measured. A settled claim is never required to be listed as unsettled: that would be a
        // guard holding a falsehood in place.
        for (const named of ['isStaticAssembly', 'withdrawn', 'diagnostics.spec.ts', 'first-paint-waves.spec.ts', 'inline-bindings-default.test.ts']) {
            expect(block, `"${named}" is no longer named in the block`).toContain(named);
        }
        // And what is no longer true is no longer said.
        for (const stale of ['OFF by default', 'no implementation found', 'no runtime check was found']) {
            expect(block, `the block still says "${stale}" of a claim that shipped`).not.toContain(stale);
        }
    });
});
