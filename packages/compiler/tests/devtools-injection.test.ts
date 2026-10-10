// The devtools script the plugin injects has to be something the browser can actually load.
//
// Not an INLINE `<script type="module">` carrying a bare specifier:
//
//     <script type="module">
//       import { initDevTools } from '@pdxui/core/devtools';
//       initDevTools();
//     </script>
//
// An inline script added in `transformIndexHtml` does not go through Vite's import rewriting, so the
// bare specifier reaches the browser as written, and a consumer app logs, once per page:
//
//     Failed to resolve module specifier "@pdxui/core/devtools".
//     Relative references must start with either "/", "./", or "../".
//
// It costs more than a console line: a definition of done that requires a clean console fails on
// this alone in a run that has nothing else wrong with it — and it teaches whoever sees it to ignore
// console errors, which is worse than the error.
//
// The other half: an inline script breaks strict CSP. A virtual module fixes both: the plugin
// resolves it, and there is nothing inline to forbid.

import { describe, it, expect } from 'vitest';
import { pdx } from '../src/plugin';
import { elementBodies } from '../src/text-scan';

interface HtmlPlugin {
    transformIndexHtml(html: string): string | undefined;
    resolveId(id: string): string | undefined;
    load(id: string): string | undefined;
    config(c: Record<string, unknown>, env: { command: string }): unknown;
}

const HTML = '<!doctype html><html><head></head><body><div id="app"></div></body></html>';

/** A plugin instance in dev mode, with devtools on. */
function devPlugin(): HtmlPlugin {
    const p = pdx({ devtools: true }) as unknown as HtmlPlugin;
    p.config({}, { command: 'serve' });
    return p;
}

describe('the injected devtools script is loadable', () => {
    it('injects something at all when devtools are on', () => {
        const out = devPlugin().transformIndexHtml(HTML);
        expect(out, 'nothing was injected — the rest of this file would pass vacuously').toBeTruthy();
        expect(out).toContain('script');
    });

    it('runs before the app\'s own script, so the inspector records the signals the app creates', () => {
        const page = '<!doctype html><html><head><title>x</title></head><body><div id="app"></div>'
            + '<script type="module" src="/src/main.ts"></script></body></html>';
        const out = devPlugin().transformIndexHtml(page) ?? '';
        const devtools = out.indexOf('virtual:pdx-devtools');
        expect(devtools, 'no devtools script').toBeGreaterThan(-1);
        expect(devtools, 'the devtools script comes after the app\'s entry').toBeLessThan(out.indexOf('/src/main.ts'));
        expect(devtools, 'not in the head').toBeLessThan(out.indexOf('</head>'));
    });

    it('does not put a bare specifier in an inline script', () => {
        // The rule: an inline module script is not rewritten, so every
        // specifier inside one must already be loadable by the browser.
        const out = devPlugin().transformIndexHtml(HTML) ?? '';
        const inlineScripts = elementBodies(out, 'script');
        for (const body of inlineScripts) {
            const imports = [...body.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
            for (const spec of imports) {
                expect(spec.startsWith('/') || spec.startsWith('./') || spec.startsWith('../'),
                    `inline script imports the bare specifier "${spec}", which the browser cannot resolve`)
                    .toBe(true);
            }
        }
    });

    it('serves whatever module it points at', () => {
        // A src= that nothing answers is the same bug wearing a different message (404 instead of a
        // resolution error), so the reference and the plugin that serves it are asserted together.
        const p = devPlugin();
        const out = p.transformIndexHtml(HTML) ?? '';
        const src = out.match(/<script[^>]*\bsrc=["']([^"']+)["']/)?.[1];
        expect(src, 'the devtools script must be a real reference, not inline code').toBeTruthy();

        // Decode the URL the way Vite does: `/@id/` + the resolved id, whose leading NUL is written
        // `__x00__`. Checking only that a src EXISTS passes while the tag is dropped from the served
        // HTML — a clean console with no devtools, which is a silenced bug wearing a fix's clothes.
        // Loading through the id the URL actually names is what makes it impossible to pass on a URL
        // nothing answers.
        const id = src!.replace(/^\/@id\//, '').replace('__x00__', '\u0000');
        const code = p.load(id);
        expect(code, 'and load it').toBeTruthy();
        expect(code).toContain('initDevTools');
    });

    it('injects on every call, because Vite makes more than one', () => {
        // A plugin-lifetime boolean guard fails here: the FIRST call consumes it, and the page that
        // actually reaches the browser — a later call — comes back with no script. The symptom is
        // devtools that never initialise and an injected import error that shows up only sometimes,
        // which reads as flakiness.
        //
        // Idempotence has to come from the CONTENT: inject unless this document already has it.
        const p = devPlugin();
        const first = p.transformIndexHtml(HTML) ?? HTML;
        const second = p.transformIndexHtml(HTML) ?? HTML;
        expect(first).toContain('pdx-devtools');
        expect(second, 'a second document must be served with the script too').toContain('pdx-devtools');

        // And the same document twice must not accumulate two of them.
        const twice = p.transformIndexHtml(first) ?? first;
        expect((twice.match(/pdx-devtools/g) ?? []).length, 'exactly one').toBe(1);
    });

    it('injects nothing when devtools are off', () => {
        const p = pdx({ devtools: false }) as unknown as HtmlPlugin;
        p.config({}, { command: 'serve' });
        expect(p.transformIndexHtml(HTML) ?? HTML).not.toContain('initDevTools');
    });

    it('injects nothing in a production build', () => {
        const p = pdx({ devtools: true }) as unknown as HtmlPlugin;
        p.config({}, { command: 'build' });
        expect(p.transformIndexHtml(HTML) ?? HTML).not.toContain('initDevTools');
    });
});
