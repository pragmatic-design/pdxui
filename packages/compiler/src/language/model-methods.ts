// `getValue()` and `setValue()` duplicated a picker's model, and are removed (#287): the model is the
// way, `el.value`, which `::value` binds and `value-change` announces.
//
// `getValue` and `setValue` are common names, so a call is tied to a picker by the text: the name a
// `:ref` binds on one of `MODEL_METHOD_TAGS` in the same file, called in its template or its script.
//
//   ref.getValue()  → ref.value      mechanical: an expression for an expression
//   ref.setValue(v) → flagged        a call where `ref.value = v` is a statement; and on pdx-cascader it
//                                    turned anything but an array into `[]`, which `ref.value = v` does not
//   a lookup of the tag (`querySelector('pdx-cascader').getValue()`) → flagged
//
// Each picker that drops the pair adds its tag in the pull request that brings it over.

import type { LanguageChange, LanguageChangeFinding } from './changes';
import { escapeForRegExp } from '../compiler/regexp-escape';

/** The pickers whose `getValue()`/`setValue()` are removed in favour of the model. */
export const MODEL_METHOD_TAGS: ReadonlySet<string> = new Set(['pdx-cascader', 'pdx-tree-select']);

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The names a `:ref` binds on one of `MODEL_METHOD_TAGS` in `text`. */
function pickerRefs(text: string): string[] {
    const tags = [...MODEL_METHOD_TAGS].map(escapeForRegExp).join('|');
    // Match: a `:ref` on one of the tags' opening tag, quoted values read whole. Groups: [1]=the bound name
    const ref = new RegExp(`<(?:${tags})\\b(?:[^>"']|"[^"]*"|'[^']*')*?\\s:ref\\s*=\\s*["']\\s*([A-Za-z_$][\\w$]*)\\s*["']`, 'gi');
    return [...new Set([...text.matchAll(ref)].map((m) => m[1]))];
}

/** Every `name.<method>(` / `name?.<method>(` of a ref'd picker. Groups: [1]=the name [2]=the access */
function refCalls(text: string, method: 'getValue' | 'setValue'): RegExpMatchArray[] {
    const names = pickerRefs(text);
    if (names.length === 0) return [];
    // `getValue()` takes nothing; `setValue(` is matched to its opening parenthesis, for the finding.
    const tail = method === 'getValue' ? 'getValue\\s*\\(\\s*\\)' : 'setValue\\s*\\(';
    // Match: the name standing alone, its member access and the call. Groups: [1]=the name [2]=`.` or `?.`
    const call = new RegExp(`(?<![\\w$.])(${names.map(escapeForRegExp).join('|')})\\s*(\\??\\.)\\s*${tail}`, 'g');
    return [...text.matchAll(call)];
}

export const modelGetValue: LanguageChange = {
    id: 'model-get-value',
    kind: 'removed',
    scope: 'pdx',
    issue: 287,
    message: '`getValue()` is removed: the picker\'s model is `value`.',
    marker: 'getValue',
    detect: (text): LanguageChangeFinding[] => refCalls(text, 'getValue').map((m) => ({
        line: lineAt(text, m.index!), found: m[0], note: `Here, write \`${m[1]}${m[2]}value\`.`,
    })),
    fix: (text) => {
        let out = text;
        for (const m of refCalls(text, 'getValue').reverse()) {
            out = out.slice(0, m.index!) + `${m[1]}${m[2]}value` + out.slice(m.index! + m[0].length);
        }
        return out;
    },
};

export const modelSetValue: LanguageChange = {
    id: 'model-set-value',
    kind: 'removed',
    scope: 'pdx',
    issue: 287,
    message: '`setValue(v)` is removed: set the picker\'s model, `value`, which dispatches `value-change`.',
    marker: 'setValue',
    detect: (text): LanguageChangeFinding[] => refCalls(text, 'setValue').map((m) => ({
        line: lineAt(text, m.index!), found: m[0],
        note: `Not rewritten: write \`${m[1]}.value = …\` as a statement; on pdx-cascader setValue turned anything but an array into \`[]\`.`,
    })),
    fix: 'flag',
};

// Match: `getValue(` or `setValue(` on a lookup of one of the tags, with an optional `!` or index.
// Groups: none. Built from MODEL_METHOD_TAGS.
const lookupCall = (): RegExp => new RegExp(
    `querySelector(?:All)?\\s*\\(\\s*(['"\`])[^'"\`]*(?:${[...MODEL_METHOD_TAGS].map(escapeForRegExp).join('|')})[^'"\`]*\\1\\s*\\)\\s*(?:\\[\\s*\\d+\\s*\\])?\\s*!?\\s*\\??\\.\\s*(?:getValue|setValue)\\s*\\(`, 'g');

export const modelMethodsUnbound: LanguageChange = {
    id: 'model-methods-unbound',
    kind: 'removed',
    scope: 'script',
    issue: 287,
    message: '`getValue()` and `setValue()` are removed from the pickers: their model is `value`.',
    marker: /[gs]etValue\s*\(/,
    detect: (text): LanguageChangeFinding[] => [...text.matchAll(lookupCall())].map((m) => ({
        line: lineAt(text, m.index!), found: m[0],
        note: 'Not rewritten: the call is on a lookup, not a `:ref` of this file; read or set `.value` if it is the picker.',
    })),
    fix: 'flag',
};
