// Where a finding is in the file — the line and column `pdx check`, the editor and the dev console
// report.
//
// The script analyser and the declaration checks work on text the compiler has already cut up: the
// script without its directives, a declaration's own string, the assembled setup body. They know
// WHAT is wrong and not WHERE. Each finding names what it is about — a quoted declaration, a name,
// a tag — and this finds that text in the right block of the file. A finding that already carries a
// position keeps it; one whose text cannot be found keeps none, rather than a guess.

import ts from 'typescript';
import { parseSFC } from '../parser/sfc';
import { skipNonCode } from './tokenizer';
import { proposeFixes } from './fix-proposals';
import type { ValidationWarning } from './validate';

interface Region { from: number; to: number }

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first `'name'` a message quotes. */
const quotedName = (message: string): string | undefined => /'([\w$]+)'/.exec(message)?.[1];

/** The first `"text"` a message quotes: a declaration as written, or a name in it. */
const quotedText = (message: string): string | undefined => /"([^"\n]+)"/.exec(message)?.[1];

/** Where `re` matches inside `region`: the `nth` match (0-based), as a file offset. */
function find(source: string, region: Region | undefined, re: RegExp, nth = 0): number | undefined {
    if (!region) return undefined;
    const text = source.slice(region.from, region.to);
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    let seen = 0;
    while ((m = global.exec(text)) !== null) {
        if (seen++ === nth) return region.from + m.index;
        if (m[0] === '') global.lastIndex++;
    }
    return undefined;
}

/** The name in its declaration — `let`/`const`/`var` (a rune's too) or `function` — not the keyword. */
const declarationOf = (name: string): RegExp =>
    new RegExp(`(?<=\\b(?:let|const|var|function)\\s+)${escape(name)}\\b`);

/**
 * The declaration of `name` at the top of the script, where the component's own state lives; the
 * first one at any depth when there is none there. A `let count` inside a function is another
 * variable, and a fix written on it would change the wrong one.
 */
function findDeclaration(source: string, script: Region | undefined, name: string): number | undefined {
    if (!script) return undefined;
    const re = new RegExp(declarationOf(name).source, 'g');
    const text = source.slice(script.from, script.to);
    const found: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push(m.index);
    if (found.length === 0) return undefined;
    // Bracket depth at each match, outside strings and comments.
    let depth = 0;
    let next = 0;
    for (let i = 0; i < text.length && next < found.length; ) {
        if (i === found[next]) {
            if (depth === 0) return script.from + i;
            next++;
            continue;
        }
        const skipped = skipNonCode(text, i);
        if (skipped !== null) {
            // A match never starts inside a string or comment that is skipped past.
            while (next < found.length && found[next] < skipped) next++;
            i = skipped;
            continue;
        }
        const ch = text[i];
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        i++;
    }
    return script.from + found[0];
}

/**
 * Where the template READS `name`: inside `{{ }}`, a bound attribute's value or a directive's
 * parentheses — not the same word in the page's text. The first such place, or the first word
 * anywhere in the template when none is recognised.
 */
