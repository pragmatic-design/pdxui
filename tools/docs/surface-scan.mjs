// How much of the public surface the site actually teaches.
//
//   node tools/docs/surface-scan.mjs            the functions no narrative page names
//   node tools/docs/surface-scan.mjs --count    one number
//   node tools/docs/surface-scan.mjs --taught   the other side of the ledger
//
// Every exported FUNCTION of `@pdxui/core` and `@pdxui/router`, checked against the text of
// the narrative pages. `api.md` is excluded from the corpus on purpose: it is generated from this
// same surface, so it names every export by construction and would report a documentation set that
// teaches nothing as fully documented.
//
// The number it reports is not a target — much of what it counts is machinery no reader should
// ever meet, and a smaller public surface would be a better fix than a larger documentation set.
// It is a RATCHET: `packages/core/tests/site-content.test.ts` holds the current figure as a
// ceiling, so the gap can only close. Lowering the ceiling when
// it improves is the point; raising it needs a reason in the commit that raises it.
//
// What is left out, and why each one:
//
//   · anything that is not a function — types and classes are a different question;
//   · a doc block that says INTERNAL, @internal or "(for testing)" — the author already said so;
//   · the HMR and dev-server plumbing (`__pdx*`, `hmr*`), which exists for the tooling;
//   · `clear*` helpers whose only callers are test suites resetting module state.
//
// Every one of those is a judgement, and a wrong one hides a real gap. They are listed here rather
// than buried in a regex so they can be argued with.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceOfPackage } from '../../packages/site/scripts/gen-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'packages', 'site', 'content', 'docs');

const PACKAGES = ['core', 'router'];

/** A doc block that says the author never meant this for an application. */
const INTERNAL_DOC = /\b(INTERNAL|@internal|for testing|test-only|not part of the public API)\b/i;

/** Names that are plumbing by shape, not by doc block. */
const PLUMBING = /^(__|hmr[A-Z]|clear[A-Z].*(?:Registry|Providers|Cache|Queue)$)/;

/** Every exported function of the packages above, minus the ones nobody should meet. */
export function publicFunctions() {
    const found = new Map();
    for (const pkg of PACKAGES) {
        for (const [name, info] of surfaceOfPackage(pkg)) {
            if (!/^function\b/.test(info.signature ?? '')) continue;
            if (PLUMBING.test(name)) continue;
            if (INTERNAL_DOC.test(info.doc ?? '')) continue;
            found.set(name, { ...info, pkg });
        }
    }
    return found;
}

/** The narrative pages, as one blob. `api.md` is generated and would match everything. */
export function narrativeText() {
    return readdirSync(DOCS)
        .filter(f => f.endsWith('.md') && f !== 'api.md')
        .map(f => readFileSync(join(DOCS, f), 'utf8'))
        .join('\n');
}

/** { total, taught, missing } — `missing` is the ratcheted number. */
export function scan() {
    const text = narrativeText();
    const taught = [];
    const missing = [];
    for (const name of [...publicFunctions().keys()].sort()) {
        // Not `\b`: the i18n helpers are `$t`, `$n`, `$d`, `$r`, and `\b$t` demands a word character
        // before the `$`, so every one of them was reported unnamed while `i18n.md` teaches them on
        // its first page. Lookarounds over the identifier alphabet instead — which also keeps
        // `resource` from being satisfied by `resourceWhen`.
        const boundary = new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`);
        if (boundary.test(text)) taught.push(name);
        else missing.push(name);
    }
    return { total: taught.length + missing.length, taught, missing };
}

if (process.argv[1] && process.argv[1].endsWith('surface-scan.mjs')) {
    const { total, taught, missing } = scan();
    if (process.argv.includes('--count')) {
        console.log(missing.length);
    } else if (process.argv.includes('--taught')) {
        for (const n of taught) console.log(n);
        console.log(`\n${taught.length} of ${total} exported functions are named by a narrative page.`);
    } else {
        for (const n of missing) console.log(n);
        console.log(`\n${missing.length} of ${total} exported functions are named by no narrative page.`);
    }
}
