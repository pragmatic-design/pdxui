// SFC Parser — splits a .pdx file into template / script / style blocks.
// Supports: src= attribute (external files), lang= attribute (default: ts).
// Uses tokenizer-aware close tag detection to handle </script> inside strings.
//
// Format:
//   <template> ... </template>
//   <script setup lang="ts" src="./counter.ts" />  ← external
//   <script setup> ... </script>                    ← inline
//   <style scoped src="./counter.css" />            ← external
//   <style scoped> ... </style>                     ← inline

import { skipNonCode } from '../compiler/tokenizer';
import { findOpenTag, isSpace } from '../text-scan';

export interface SFCBlock {
    content: string;
    start: number;
    end: number;
    /** External file path from src= attribute. null = inline content. */
    src: string | null;
}

export interface SFCScript extends SFCBlock {
    setup: boolean;
    /** Language: 'ts' (default) or 'js'. */
    lang: string;
}

export interface SFCStyle extends SFCBlock {
    scoped: boolean;
    /** Language: 'css' (default), 'scss', 'less', etc. */
    lang: string;
}

export interface SFCTemplate extends SFCBlock {
    /** Use Shadow DOM instead of Light DOM for this component. */
    shadow: boolean;
}

export interface SFCDescriptor {
    template: SFCTemplate | null;
    script: SFCScript | null;
    /** The FIRST style block, kept so every existing reader of `.style` still works. */
    style: SFCStyle | null;
    /** Every style block, in source order. A file may carry a scoped one and a global one. */
    styles: SFCStyle[];
    /** Structural errors (e.g. a block opened but never closed). Empty/absent when well-formed. */
    errors?: string[];
}

/**
 * Parse a .pdx Single File Component into its constituent blocks.
 * Extracts attributes: setup, scoped, lang, src.
 */
export function parseSFC(source: string): SFCDescriptor {
    const errors: string[] = [];
    const tpl = extractBlock(source, 'template', errors);
    // Detect shadow attribute on <template shadow>
    const shadowMatch = source.match(/<template\b([^>]*)>/);
    const shadow = shadowMatch ? /\bshadow\b/.test(shadowMatch[1]) : false;
    const styles = extractStyleBlocks(source, errors);
    const script = extractScriptBlock(source, errors);
    // One <script> and one <template> per file. The extractors take the first and stop, so a second
    // would be dropped in silence — a second <script setup> would compile to a module without it, and
    // when it holds only statements nothing would be reported at all. Reported like an unclosed block.
    const taken = [tpl, script, ...styles].filter((b): b is SFCBlock => b !== null);
    if (script) reportSecond(source, 'script', 'PDX_DUPLICATE_SCRIPT', script, taken, errors);
    if (tpl) reportSecond(source, 'template', 'PDX_DUPLICATE_TEMPLATE', tpl, taken, errors);
    return {
        template: tpl ? { ...tpl, shadow } : null,
        script,
        style: styles[0] ?? null,
        styles,
        ...(errors.length > 0 ? { errors } : {}),
    };
}

/**
 * Report a second `<tag>` block after `first`. An opening tag inside another block's content — the
 * text `<template>` in a script string, an html`` literal — is that block's text, not a block.
 */
function reportSecond(source: string, tag: string, code: string, first: SFCBlock, blocks: SFCBlock[], errors: string[]): void {
    // Past the first block: its closing tag, or its own end when it is self-closing (`src=`).
    const closing = `</${tag}>`;
    const from = source.startsWith(closing, first.end) ? first.end + closing.length : first.end;
    // Match: an opening <script …> / <template …> tag, self-closing or not.
    const open = new RegExp(`<${tag}(?:\\s[^>]*)?\\/?>`, 'gi');
    open.lastIndex = from;
    for (let m = open.exec(source); m; m = open.exec(source)) {
        const at = m.index;
        if (blocks.some(b => at >= b.start && at < b.end)) continue;
        const firstOpen = source.lastIndexOf(`<${tag}`, first.start);
        errors.push(`[${code}] a .pdx has one <${tag}> block: the one at line ${lineAt(source, at)} is ignored, `
            + `and its content never reaches the component. Move it into the first <${tag}> (line ${lineAt(source, firstOpen)}).`);
        return;
    }
}

/** 1-based line number of `offset` in `source`. */
function lineAt(source: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < source.length; i++) {
        if (source[i] === '\n') line++;
    }
    return line;
}

/** Extract a src= attribute value from an opening tag's attributes string. */
function extractSrc(attrs: string): string | null {
    const match = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    return match ? (match[1] ?? match[2]) : null;
}

