// `@prop name: T;` changes meaning (#130): with no default it was optional and `undefined` when
// absent, and now it is required, TypeScript's rule. The old spelling stays valid beta, so the
// compiler says nothing about it; `pdx migrate` adds the `?` that keeps what the code meant.
// Looked for in the `<script>` of a `.pdx`, one declaration per line, as the script analyser reads them.

import { parseSFC } from '../parser/sfc';
import { extractTypeAnnotation } from '../compiler/script-analyzer-helpers';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** A `@prop` with no default and no `?`: where its name ends in `text`, and the declaration. */
interface Bare { nameEnd: number; line: number; found: string }

/** Every `@prop name: T;` in the script of `text` that has no default and no `?`. */
function bareProps(text: string): Bare[] {
    const script = parseSFC(text).script;
    if (!script || script.src) return [];
    const out: Bare[] = [];
    let offset = script.start;
    let line = text.slice(0, script.start).split('\n').length;
    for (const raw of script.content.split('\n')) {
        const lead = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();
        // Match: `@prop name:` with no `?`. Groups: [1]=the name
        const m = /^@prop\s+([A-Za-z_$][\w$]*)\s*:/.exec(trimmed);
        if (m && !extractTypeAnnotation(trimmed, m[0].length - 1).rest.startsWith('=')) {
            out.push({ nameEnd: offset + lead + m[0].indexOf(m[1]) + m[1].length, line, found: trimmed });
        }
        offset += raw.length + 1;
        line++;
    }
    return out;
}

export const propRequired: LanguageChange = {
    id: 'prop-required',
    kind: 'changed',
    scope: 'pdx',
    issue: 130,
    message: '`@prop name: T;` with no default is now required: `?` keeps it optional, `@prop name?: T;`.',
    detect: (text): LanguageChangeFinding[] => bareProps(text).map(({ line, found }) => ({ line, found })),
    fix: (text) => {
        let out = text;
        for (const { nameEnd } of bareProps(text).reverse()) out = `${out.slice(0, nameEnd)}?${out.slice(nameEnd)}`;
        return out;
    },
};
