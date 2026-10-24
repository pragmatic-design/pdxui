// The template forms #129 removes, one spelling kept for each: `ref=` → `:ref`, the `:show`
// attribute → `@show (c) { … }`, `:class.x` → the `:class` object, `:style.x` → the `:style` object.
// Each is a registry entry (./changes) with a mechanical rewrite. They are looked for in the
// `<template>` block only, in the opening tags of its elements: a string in the script that holds
// the same text is not a form.

import { parseSFC } from '../parser/sfc';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** An element tag of the template: where it is and what it says. */
interface Tag {
    /** Offset of `<` (or `</`). */
    start: number;
    /** Offset just past `>`. */
    end: number;
    name: string;
    closing: boolean;
    selfClosing: boolean;
    text: string;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The template block's content range in `text`, or null when there is none. */
function templateRange(text: string): [number, number] | null {
    const t = parseSFC(text).template;
    return t && !('src' in t && t.src) ? [t.start, t.start + t.content.length] : null;
}

/** Every element tag between `from` and `to`, opening and closing, in order; comments skipped. */
function tagsIn(text: string, from: number, to: number): Tag[] {
    const tags: Tag[] = [];
    let i = from;
    while (i < to) {
        const lt = text.indexOf('<', i);
        if (lt === -1 || lt >= to) break;
        if (text.startsWith('<!--', lt)) {
            const close = text.indexOf('-->', lt + 4);
            i = close === -1 ? to : close + 3;
            continue;
        }
        // Match: `<name` or `</name`. Groups: [1]=`/` for a closing tag [2]=name
        const head = /^<(\/?)([A-Za-z][\w-]*)/.exec(text.slice(lt, lt + 64));
        if (!head) { i = lt + 1; continue; }
        let quote = '';
        let j = lt + head[0].length;
        for (; j < to; j++) {
            const c = text[j];
            if (quote) { if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
        }
        const end = Math.min(j + 1, to);
        const tagText = text.slice(lt, end);
        tags.push({ start: lt, end, name: head[2].toLowerCase(), closing: head[1] === '/', selfClosing: /\/\s*>$/.test(tagText), text: tagText });
        i = end;
    }
    return tags;
}

/**
 * The last text read and its opening tags (#646): the four checks below read the same template on
 * every compile. Callers read the tags and never change them.
 */
let lastTags: { text: string; tags: readonly Tag[] } | null = null;

/** The opening tags of the template's elements. */
function openingTags(text: string): readonly Tag[] {
    if (lastTags?.text !== text) {
        const range = templateRange(text);
        lastTags = { text, tags: range ? tagsIn(text, range[0], range[1]).filter(t => !t.closing) : [] };
    }
    return lastTags.tags;
}

/** An attribute in an opening tag: its name, its value, and where it is in the tag's text. */
interface Attr { name: string; value: string; quote: string; start: number; end: number }

/** The attributes of an opening tag's text whose name matches `name`. */
function attrsOf(tagText: string, name: RegExp): Attr[] {
    const out: Attr[] = [];
    // Match: an attribute with a quoted value. Groups: [1]=name [2]=quote [3]=value
    for (const m of tagText.matchAll(/(?<=\s)([:@]{0,2}[\w.:-]+(?:\(\d+\))?)=(["'])([\s\S]*?)\2/g)) {
        if (name.test(m[1])) out.push({ name: m[1], value: m[3], quote: m[2], start: m.index, end: m.index + m[0].length });
    }
    return out;
}

/**
 * Where removing an attribute from its tag's text starts: at the newline before it when it stands
 * alone at the start of its line, so no blank line is left behind; otherwise at the space before it.
 */
function removalStart(tagText: string, a: Attr): number {
    const lineStart = tagText.lastIndexOf('\n', a.start - 1);
    return lineStart !== -1 && /^[ \t]*$/.test(tagText.slice(lineStart + 1, a.start)) ? lineStart : a.start - 1;
}

/** The indentation of the line `index` is on, when only spaces precede it there; otherwise ''. */
function indentAt(text: string, index: number): string {
    const lead = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
    return /^[ \t]*$/.test(lead) ? lead : '';
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
}

/** Every attribute matching `name` in the template's opening tags, as findings. */
function findAttrs(text: string, name: RegExp): LanguageChangeFinding[] {
    return openingTags(text).flatMap(tag => attrsOf(tag.text, name).map(a => ({
        line: lineAt(text, tag.start + a.start),
        found: `${a.name}=${a.quote}${a.value}${a.quote}`,
    })));
}

/**
 * Rewrite the first tag `rewrite` changes, again and again until none: each rewrite moves the
 * offsets after it, so the tags are read anew each time. Bounded by the number of tags.
 */
function rewriteTags(text: string, rewrite: (text: string, tag: Tag) => string | null): string {
    for (let guard = 0; guard < 10_000; guard++) {
        let changed = false;
        for (const tag of openingTags(text)) {
            const next = rewrite(text, tag);
            if (next !== null) { text = next; changed = true; break; }
        }
        if (!changed) return text;
    }
    return text;
}

/** `text` as a single-quoted JavaScript string: its backslashes and quotes escaped. */
function singleQuoted(text: string): string {
    return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** An object key as written in a template expression: an identifier bare, anything else quoted. */
function key(name: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(name) ? name : singleQuoted(name);
}

/**
 * Merge every `:<base>.x="c"` of an opening tag into one `:<base>="{ x: c, … }"`, after the entries
 * of an existing `:<base>="{ … }"` object. A `:class` that is a string expression keeps the string
 * form, the toggles joined to it: `[tone, picked && 'selected'].filter(Boolean).join(' ')`. A
 * `:style` string (cssText) cannot take properties beside it, and is left as it is.
 */
function mergeDotted(base: 'class' | 'style') {
    const dotted = new RegExp(`^:${base}\\.`);
    return (text: string, tag: Tag): string | null => {
        const parts = attrsOf(tag.text, dotted);
        if (parts.length === 0) return null;
        const existing = attrsOf(tag.text, new RegExp(`^:${base}$`))[0];
        const inner = existing?.value.trim();
        const isObject = !!inner && inner.startsWith('{') && inner.endsWith('}');
        let value: string;
        if (existing && !isObject) {
            if (base === 'style') return null;
            value = `[${[inner, ...parts.map(p => `${p.value} && ${singleQuoted(p.name.slice(base.length + 2))}`)].join(', ')}].filter(Boolean).join(' ')`;
        } else {
            const entries = [
                ...(inner ? [inner.slice(1, -1).trim()].filter(Boolean) : []),
                ...parts.map(p => `${key(p.name.slice(base.length + 2))}: ${p.value}`),
            ];
            value = `{ ${entries.join(', ')} }`;
        }
        const quote = value.includes('"') ? "'" : '"';
        const merged = `:${base}=${quote}${value}${quote}`;
        // The merged attribute takes the place of the first one it replaces; the others go, each with
        // the space before it, or with its line when it has one to itself.
        const removals = [...(existing ? [existing] : []), ...parts].sort((a, b) => a.start - b.start);
        let out = tag.text;
        for (const r of [...removals].reverse()) {
            const at = r === removals[0] ? r.start : removalStart(tag.text, r);
            out = out.slice(0, at) + (r === removals[0] ? merged : '') + out.slice(r.end);
        }
        return text.slice(0, tag.start) + out + text.slice(tag.end);
    };
}

/** Where the element an opening tag starts ends: past its matching closing tag, or the tag itself. */
function elementEnd(text: string, tag: Tag): number {
    if (tag.selfClosing || VOID.has(tag.name)) return tag.end;
    const range = templateRange(text);
    if (!range) return tag.end;
    let depth = 1;
    for (const t of tagsIn(text, tag.end, range[1])) {
        if (t.name !== tag.name) continue;
        if (t.closing) { depth--; if (depth === 0) return t.end; }
        else if (!t.selfClosing) depth++;
    }
    return tag.end;
}

export const refAttribute: LanguageChange = {
    id: 'ref-attribute',
    kind: 'removed',
    scope: 'pdx',
    issue: 129,
    message: '`ref="x"` is removed: write `:ref="x"`.',
    marker: 'ref=',
    detect: (text) => findAttrs(text, /^ref$/),
    fix: (text) => rewriteTags(text, (t, tag) => {
        const [a] = attrsOf(tag.text, /^ref$/);
        if (!a) return null;
        return t.slice(0, tag.start + a.start) + ':' + t.slice(tag.start + a.start);
    }),
};

export const showAttribute: LanguageChange = {
    id: 'show-attribute',
    kind: 'removed',
    scope: 'pdx',
    issue: 129,
    message: 'The `:show` attribute is removed: wrap the element in `@show (condition) { … }`.',
    marker: ':show=',
    detect: (text) => findAttrs(text, /^:show$/),
    fix: (text) => rewriteTags(text, (t, tag) => {
        const [a] = attrsOf(tag.text, /^:show$/);
        if (!a) return null;
        const end = elementEnd(t, tag);
        const opening = tag.text.slice(0, removalStart(tag.text, a)) + tag.text.slice(a.end);
        const element = opening + t.slice(tag.end, end);
        if (!element.includes('\n')) return `${t.slice(0, tag.start)}@show (${a.value}) { ${element} }${t.slice(end)}`;
        // A multi-line element becomes the block's body, one level in — unless it holds text whose
        // whitespace is content (`<pre>`, `<textarea>`), which is moved as it is.
        const indent = indentAt(t, tag.start);
        const body = /<(pre|textarea)\b/i.test(element)
            ? `${indent}${element}`
            : `${indent}  ${element.replace(/\n(?!\n|$)/g, '\n  ')}`;
        return `${t.slice(0, tag.start)}@show (${a.value}) {\n${body}\n${indent}}${t.slice(end)}`;
    }),
};

export const classDot: LanguageChange = {
    id: 'class-dot',
    kind: 'removed',
    scope: 'pdx',
    issue: 129,
    message: '`:class.x` is removed: write the object form, `:class="{ x: condition }"` (merged with an existing one).',
    marker: ':class.',
    detect: (text) => findAttrs(text, /^:class\./),
    fix: (text) => rewriteTags(text, mergeDotted('class')),
};

export const styleDot: LanguageChange = {
    id: 'style-dot',
    kind: 'removed',
    scope: 'pdx',
    issue: 129,
    message: '`:style.x` is removed: write the object form, `:style="{ color: c, \'--accent\': a }"` (custom properties quoted).',
    marker: ':style.',
    detect: (text) => findAttrs(text, /^:style\./),
    fix: (text) => rewriteTags(text, mergeDotted('style')),
};
