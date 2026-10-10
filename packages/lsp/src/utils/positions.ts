// Position helpers — offset↔Position and declaration lookup within the <script> block.

import { Position, Range } from 'vscode-languageserver';

/** The document's <script> block: content + its start offset in the full source. */
export interface ScriptBlock { content: string; start: number; }

/** Declaration keywords a PDX symbol may be defined with (used to locate its declaration). */
export const DECL_KEYWORDS = ['@prop', '@event', '@fetch', '@form', '@expose', '@derived', 'let', 'const', 'var', 'function'];

/** Convert a UTF-16 code-unit offset into a 0-based LSP Position (line/character). */
export function offsetToPosition(source: string, offset: number): Position {
    let line = 0;
    let col = 0;
    const end = Math.min(offset, source.length);
    for (let i = 0; i < end; i++) {
        if (source[i] === '\n') { line++; col = 0; }
        else col++;
    }
    return Position.create(line, col);
}

/** `s` as a regex that matches it literally: every metacharacter escaped. */
export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the range of `name`'s declaration within the script block, mapped to the
 * full document via `script.start`. Prefers a declaration keyword (`@prop name`,
 * `let name`, …); falls back to the first whole-word occurrence. Returns null if
 * not found. Word boundaries avoid matching `name` inside `username`.
 */
export function findDeclarationRange(
    source: string,
    script: ScriptBlock,
    name: string,
    keywords: string[],
): Range | null {
    const esc = escapeRegex(name);
    let rel = -1;
    if (keywords.length > 0) {
        const declRe = new RegExp(`(?:${keywords.join('|')})\\s+${esc}\\b`);
        const m = declRe.exec(script.content);
        if (m) rel = m.index + m[0].lastIndexOf(name);
    }
    if (rel < 0) {
        const w = new RegExp(`\\b${esc}\\b`).exec(script.content);
        if (w) rel = w.index;
    }
    if (rel < 0) return null;
    const startPos = offsetToPosition(source, script.start + rel);
    return Range.create(startPos, Position.create(startPos.line, startPos.character + name.length));
}
