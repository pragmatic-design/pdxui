// PDX_LOADER_READS_SETUP — a `@loader` or `@page` label function that reads the component's setup (#977).
//
// Both are lifted to module scope (`hoistLoader`): the router calls a loader before the component
// exists, and a breadcrumb builds a label outside any component. Every other declaration of the script
// stays in the component's `setup()`. A function that reads one compiled clean and threw a
// ReferenceError the first time its route was visited — in the page module and in the loader's own
// module alike.
//
// What it reads is measured on its code with the types erased and the scopes followed (`freeNames`):
// a name in an annotation is not a read, and neither is another function's local of the same name.

import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { hoistLoader } from './codegen-shared';
import { eraseTypes } from './erase-types';
import { freeNames } from './free-names';

/** The names the component's setup declares: what a function lifted to module scope cannot see. */
function setupNames(analysis: ScriptAnalysis): Set<string> {
    const s = new Set<string>();
    for (const p of analysis.props) s.add(p.name);
    for (const e of analysis.events) s.add(e.emitter ?? e.name);
    for (const sig of analysis.signals) s.add(sig.name);
    for (const d of analysis.deriveds) s.add(d.name);
    for (const st of analysis.stores) s.add(st.name);
    for (const f of analysis.forms) s.add(f.name);
    for (const f of analysis.fetches) s.add(f.name);
    for (const inj of analysis.injects) s.add(inj.name);
    for (const st of analysis.states) s.add(st.name);
    for (const a of analysis.actions ?? []) s.add(a.name);
    for (const sn of analysis.snippets) s.add(sn.name);
    // What the setup returns: its own constants, functions and plain variables, and a loader's source.
    for (const e of analysis.exports) s.add(e.name);
    if (analysis.route.loaderName) s.add(analysis.route.loaderName);
    // The two functions lifted beside each other are at module scope, and so is every import.
    if (analysis.route.loader) s.delete(analysis.route.loader);
    if (analysis.route.labelFn) s.delete(analysis.route.labelFn);
    for (const n of analysis.importedNames ?? []) s.delete(n);
    for (const n of analysis.coreImportNames) s.delete(n);
    return s;
}

/** Report each lifted function of the route that reads a name of the component's setup. */
export function checkRouteFnReads(analysis: ScriptAnalysis, warnings: ValidationWarning[]): void {
    const lifted: { fn: string; what: string }[] = [];
    if (analysis.route.loader) lifted.push({ fn: analysis.route.loader, what: 'loader' });
    if (analysis.route.labelFn && analysis.route.labelFn !== analysis.route.loader) {
        lifted.push({ fn: analysis.route.labelFn, what: 'label function' });
    }
    if (lifted.length === 0) return;
    const setup = setupNames(analysis);
    for (const { fn, what } of lifted) {
        const hoisted = hoistLoader(analysis.body, fn);
        if (!hoisted) continue; // PDX_LOADER_NOT_FOUND / PDX_LABEL_NOT_FOUND say so
        const read = freeNames(eraseTypes(hoisted.declaration, `${fn}.ts`));
        if (!read) continue;
        const names = [...read].filter((n) => setup.has(n));
        if (names.length === 0) continue;
        const list = names.map((n) => `'${n}'`).join(', ');
        warnings.push({
            code: 'PDX_LOADER_READS_SETUP',
            severity: 'error',
            message: `The ${what} \`${fn}\` reads ${list}, which the component's setup declares. It runs at module scope, `
                + `before the component exists, where ${names.length === 1 ? 'that name is' : 'those names are'} not defined: `
                + 'the route throws a ReferenceError the first time it is visited.',
            hint: 'Move the value into a module and import it, or take it from the route: a loader reads `ctx.params` and '
                + '`ctx.query`, a label its `params`.',
        });
    }
}