/** Extract a lang= attribute value. Returns null if not specified. */
function extractLang(attrs: string): string | null {
    const match = attrs.match(/\blang\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    return match ? (match[1] ?? match[2]) : null;
}

/** Check if a tag is self-closing: <script ... /> */
function isSelfClosing(tag: string): boolean {
    return tag.trimEnd().endsWith('/>');
}

// ─── Tokenizer-Aware Close Tag Detection ──────────────────────────

/**
 * Find the real close tag (e.g. `</script>`) in source starting from contentStart.
 * Skips occurrences inside string literals, template literals, and comments.
 * For <template> blocks, uses simple indexOf (template content is HTML, not JS).
 */
function findCloseTag(source: string, contentStart: number, closeTag: string, isJS: boolean): number {
    // Template blocks contain HTML, not JS — no string/comment issues
    if (!isJS) return source.indexOf(closeTag, contentStart);

    // JS blocks: walk character by character, skip strings/comments
    for (let i = contentStart; i < source.length; i++) {
        const skip = skipNonCode(source, i);
        if (skip !== null) { i = skip - 1; continue; }

        // Check if current position matches the close tag
        if (source[i] === '<' && source.startsWith(closeTag, i)) {
            return i;
        }
    }
    return -1;
}

// ─── Block Extractors ──────────────────────────────────────────────

/**
 * The first `<tag …>` of a block: where it starts, its text, and its attributes — the text after the
 * name when it begins with whitespace, '' otherwise. A scan, not a pattern: `<script` followed by a
 * long run of whitespace and no `>` took quadratic time to reject (#70).
 */
function openBlockTag(source: string, tag: string): { index: number; text: string; attrs: string } | null {
    const open = findOpenTag(source, tag);
    if (!open) return null;
    return { index: open.start, text: open.text, attrs: isSpace(open.attrs[0]) ? open.attrs : '' };
}

function extractBlock(source: string, tag: string, errors?: string[]): SFCBlock | null {
    const openMatch = openBlockTag(source, tag);
    if (!openMatch) return null;

    const attrs = openMatch.attrs;
    const src = extractSrc(attrs);

    // Self-closing with src: <template src="./template.html" />
    if (src && isSelfClosing(openMatch.text)) {
        return { content: '', start: openMatch.index, end: openMatch.index + openMatch.text.length, src };
    }

    const closeTag = `</${tag}>`;
    const contentStart = openMatch.index + openMatch.text.length;
    const closeIndex = findCloseTag(source, contentStart, closeTag, false);
    if (closeIndex === -1) {
        // Open tag present but never closed — surface it instead of degrading to a fallback.
        errors?.push(`<${tag}> block opened at line ${lineAt(source, openMatch.index)} is never closed (missing ${closeTag}).`);
        return null;
    }

    return {
        content: source.slice(contentStart, closeIndex),
        start: contentStart,
        end: closeIndex,
        src,
    };
}

function extractScriptBlock(source: string, errors?: string[]): SFCScript | null {
    const openMatch = openBlockTag(source, 'script');
    if (!openMatch) return null;

    const attrs = openMatch.attrs;
    const setup = /\bsetup\b/.test(attrs);
    const lang = extractLang(attrs) ?? 'ts'; // Default: TypeScript
    const src = extractSrc(attrs);

    // Self-closing: <script setup src="./counter.ts" />
    if (isSelfClosing(openMatch.text)) {
        if (src) return { content: '', setup, lang, start: openMatch.index, end: openMatch.index + openMatch.text.length, src };
        // Self-closing <script /> with no src carries no code — nothing to extract.
        return null;
    }

    const contentStart = openMatch.index + openMatch.text.length;
    const closeIndex = findCloseTag(source, contentStart, '</script>', true);
    if (closeIndex === -1) {
        errors?.push(`<script> block opened at line ${lineAt(source, openMatch.index)} is never closed (missing </script>).`);
        return null;
    }

    return {
        content: source.slice(contentStart, closeIndex),
        setup,
        lang,
        start: contentStart,
        end: closeIndex,
        src,
    };
}

/**
 * Every `<style>` block, in source order.
 *
 * Not only the first: keeping the first match and counting nothing else would drop the rest without
 * a word, and a second block's CSS would simply never exist. The split that invites it is the one the
 * framework makes useful — a `scoped` block for the component and a plain one for the page-level CSS
 * it owns — and that file would compile half-styled.
 */
function extractStyleBlocks(source: string, errors?: string[]): SFCStyle[] {
    const blocks: SFCStyle[] = [];
    let from = 0;
    for (;;) {
        const block = extractStyleBlock(source.slice(from), errors, from);
        if (!block) break;
        blocks.push(block);
        // Past the closing tag, not past the content: `</style>` is 8 characters and a self-closing
        // block ends at its own `>`. Both are covered by taking the later of end and the open tag.
        const next = Math.max(block.end, block.start) + 8;
        if (next <= from) break;
        from = next;
    }
    return blocks;
}

function extractStyleBlock(source: string, errors?: string[], offset = 0): SFCStyle | null {
    const openMatch = openBlockTag(source, 'style');
    if (!openMatch) return null;

    const attrs = openMatch.attrs;
    const scoped = /\bscoped\b/.test(attrs);
    const lang = extractLang(attrs) ?? 'css';
    const src = extractSrc(attrs);

    // Self-closing: <style scoped src="./counter.css" />
    if (isSelfClosing(openMatch.text)) {
        if (src) return { content: '', scoped, lang, start: offset + openMatch.index, end: offset + openMatch.index + openMatch.text.length, src };
        return null; // self-closing <style /> with no src carries no CSS
    }

    const contentStart = openMatch.index + openMatch.text.length;
    // CSS can contain </style> in strings too (e.g. content: '</style>')
    const closeIndex = findCloseTag(source, contentStart, '</style>', true);
    if (closeIndex === -1) {
        errors?.push(`<style> block opened at line ${lineAt(source, openMatch.index)} is never closed (missing </style>).`);
        return null;
    }

    return {
        content: source.slice(contentStart, closeIndex),
        scoped,
        lang,
        // Offsets are into the WHOLE file, not into the slice this block was found in: the source
        // map and the `src=` resolution both read them against the original source.
        start: offset + contentStart,
        end: offset + closeIndex,
        src,
    };
}