function findTemplateRead(source: string, template: Region | undefined, name: string): number | undefined {
    if (!template) return undefined;
    const text = source.slice(template.from, template.to);
    const re = new RegExp(`(?<![\\w$.-])${escape(name)}(?![\\w$-])`, 'g');
    let first: number | undefined;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        first ??= m.index;
        const before = text.slice(0, m.index);
        const inMustache = before.lastIndexOf('{{') > before.lastIndexOf('}}');
        const line = before.slice(before.lastIndexOf('\n') + 1);
        // Match: an open bound value `:x="…`/`@x='…` or directive head `@if (…` on this line, not yet closed.
        const inBinding = /(?:^|\s)[:@][\w.:-]+\s*=\s*(["'])[^"']*$/.test(line) || /@\w+\s*\([^)]*$/.test(line);
        if (inMustache || inBinding) return template.from + m.index;
    }
    return first === undefined ? undefined : template.from + first;
}

/**
 * The offset a finding is about, by code. Each locator reads the text the message names, in the
 * block the code is raised from.
 */
function locate(w: ValidationWarning, source: string, script?: Region, template?: Region): number | undefined {
    const name = quotedName(w.message);
    const text = quotedText(w.message);
    switch (w.code) {
        case 'PDX_PROP_INVALID_TYPE':
        case 'PDX_PROP_TYPE_MISMATCH':
            return name ? find(source, script, new RegExp(`@prop\\s+${escape(name)}\\b`)) : undefined;
        // The second declaration is the one the author adds by mistake; the first was there.
        case 'PDX_DUP_PROP':
            return name ? find(source, script, new RegExp(`@prop\\s+${escape(name)}\\b`), 1) : undefined;
        case 'PDX_DUP_EVENT':
            return name ? find(source, script, new RegExp(`@event\\s+${escape(name)}\\b`), 1) : undefined;
        case 'PDX_EVENT_NAME_CASE':
            return name ? find(source, script, new RegExp(`@event\\s+${escape(name)}\\b`)) : undefined;
        case 'PDX_EXPOSE_UNDECLARED':
            // Match: `@expose a, close` — the line that lists the name.
            return name ? find(source, script, new RegExp(`@expose\\b[^;\\n]*\\b${escape(name)}\\b`)) : undefined;
        case 'PDX_FETCH_NO_ERROR_UI':
        case 'PDX_FETCH_METHOD':
        case 'PDX_FETCH_TYPE_COLON':
        case 'PDX_FETCH_UNKNOWN_OPTION':
            return name ? find(source, script, new RegExp(`@fetch\\s+${escape(name)}\\b`)) : undefined;
        case 'PDX_FORM_NO_SUBMIT':
        case 'PDX_FORM_ARRAY_RULES_IGNORED': {
            // 'login' in one message, `@form order:` in the other.
            const form = name ?? /@form (\w+)/.exec(w.message)?.[1];
            return form ? find(source, script, new RegExp(`@form\\s+${escape(form)}\\b`)) : undefined;
        }
        case 'PDX_LEGACY_IN_SETUP': {
            // Match: `carries defineProps,` — the marker the message names.
            const marker = /carries (\w+)/.exec(w.message)?.[1];
            return marker ? find(source, script, new RegExp(`\\b${escape(marker)}\\b`)) : undefined;
        }
        case 'PDX_PAGE_INVALID_PATH':
        case 'PDX_PAGE_INVALID_CONSTRAINT':
        case 'PDX_PAGE_EMPTY_CONSTRAINT':
            return find(source, script, /@page\b/);
        case 'PDX_UNRESOLVED_COMPONENT': {
            const tag = /^<([\w-]+)>/.exec(w.message)?.[1];
            return tag ? find(source, template, new RegExp(`<${escape(tag)}(?![\\w-])`)) : undefined;
        }
        case 'PDX_UNDECLARED_REF':
            return name ? findTemplateRead(source, template, name) : undefined;
        case 'PDX_INVALID_ENUM_VALUE': {
            // Match: `<pdx-button> size="huge"` — the tag, the attribute and the value.
            const m = /^<([\w-]+)> ([\w-]+)="([^"]*)"/.exec(w.message);
            if (!m) return undefined;
            // Match: the attribute inside that tag, static or bound to the literal. Groups: [1]=up to the name.
            const re = new RegExp(`(<${escape(m[1])}\\b[^>]*?\\s):?${escape(m[2])}\\s*=\\s*["']\\s*'?${escape(m[3])}`, 'i');
            const found = template ? re.exec(source.slice(template.from, template.to)) : null;
            return found ? template!.from + found.index + found[1].length : undefined;
        }
        case 'PDX_STORE_EXPORT': {
            // Match: "The export `export const label = …` of a @store module" — the export's first line.
            const first = /^The export `([^`\n]*)`/.exec(w.message)?.[1];
            return first ? find(source, script, new RegExp(escape(first))) : undefined;
        }
        case 'PDX_REWRITE_FALLBACK': {
            // Match: `Fragment: <code>` — its first line, as written in the script.
            const first = /Fragment: ([^\n]*)/.exec(w.message)?.[1]?.trim();
            return first ? find(source, script, new RegExp(escape(first))) : undefined;
        }
    }
    // A declaration quoted as written (`"@prop label;"`), or a name a directive gives (`"loadMissing"`).
    if (text) {
        const at = find(source, script, new RegExp(escape(text)));
        if (at !== undefined) return at;
    }
    // A finding about a declared name: PDX_NON_REACTIVE, PDX_UNUSED_REACTIVE, PDX_CIRCULAR_DERIVED.
    if (name) return findDeclaration(source, script, name);
    return undefined;
}

/**
 * Where the first syntax error of the setup body is, in the file. The body is the script without
 * what the analyser lifted out of it, so its lines are not the file's: the line it fails on is found
 * in the script by its text.
 */
function locateSyntaxError(body: string, source: string, script?: Region): number | undefined {
    const sf = ts.createSourceFile('__pdx_setup.ts', body, ts.ScriptTarget.Latest, /*setParentNodes*/ false, ts.ScriptKind.TS);
    const d = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.[0];
    if (!d || typeof d.start !== 'number') return undefined;
    const at = sf.getLineAndCharacterOfPosition(d.start);
    const bodyLine = body.split('\n')[at.line];
    const written = bodyLine.trim();
    if (!written) return undefined;
    const lineStart = find(source, script, new RegExp(escape(written)));
    if (lineStart === undefined) return undefined;
    const indent = bodyLine.length - bodyLine.trimStart().length;
    return lineStart + Math.max(0, at.character - indent);
}

/** 1-based line and column of a file offset. */
function lineColumn(source: string, offset: number): { line: number; column: number } {
    const before = source.slice(0, offset);
    return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}

/**
 * Give every finding from one file its 1-based line and column in that file, where the text it is
 * about can be found. A finding with a line keeps it and gains a column — the first character of
 * the line's code — when it had none. `body` is the assembled setup body (`analysis.body`), which
 * PDX_SCRIPT_SYNTAX_ERROR is measured on. Then each finding gets the fix its code builds from that
 * position (`proposeFixes`). Safe to call twice: a positioned finding is left alone.
 */
export function positionWarnings(source: string, warnings: ValidationWarning[], body?: string): ValidationWarning[] {
    const descriptor = parseSFC(source);
    // A source with no block at all — a `.pdx.ts` — is a script from its first character to its
    // last: without a region every finding in it would stay without a line.
    const tagless = !descriptor.script && !descriptor.template && descriptor.styles.length === 0;
    const script = tagless ? { from: 0, to: source.length }
        : descriptor.script && !descriptor.script.src ? { from: descriptor.script.start, to: descriptor.script.end } : undefined;
    const template = descriptor.template && !descriptor.template.src ? { from: descriptor.template.start, to: descriptor.template.end } : undefined;
    const lines = source.split('\n');
    for (const w of warnings) {
        if (w.line === undefined) {
            const at = w.code === 'PDX_SCRIPT_SYNTAX_ERROR'
                ? (body ? locateSyntaxError(body, source, script) : undefined)
                : locate(w, source, script, template);
            if (at !== undefined) Object.assign(w, lineColumn(source, at));
        } else if (w.column === undefined) {
            const text = lines[w.line - 1] ?? '';
            w.column = text.length - text.trimStart().length + 1;
        }
    }
    // A fix is built from the position just found, so it is attached here.
    return proposeFixes(source, warnings);
}
