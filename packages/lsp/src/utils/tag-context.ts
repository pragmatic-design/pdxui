// Tag Context — given a position in the source, works out whether the cursor is inside
// an open tag (<pdx-xxx …>), which tag that is, and whether it sits on an attribute's
// name or inside an attribute's value. Shared by completion/hover/definition.

import type { Position } from 'vscode-languageserver';

export interface TagContext {
    /** The tag's name, 'pdx-button' for one. */
    tag: string;
    /** The offset of the opening '<'. */
    tagStart: number;
    /** The cursor is on the tag's own name. */
    onTagName: boolean;
    /** When the cursor is inside an attribute's quoted value, that attribute's name. */
    inValue: string | null;
    /** The attribute/event token the cursor sits on ("name" position), or null. */
    attrToken: string | null;
    /** The attribute token's prefix before the cursor (to filter the completion). */
    namePrefix: string;
}

const ATTR_CHARS = /[:@\w-]/;

/** Converts an LSP Position into an absolute offset (UTF-16). */
export function positionToOffset(source: string, position: Position): number {
    let line = 0, i = 0;
    while (i < source.length && line < position.line) { if (source[i] === '\n') line++; i++; }
    return Math.min(i + position.character, source.length);
}

/** Extracts the token (of character class `cls`) that spans `offset`. */
function tokenAt(source: string, offset: number, cls: RegExp): string {
    let start = offset, end = offset;
    while (start > 0 && cls.test(source[start - 1])) start--;
    while (end < source.length && cls.test(source[end])) end++;
    return source.slice(start, end);
}

/** Works out the tag context at the given position, or null when it is not in an opening tag. */
export function getTagContext(source: string, position: Position): TagContext | null {
    const offset = positionToOffset(source, position);

    // Walk back to the nearest '<' without meeting a '>' first.
    let lt = -1;
    for (let i = offset - 1; i >= 0; i--) {
        const c = source[i];
        if (c === '>') return null;
        if (c === '<') { lt = i; break; }
    }
    if (lt < 0) return null;
    if (source[lt + 1] === '/' || source[lt + 1] === '!') return null; // a closing tag or a comment

    const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(source.slice(lt));
    if (!nameMatch) return null;
    const tag = nameMatch[1];
    const nameEnd = lt + 1 + tag.length;

    const onTagName = offset <= nameEnd;

    // Scan the attribute area from nameEnd to the cursor, to tell whether we are inside a value.
    let inQuote = false, quoteChar = '', lastName = '', inValue: string | null = null;
    let pendingEquals = false;
    for (let i = nameEnd; i < offset; i++) {
        const c = source[i];
        if (inQuote) {
            if (c === quoteChar) { inQuote = false; inValue = null; }
            continue;
        }
        if (c === '"' || c === "'") {
            inQuote = true; quoteChar = c; if (pendingEquals) { inValue = lastName; pendingEquals = false; }
            continue;
        }
        if (c === '=') { pendingEquals = true; continue; }
        if (ATTR_CHARS.test(c)) {
            // the start or the continuation of an attribute name
            if (pendingEquals) pendingEquals = false; // an unquoted value: ignore it
            // rebuild the current name
            let j = i; while (j < offset && ATTR_CHARS.test(source[j])) j++;
            lastName = source.slice(i, j);
            i = j - 1;
        }
    }

    const namePrefix = inValue ? '' : tokenAtBefore(source, offset, ATTR_CHARS);
    const attrToken = (!inValue && !onTagName) ? (tokenAt(source, offset, ATTR_CHARS) || null) : null;

    return { tag, tagStart: lt, onTagName, inValue, attrToken: attrToken || null, namePrefix };
}

/**
 * The custom element whose content `offset` sits in — the nearest custom-element tag opened before
 * it and not yet closed — or null. What a child's `slot="…"` names a slot of.
 */
export function enclosingCustomElement(source: string, offset: number): string | null {
    const open: string[] = [];
    // Match: an opening or closing tag.  Groups: [1]='/' when closing, [2]=the name, [3]='/' when self-closing
    const re = /<(\/?)([a-zA-Z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;
    for (const m of source.slice(0, offset).matchAll(re)) {
        const name = m[2].toLowerCase();
        if (!name.includes('-')) continue;
        if (m[1]) {
            const at = open.lastIndexOf(name);
            if (at >= 0) open.length = at;
        } else if (!m[3]) {
            open.push(name);
        }
    }
    return open.length ? open[open.length - 1] : null;
}

/** The token (of class `cls`) immediately before `offset` (its left part only). */
function tokenAtBefore(source: string, offset: number, cls: RegExp): string {
    let start = offset;
    while (start > 0 && cls.test(source[start - 1])) start--;
    return source.slice(start, offset);
}
