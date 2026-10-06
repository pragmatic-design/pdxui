// Occurrence finding — locates all uses of a symbol (local identifier) or a
// component tag, with offset-stable ranges. Powers find-references and rename.
//
// Local identifiers are matched in two zones, never in raw text or comments:
//   - the <script> block, with strings/comments masked out (offsets preserved)
//   - <template> reactive zones: ${...} interpolations and binding attribute
//     values (:attr / ::attr / @event), NOT plain text or static attributes
// Component tags (<pdx-foo>) are matched on their name span in raw file content.

import { Position, Range } from 'vscode-languageserver';
import { maskNonCode } from '@pdxui/compiler';
import type { SFCDescriptor } from '@pdxui/compiler';
import { offsetToPosition } from './positions';

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Range covering `len` units starting at `absOffset` in the full source (single line). */
function rangeAt(source: string, absOffset: number, len: number): Range {
    const start = offsetToPosition(source, absOffset);
    return Range.create(start, Position.create(start.line, start.character + len));
}

/** Word-boundary identifier regex: excludes property access (`.name`) and partial ids (`nameX`, `xname`). */
function identRegex(name: string): RegExp {
    return new RegExp(`(?<![\\w$.])${escapeRegex(name)}(?![\\w$])`, 'g');
}

/** Push every identifier match inside `region` (relative to `base` in source) into `out`. */
function matchRegion(source: string, base: number, region: string, name: string, out: Range[]): void {
    const re = identRegex(name);
    let m: RegExpExecArray | null;
    while ((m = re.exec(region)) !== null) {
        out.push(rangeAt(source, base + m.index, name.length));
    }
}

/** Occurrences of a local identifier inside the <script> block (strings/comments masked). */
export function findScriptOccurrences(source: string, script: { content: string; start: number }, name: string): Range[] {
    const out: Range[] = [];
    matchRegion(source, script.start, maskNonCode(script.content), name, out);
    return out;
}

