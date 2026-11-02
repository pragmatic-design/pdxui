// An `@expose`d $signal or $derived is its value on the element (#752), not the function the component
// keeps it in. A caller that called it through a `:ref` — `counter.count()` — now reads the value and
// calls it. `pdx migrate` flags each such call: `counter.count` reads it, and `counter.count = v`
// writes a signal one. Which names are reactive is the child's to say, another file: the change needs
// the resolver's `reactiveExposedOf`, and without it finds nothing.

import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The reactive names a component tag exposes, or null when it is not a project .pdx the resolver read. */
export type ReactiveExposedLookup = (tag: string) => ReadonlySet<string> | null;

// Match: the opening tag of a custom element with a `:ref="name"`. Groups: [1]=the tag [2]=the ref
const REF_ON_TAG = /<([A-Za-z][\w]*-[\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?\s:ref=["']([A-Za-z_$][\w$]*)["']/g;

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** `text` as a regular expression that matches it literally. */
function escapeRegExp(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export const exposeReactiveCall: LanguageChange = {
    id: 'expose-reactive-call',
    kind: 'changed',
    scope: 'pdx',
    issue: 752,
    message: 'An `@expose`d $signal or $derived is its value on the element, not a function: read `ref.name`, '
        + 'and write `ref.name = value` for a $signal (a $derived is read-only).',
    marker: ':ref=',
    detect(text, context): LanguageChangeFinding[] {
        const lookup = context?.reactiveExposedOf;
        if (!lookup) return [];
        const out: LanguageChangeFinding[] = [];
        for (const m of text.matchAll(REF_ON_TAG)) {
            const names = lookup(m[1].toLowerCase());
            if (!names || names.size === 0) continue;
            const alternatives = [...names].map(escapeRegExp).join('|');
            // Match: `ref.name(` / `ref?.name(` — a call of an exposed reactive name, not a property of
            // another binding (`x.ref.name(`). Groups: none.
            const call = new RegExp(`(?<![\\w$.])${escapeRegExp(m[2])}\\??\\.(?:${alternatives})\\s*\\(\\s*\\)`, 'g');
            for (const c of text.matchAll(call)) out.push({ line: lineAt(text, c.index), found: c[0] });
        }
        return out.sort((a, b) => a.line - b.line);
    },
    fix: 'flag',
};
