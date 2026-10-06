// In-browser PDX compile for the playground.
// compileSFC is a pure string→string transform (no Node deps) → it runs in the browser.
// The generated module imports from '@pdxui/core'; we rewrite that import to inject the
// already-loaded core namespace, strip other imports/exports, and run the body via new Function.
// Each build uses a fresh tag (the compiler derives it from a unique filename) so re-defining a
// custom element never throws while the user types.

import * as core from '@pdxui/core';
// Import the PURE compile functions directly from source — the package index also
// re-exports the Vite plugin (fs/path), which can't be bundled for the browser.
import { parseSFC } from '../../../compiler/src/parser/sfc';
import { parseTemplate } from '../../../compiler/src/parser/template';
import { compileSFC } from '../../../compiler/src/compiler/codegen';

// Loaded on demand by the playground route (a dynamic import), never statically: this module brings
// the compiler and TypeScript with it. The starting source is in playground-default.ts.

let seq = 0;

/** Compile + register a single-component .pdx; returns the tag to render. Throws on error. */
export function compilePdx(src: string): { tag: string } {
    seq++;
    const filename = `pg-${seq}.pdx`;
    const descriptor = parseSFC(src);
    const ast = descriptor.template ? parseTemplate(descriptor.template.content, 1) : [];
    let code = compileSFC(descriptor, ast, filename);

    const m = code.match(/component\(\s*['"]([a-z][a-z0-9-]*)['"]/);
    if (!m) throw new Error('No component found. The playground compiles a single component (template + script setup).');
    const tag = m[1];

    code = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*['"]@pdxui\/core['"];?/g, 'const {$1} = __core;')
        .replace(/^\s*import\s+.*$/gm, '')                 // drop any other imports
        .replace(/^\s*export\s+default\s+/gm, 'void ')      // neutralize default export
        .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')      // drop named re-exports
        .replace(/^\s*export\s+/gm, '');                    // export const/function → local

    // ── INVARIANT: `src` comes from the textarea and from nowhere else. ──────────────────────────
    //
    // This runs user code with `new Function`, on the site's own origin, with no sandbox. That is
    // fine while the only person who can supply the source is the person reading the screen: they
    // are running their own code, which is the entire point of a playground.
    //
    // It stops being fine the moment the source can come from somewhere else. The obvious feature to
    // add here is "share this snippet" via the URL — every playground has one — and reading the
    // snippet from location.hash, localStorage, a postMessage or a fetch turns this line into a
    // same-origin XSS that is triggered by sending someone a link to the site.
    //
    // If sharing is wanted, the fix is NOT to sanitise the snippet; there is no sanitiser for
    // arbitrary JavaScript. Execute it on a SEPARATE ORIGIN — an iframe served from a different
    // host, the way CodePen and JSFiddle do — so that what the snippet can reach is not this site.
    //
    // packages/core/tests/playground-invariant.test.ts fails if this file or playground.pdx starts
    // reading any of those channels. Deleting that test is deleting the only thing that says so.

    // eslint-disable-next-line no-new-func
    new Function('__core', code)(core);
    return { tag };
}
