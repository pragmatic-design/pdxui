// The alpha's scoped slots and template props, rewritten to typed snippets (#492, part 4 of #131).
//
//   - parent: `<slot name="row" let:item>…</slot>` and `@slot(row, { item }) { … }`, inside a
//     component's tag, are `@snippet row(item) { … }`. A `let:` names a key of the slot's scope and a
//     snippet takes positional parameters, so the rewrite reads the child's signature (the context's
//     `snippetParamsOf`): the parameters are the signature's, in its order, up to the last one used.
//   - child: `<slot name="row" :item="it">` is `@slot row?: (…)` + `@render row?.(it)` (./scoped-slot-outlet).
//   - a script `@snippet` body is a template: `${arg}` is `{{ arg }}`.
//   - a template prop (`:item-template="fn"`) on a library component is flagged: its markup is code.
//
// They are `changed` entries while the repository still uses the alpha forms, so the compiler says
// nothing and `pdx migrate` rewrites them; #492's last part makes them `removed`.

import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';
import { applyEdits, braced, enclosingTag, lineAt, slotClose, tagEnd, selfClosing, attributeOf, type TextEdit } from './slot-markup';

export { signatureParamNames } from './slot-markup';
export { scopedSlotOutlet } from './scoped-slot-outlet';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** One parent-side slot: where it is, and either its rewrite or why there is none. */
interface ParentSlot { finding: LanguageChangeFinding; edits?: TextEdit[] }

/**
 * The snippet parameters for the scope keys `vars`, by the child's parameter names `params`: the
 * signature's names up to the last key used, an unused one prefixed with `_` so it shadows nothing;
 * or the keys the signature lacks.
 */
function snippetParams(params: readonly string[], vars: readonly string[]): { list: string } | { missing: string[] } {
    const used = vars.filter((v) => v !== '_');
    const missing = used.filter((v) => !params.includes(v));
    if (missing.length) return { missing };
    const last = Math.max(-1, ...used.map((v) => params.indexOf(v)));
    return { list: params.slice(0, last + 1).map((p) => (used.includes(p) ? p : `_${p}`)).join(', ') };
}

/**
 * Why a slot of `name` with the keys `vars`, directly inside `owner`, cannot be rewritten, or the
 * parameter list of its snippet.
 */