/** Occurrences of a local identifier inside template reactive zones (${...} + binding values). */
export function findTemplateOccurrences(source: string, template: { content: string; start: number }, name: string): Range[] {
    const out: Range[] = [];
    const content = template.content;
    let m: RegExpExecArray | null;

    // {{ ... }} mustache interpolations (canonical text binding). Group 1 = body, after '{{'.
    const mustache = /\{\{([^}]*)\}\}/g;
    while ((m = mustache.exec(content)) !== null) {
        matchRegion(source, template.start + m.index + 2, m[1], name, out);
    }

    // ${ ... } raw interpolations (discouraged but compiled). Group 1 = body, after '${'.
    const raw = /\$\{([^}]*)\}/g;
    while ((m = raw.exec(content)) !== null) {
        matchRegion(source, template.start + m.index + 2, m[1], name, out);
    }

    // Binding attribute values: :attr="expr" / ::attr="expr" / @event="expr" (single or double quotes).
    // Group 2 = quote char, group 3 = value body.
    const bind = /(?:::?|@)[\w.-]+\s*=\s*(("|')([^"']*)\2)/g;
    while ((m = bind.exec(content)) !== null) {
        const valueBody = m[3];
        // base = position right after the opening quote
        const quoteIdx = m.index + m[0].length - m[1].length + 1;
        matchRegion(source, template.start + quoteIdx, valueBody, name, out);
    }

    return out;
}

/** All occurrences of a local identifier in the current document (script + template zones). */
export function findLocalOccurrences(source: string, descriptor: SFCDescriptor, name: string): Range[] {
    const out: Range[] = [];
    if (descriptor.script) out.push(...findScriptOccurrences(source, descriptor.script, name));
    if (descriptor.template) out.push(...findTemplateOccurrences(source, descriptor.template, name));
    return out;
}

/** Yield each `<tag ...>` opening: absolute offset where attributes start + the attribute text up to '>'. */
function* openingTags(content: string, tag: string): Generator<{ attrsStart: number; attrsText: string }> {
    const re = new RegExp(`<${escapeRegex(tag)}(?![\\w-])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const attrsStart = m.index + m[0].length;
        // Scan to the top-level '>', skipping quoted attribute values (which may contain '>').
        let i = attrsStart;
        let quote = '';
        while (i < content.length) {
            const c = content[i];
            if (quote) { if (c === quote) quote = ''; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
            i++;
        }
        yield { attrsStart, attrsText: content.slice(attrsStart, i) };
    }
}

/**
 * Occurrences of an attribute `name` on `<tag ...>` openings in raw content — the
 * consumer-side uses of a component's prop or event. Range covers just the NAME
 * (the `:`/`::`/`@` sigil is preserved on rename).
 *   - kind 'prop'  matches `name` / `:name` / `::name`
 *   - kind 'event' matches `@name`
 */
export function findAttributeOccurrences(content: string, tag: string, name: string, kind: 'prop' | 'event'): Range[] {
    const out: Range[] = [];
    const sigil = kind === 'event' ? '(@)' : '(:?:?)';
    // Groups: [1]=leading space [2]=sigil [3]=name. Lookahead = attribute boundary.
    const re = new RegExp(`(\\s)${sigil}(${escapeRegex(name)})(?=[\\s=/>])`, 'g');
    for (const { attrsStart, attrsText } of openingTags(content, tag)) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(attrsText)) !== null) {
            const nameStart = attrsStart + m.index + m[1].length + m[2].length;
            out.push(rangeAt(content, nameStart, name.length));
        }
    }
    return out;
}

/** Blank out <!-- HTML comments --> preserving length/newlines (offset-stable). */
function maskHtmlComments(content: string): string {
    return content.replace(/<!--[\s\S]*?-->/g, (block) =>
        block.replace(/[^\n]/g, ' '));
}

/**
 * Occurrences of a component tag in a script file (.ts, .js): the tag where code names it — a
 * string (`querySelector('pdx-x')`, `createElement("pdx-x")`, a selector `'pdx-x.open'`) or markup
 * in a template literal (`<pdx-x>`). Comments are masked.
 */
export function findTagOccurrencesInScript(content: string, tag: string): Range[] {
    const out: Range[] = [];
    const masked = maskComments(content);
    // Match: the tag right after a quote, a backtick, '<' or '</', and not followed by more of a name.
    const re = new RegExp(`(?<=['"\`]|</?)(${escapeRegex(tag)})(?![\\w-])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) out.push(rangeAt(content, m.index, tag.length));
    return out;
}

/** `//` and `/* *\/` comments blanked, offsets preserved — strings are kept: they are what is searched. */
function maskComments(content: string): string {
    let out = '';
    let i = 0;
    let quote = '';
    while (i < content.length) {
        const c = content[i];
        if (quote) {
            out += c;
            if (c === '\\') { out += content[i + 1] ?? ''; i += 2; continue; }
            if (c === quote) quote = '';
            i++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
        if (c === '/' && content[i + 1] === '/') {
            while (i < content.length && content[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '/' && content[i + 1] === '*') {
            const end = content.indexOf('*/', i + 2);
            const stop = end < 0 ? content.length : end + 2;
            for (; i < stop; i++) out += content[i] === '\n' ? '\n' : ' ';
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/** The tag's occurrences in a workspace file, read the way its kind is written: markup or script. */
export function findTagUses(uri: string, content: string, tag: string): Range[] {
    // .ts .js .mts .mjs .cjs (a .pdx.ts included) are code; .pdx and .html are markup.
    return /\.(?:m?[jt]s|cjs)$/i.test(uri)
        ? findTagOccurrencesInScript(content, tag)
        : findTagOccurrences(content, tag);
}

/** Occurrences of a component tag name in raw file content: matches <tag and </tag, range over the name.
 *  HTML comments are masked so commented-out markup is not reported. */
export function findTagOccurrences(content: string, tag: string): Range[] {
    const out: Range[] = [];
    const masked = maskHtmlComments(content);
    // Match: '<tag' or '</tag' followed by a non-identifier boundary.
    const re = new RegExp(`</?(${escapeRegex(tag)})(?![\\w-])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
        const nameStart = m.index + m[0].length - tag.length;
        out.push(rangeAt(content, nameStart, tag.length));
    }
    return out;
}
