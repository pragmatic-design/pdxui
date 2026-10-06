// Which `use*` composables the site teaches, and which it only lists.
//
//   node tools/docs/composables-scan.mjs            the ones no page names
//   node tools/docs/composables-scan.mjs --all      every composable, with its state
//   node tools/docs/composables-scan.mjs --count    one number
//
// `api.md` is excluded on purpose: it is generated from the surface, so it mentions every export by
// construction and would make this scan pass on a documentation set that teaches nothing. What is
// measured is the NARRATIVE pages — the ones a reader reads.
//
// A composable nobody names is not a small gap: it is a feature the project paid for and nobody
// can find.
//
// INTERNAL is the other half of the measurement and the reason this is a list and not a count. Some
// composables exist for the built-in components and are public only because the barrel is flat;
// documenting them beside `useStorage` would be teaching an app author to reach into the component
// library. Each one carries the reason it is here, and the reason is what to argue with.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceOfPackage } from '../../packages/site/scripts/gen-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'packages', 'site', 'content', 'docs');

/** Packages whose surface a reader is expected to use directly. */
const PACKAGES = ['core', 'router'];

/**
 * Composables that serve the built-in components, not the app author. They stay out of the page,
 * and this list — not silence — is what says so.
 */
export const INTERNAL = {
    useDataGrid: 'the state machine of the data grid; an app drives <pdx-data-grid> through props and its exposed methods.',
    usePopover: 'the positioning engine behind pdx-popover/pdx-tooltip/pdx-dropdown-menu. An app uses those components.',
    useActiveDescendant: 'the aria-activedescendant bookkeeping the listbox-shaped components share.',
    useResizeHandle: 'the drag bookkeeping behind pdx-splitter and the resizable grid columns.',
    useScrollbar: 'the custom scrollbar pdx-scroll-area renders; the component is the API.',
    useFormAssociated: 'ElementInternals wiring for the form controls, so they work inside a native <form>.',
};

/** Every `use*` value export of the packages above. */
export function composables() {
    const found = new Map();
    for (const pkg of PACKAGES) {
        for (const [name, info] of surfaceOfPackage(pkg)) {
            if (/^use[A-Z]/.test(name)) found.set(name, { ...info, pkg });
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

/** { taught, internal, missing } — missing is the failure. */
export function scan() {
    const text = narrativeText();
    const taught = [];
    const internal = [];
    const missing = [];
    for (const name of [...composables().keys()].sort()) {
        // A word boundary on both sides: `useForm` must not be satisfied by `useFormCoordinator`.
        const named = new RegExp(`\\b${name}\\b`).test(text);
        if (name in INTERNAL) internal.push(name);
        else if (named) taught.push(name);
        else missing.push(name);
    }
    return { taught, internal, missing };
}

if (process.argv[1] && process.argv[1].endsWith('composables-scan.mjs')) {
    const { taught, internal, missing } = scan();
    if (process.argv.includes('--count')) {
        console.log(missing.length);
    } else if (process.argv.includes('--all')) {
        for (const n of taught) console.log(`taught     ${n}`);
        for (const n of internal) console.log(`internal   ${n}  — ${INTERNAL[n]}`);
        for (const n of missing) console.log(`MISSING    ${n}`);
        console.log(`\n${taught.length} taught · ${internal.length} internal · ${missing.length} named by no page`);
    } else {
        for (const n of missing) console.log(n);
        console.log(`\n${missing.length} composable(s) named by no narrative page.`);
    }
}