function resolveParams(owner: string | null, name: string, vars: readonly string[], context?: LanguageChangeContext): { list: string } | { note: string } {
    if (!owner || !owner.includes('-')) return { note: 'The slot is not directly inside a component: move it into the component\'s tag, or rewrite it by hand.' };
    if (!IDENTIFIER.test(name)) return { note: `\`${name}\` is not a snippet name: write the component's snippet for it — \`@snippet\` takes an identifier.` };
    const signatures = context?.snippetParamsOf?.(owner);
    if (!signatures) return { note: `The snippets of \`${owner}\` are not known here: rewrite it by the component's \`@slot\` signature.` };
    const params = signatures.get(name);
    if (!params) return { note: `\`${name}\` is not a snippet of \`${owner}\` (it has ${[...signatures.keys()].map((k) => `\`${k}\``).join(', ') || 'none'}): rewrite it by hand.` };
    const r = snippetParams(params, vars);
    if ('missing' in r) return { note: `\`${owner}\`'s \`${name}\` snippet takes (${params.join(', ')}), not ${r.missing.map((m) => `\`${m}\``).join(', ')}: rewrite it by hand.` };
    return r;
}

/** Every parent-side scoped slot in `text`: `<slot … let:…>` and `@slot(name, { … }) {`. */
function parentSlots(text: string, context?: LanguageChangeContext): ParentSlot[] {
    const out: ParentSlot[] = [];
    // Match: the start of a `<slot` tag.
    for (const m of text.matchAll(/<slot(?=[\s/>])/g)) {
        const end = tagEnd(text, m.index);
        if (end === -1) continue;
        const tag = text.slice(m.index, end + 1);
        // Match: a `let:name` attribute, with `=` when it renames. Groups: [1]=the name [2]=`=`
        const lets = [...tag.matchAll(/(?<=\s)let:([\w$]+)(\s*=)?/g)];
        if (lets.length === 0) continue;
        const finding: LanguageChangeFinding = { line: lineAt(text, m.index), found: tag };
        if (lets.some((l) => l[2])) { out.push({ finding: { ...finding, note: 'A renamed `let:x="y"` has no mechanical form: rewrite it by hand.' } }); continue; }
        const name = attributeOf(tag, 'name') ?? 'default';
        const r = resolveParams(enclosingTag(text, m.index), name, lets.map((l) => l[1]), context);
        if ('note' in r) { out.push({ finding: { ...finding, note: r.note } }); continue; }
        const head = `@snippet ${name}(${r.list}) `;
        if (selfClosing(text, end)) { out.push({ finding, edits: [{ start: m.index, end: end + 1, text: `${head}{}` }] }); continue; }
        const close = slotClose(text, end + 1);
        if (close === -1) { out.push({ finding: { ...finding, note: 'The slot has no `</slot>`.' } }); continue; }
        out.push({ finding, edits: [{ start: m.index, end: close + '</slot>'.length, text: head + braced(text.slice(end + 1, close)) }] });
    }
    // Match: `@slot(name, { a, b }) {` — the alpha parent block. Groups: [1]=the name [2]=the keys
    for (const m of text.matchAll(/@slot\s*\(\s*([^,\s)]+)\s*(?:,\s*\{([^}]*)\})?\s*\)\s*\{/g)) {
        const finding: LanguageChangeFinding = { line: lineAt(text, m.index), found: m[0] };
        const keys = (m[2] ?? '').split(',').map((k) => k.trim()).filter(Boolean);
        if (keys.some((k) => !IDENTIFIER.test(k))) { out.push({ finding: { ...finding, note: 'A renamed key has no mechanical form: rewrite it by hand.' } }); continue; }
        const r = resolveParams(enclosingTag(text, m.index), m[1], keys, context);
        if ('note' in r) { out.push({ finding: { ...finding, note: r.note } }); continue; }
        out.push({ finding, edits: [{ start: m.index, end: m.index + m[0].length, text: `@snippet ${m[1]}(${r.list}) {` }] });
    }
    return out.sort((a, b) => a.finding.line - b.finding.line);
}

export const scopedSlotParent: LanguageChange = {
    id: 'scoped-slot-parent',
    kind: 'changed',
    scope: 'pdx',
    issue: 492,
    message: 'A scoped slot is a typed snippet: `<slot name="row" let:item>…</slot>` and `@slot(row, { item }) { … }` are `@snippet row(item) { … }` inside the component\'s tag, with the parameters of the component\'s signature, in its order.',
    marker: /let:|@slot\s*\(/,
    detect: (text, context) => parentSlots(text, context).map((s) => s.finding),
    fix: (text, context) => applyEdits(text, parentSlots(text, context).flatMap((s) => s.edits ?? [])),
};

// ─── a script @snippet's ${arg} ──────────────────────────────────────────────────────────────

/** The index of the brace that closes the one at `open`, strings in expressions read whole; -1 when none. */
function closingBrace(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return i;
    }
    return -1;
}

/** Every `${…}` inside a script `@snippet`'s body: where it starts, and where its `}` is. */
function snippetInterpolations(text: string): { start: number; close: number }[] {
    const out: { start: number; close: number }[] = [];
    // Match: `@snippet name(params) {` — a snippet declared in the script.
    for (const m of text.matchAll(/@snippet\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/g)) {
        const open = m.index + m[0].length - 1;
        const close = closingBrace(text, open);
        if (close === -1) continue;
        for (let i = text.indexOf('${', open); i !== -1 && i < close; i = text.indexOf('${', i + 2)) {
            const end = closingBrace(text, i + 1);
            if (end !== -1 && end < close) out.push({ start: i, close: end });
        }
    }
    return out;
}

export const scriptSnippetInterpolation: LanguageChange = {
    id: 'script-snippet-interpolation',
    kind: 'changed',
    scope: 'script',
    issue: 492,
    message: 'A script `@snippet` body is a template, like any other: write `{{ arg }}`, not `${arg}`.',
    marker: '@snippet',
    detect: (text) => snippetInterpolations(text).map((s) => ({ line: lineAt(text, s.start), found: text.slice(s.start, s.close + 1) })),
    fix: (text) => applyEdits(text, snippetInterpolations(text).map((s) => ({ start: s.start, end: s.close + 1, text: `{{ ${text.slice(s.start + 2, s.close).trim()} }}` }))),
};

// ─── template props ──────────────────────────────────────────────────────────────────────────

// Match: the opening tag of a library component, quoted values read whole. Groups: [1]=its attributes
const LIBRARY_TAG = /<pdx-[\w-]+(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Match: a bound template prop, kebab or camel case, with its value.
const TEMPLATE_PROP = /(?<=\s):{1,2}(?:[\w-]+-template|[a-z][\w]*Template)\s*=\s*(?:"[^"]*"|'[^']*')/g;

export const templatePropFlag: LanguageChange = {
    id: 'template-prop',
    kind: 'changed',
    scope: 'pdx',
    issue: 492,
    message: 'A template prop is a typed snippet: pass `@snippet item(o) { … }` inside the tag, by the component\'s signature, and move the function\'s markup into it.',
    marker: /Template|-template/,
    detect(text) {
        const out: LanguageChangeFinding[] = [];
        for (const m of text.matchAll(LIBRARY_TAG)) {
            const attrsAt = m.index + m[0].length - m[1].length - 1;
            for (const a of m[1].matchAll(TEMPLATE_PROP)) out.push({ line: lineAt(text, attrsAt + a.index), found: a[0] });
        }
        return out;
    },
    fix: 'flag',
};
