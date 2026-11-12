// A `@model` declaration's trailing options, `{ form }`, `{ form: () => expr }`, `{ missing: () => expr }`
// and `{ attribute: … }` (#135, #751, #1039, #753), and how its attribute is read.
//
// The options are the declaration's last top-level `{ … }`, its entries split at top-level commas.
// Braces, brackets, parentheses and string literals inside them are skipped whole, so a `form`
// expression may hold a block or a call with several arguments. A last group whose entries are not
// all options is not an options block: an object type or an object default stays what it was.

import { skipNonCode } from './tokenizer';

/** How a model's attribute may be read: the descriptor's `type` for each. */
export const ATTRIBUTE_READINGS: Readonly<Record<string, string>> = {
    string: 'String', number: 'Number', boolean: 'Boolean', json: 'Object',
};

/** What a `@model`'s options block says. */
export interface ModelOptions {
    /** `form` was written: core's form wiring. */
    form: boolean;
    /** `form: expr`: what the form submits instead of the model. */
    formExpr?: string;
    /** `missing: expr`: when the value counts as missing for `required` (#1039); a form model's only. */
    missingExpr?: string;
    /** `attribute: x`, as written: one of ATTRIBUTE_READINGS's keys, or a word that is not. */
    attribute?: string;
}

/**
 * `text` without its trailing whitespace, one `;` and the whitespace before it. Written out, not as
 * `/\s*;?\s*$/`, whose backtracking is polynomial on a long run of whitespace (CodeQL
 * js/polynomial-redos): a declaration is the author's text.
 */
export function withoutStatementEnd(text: string): string {
    let end = text.trimEnd();
    if (end.endsWith(';')) end = end.slice(0, -1).trimEnd();
    return end;
}

/** The options block at the end of `declaration`, and the index it starts at; null when there is none. */
export function readModelOptions(declaration: string): { options: ModelOptions; start: number } | null {
    const text = withoutStatementEnd(declaration);
    if (!text.endsWith('}')) return null;
    // Forward scan, so that strings and nested groups are skipped the way the tokenizer reads them.
    let depth = 0;
    let lastOpen = -1;
    for (let i = 0; i < text.length; i++) {
        const skip = skipNonCode(text, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = text[i];
        if (ch === '{' || ch === '(' || ch === '[') {
            if (depth === 0 && ch === '{') lastOpen = i;
            depth++;
        } else if (ch === '}' || ch === ')' || ch === ']') {
            depth--;
        }
    }
    if (depth !== 0 || lastOpen <= 0) return null;
    const options: ModelOptions = { form: false };
    for (const entry of splitTopLevel(text.slice(lastOpen + 1, -1))) {
        // Match: `form`, `form: <expression>`, `missing: <expression>` or `attribute: <word>`.
        // Groups: [1]=name [2]=its value
        const m = /^(form|missing|attribute)\s*(?::\s*([\s\S]+))?$/.exec(entry);
        if (!m) return null;
        if (m[1] === 'form') {
            options.form = true;
            if (m[2]) options.formExpr = m[2];
        } else if (m[1] === 'missing') {
            if (!m[2]) return null;
            options.missingExpr = m[2];
        } else {
            if (!m[2] || !/^\w+$/.test(m[2])) return null;
            options.attribute = m[2];
        }
    }
    return { options, start: lastOpen };
}

/** `body` split at its top-level commas, each entry trimmed, empty ones dropped. */
function splitTopLevel(body: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < body.length; i++) {
        const skip = skipNonCode(body, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = body[i];
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) { out.push(body.slice(from, i)); from = i + 1; }
    }
    out.push(body.slice(from));
    return out.map(s => s.trim()).filter(Boolean);
}

/** How the attribute of a value of this member type is read: String, Number, Boolean, Array, or null for another. */
export function readingOf(member: string): string | null {
    const m = member.trim();
    if (m === 'string' || /^(['"`]).*\1$/.test(m)) return 'String';
    if (m === 'number' || /^-?\d+(\.\d+)?$/.test(m)) return 'Number';
    if (m === 'boolean' || m === 'true' || m === 'false') return 'Boolean';
    // Match: `T[]` or `Array<T>` of a primitive. Groups: [1]=T [2]=T
    const array = /^(?:(\w+|\([^)]*\))\[\]|Array<\s*(\w+)\s*>)$/.exec(m);
    if (array) return readingOf((array[1] ?? array[2]).replace(/^\(|\)$/g, '')) ? 'Array' : null;
    return null;
}

/**
 * Whether the type unites values whose attributes are read differently — two or more of a string, a
 * number, a boolean and an array of them, `null` and `undefined` aside — so that the type alone cannot
 * say how the attribute is read: `PDX_MODEL_ATTRIBUTE_AMBIGUOUS`. A literal union of one kind is not.
 */
export function attributeReadingIsAmbiguous(tsType: string): boolean {
    const members = splitUnion(tsType).filter(m => m !== 'null' && m !== 'undefined');
    if (members.length < 2) return false;
    const readings = members.map(readingOf);
    if (readings.some(r => r === null)) return false;
    return new Set(readings).size > 1;
}

/** `tsType` split at its top-level `|`. */
export function splitUnion(tsType: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < tsType.length; i++) {
        const skip = skipNonCode(tsType, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = tsType[i];
        if ('<([{'.includes(ch)) depth++;
        else if (ch === '>' && tsType[i - 1] === '=') continue; // the arrow of a function type
        else if ('>)]}'.includes(ch)) depth--;
        else if (ch === '|' && depth === 0) { out.push(tsType.slice(from, i)); from = i + 1; }
    }
    out.push(tsType.slice(from));
    return out.map(s => s.trim()).filter(Boolean);
}
