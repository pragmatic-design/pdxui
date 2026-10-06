// Go-to-definition — resolves component tags, local imports and same-file
// symbols (@prop / @event / $signal / $derived / functions) to their definition.

import { Range } from 'vscode-languageserver';
import type { Location, Position } from 'vscode-languageserver';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import type { ScriptAnalysis } from '@pdxui/compiler';
import type { ComponentEntry } from '../utils/project-scanner';
import type { ManifestComponent } from '../utils/manifest-index';
import { findDeclarationRange, offsetToPosition, type ScriptBlock } from '../utils/positions';

/** Convert file path to file:// URI. */
function fileToUri(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return `file://${normalized}`;
    return `file:///${normalized}`;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'); }

/** Opens `filePath` and returns the Location of the first pattern that matches; the range
 *  covers group 1 (the name) where there is one, otherwise the start of the match.
 *  It falls back to the top of the file when that is unreadable or nothing matches. */
function locate(filePath: string, patterns: RegExp[]): Location {
    const uri = fileToUri(filePath);
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return { uri, range: TOP_LOCATION }; }
    for (const re of patterns) {
        const m = re.exec(content);
        if (!m) continue;
        const name = m[1];
        const at = name != null ? content.indexOf(name, m.index) : m.index;
        const start = offsetToPosition(content, at);
        const end = name != null ? offsetToPosition(content, at + name.length) : start;
        return { uri, range: { start, end } };
    }
    return { uri, range: TOP_LOCATION };
}

/** Resolve a component tag to its definition file. */
export function resolveTagDefinition(
    tag: string,
    components: ComponentEntry[],
): Location | null {
    const entry = components.find(c => c.tag === tag);
    if (!entry) return null;

    return {
        uri: fileToUri(entry.filePath),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
}

const TOP_LOCATION = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const RESOLVE_EXTS = ['', '.ts', '.pdx', '.pdx.ts', '.js', '.mjs', '.css'];
const INDEX_EXTS = ['/index.ts', '/index.pdx', '/index.js'];
// Single-line import (multi-line imports aren't supported in .pdx scripts anyway).
const IMPORT_LINE_RE = /^\s*(?:import|export)\b[^'"]*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/;

function fileIsReadable(p: string): boolean {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** Cursor on an import line with a RELATIVE specifier → resolve it to the file. */
export function resolveImportDefinition(
    source: string, position: Position, documentUri: string,
): Location | null {
    const lines = source.split('\n');
    if (position.line >= lines.length) return null;
    const m = IMPORT_LINE_RE.exec(lines[position.line]);
    if (!m) return null;
    const spec = m[1] ?? m[2];
    if (!spec || (!spec.startsWith('./') && !spec.startsWith('../'))) return null; // local only

    let baseDir: string;
    try { baseDir = path.dirname(fileURLToPath(documentUri)); } catch { return null; }
    const target = path.resolve(baseDir, spec);

    for (const ext of [...RESOLVE_EXTS, ...INDEX_EXTS]) {
        const cand = target + ext;
        if (fileIsReadable(cand)) return { uri: fileToUri(cand), range: TOP_LOCATION };
    }
    return null;
}

/** A tag (or one of its attributes/events) → the component's source file.
 *  It prefers the manifest (@pdxui/ui components, in .ts), then the workspace's .pdx files. */
export function resolveComponentDefinition(
    tag: string, manifest: Map<string, ManifestComponent>, components: ComponentEntry[],
    member?: string | null,
): Location | null {
    const comp = manifest.get(tag);
    const filePath = comp?.filePath ?? components.find(c => c.tag === tag)?.filePath;
    if (!filePath) return null;

    const bare = (member ?? '').replace(/^[:@]/, '');
    const patterns: RegExp[] = [];
    if (bare) {
        // a specific member: a prop field (`variant:`) or an event name as a string ('pdx-toggle')
        patterns.push(new RegExp(`\\b(${escapeRe(bare)})\\s*:`));
        patterns.push(new RegExp(`['"](${escapeRe(bare)})['"]`));
    }
    // the component's declaration
    const t = escapeRe(tag);
    patterns.push(new RegExp(`component\\(\\s*['"](${t})['"]`));
    patterns.push(new RegExp(`tagName:\\s*['"](${t})['"]`));
    patterns.push(new RegExp(`@tag\\s+['"](${t})['"]`));
    return locate(filePath, patterns);
}

/** When `word` is a binding imported from a RELATIVE module, resolves that module to its file. */
export function resolveImportedSymbol(
    source: string, word: string, documentUri: string,
): Location | null {
    if (!word) return null;
    let baseDir: string;
    try { baseDir = path.dirname(fileURLToPath(documentUri)); } catch { return null; }

    for (const line of source.split('\n')) {
        const m = /^\s*import\s+(.+?)\s+from\s*['"]([^'"]+)['"]/.exec(line);
        if (!m) continue;
        const spec = m[2];
        if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
        // bindings: default, * as N, { a, b as c }
        const names = new Set<string>();
        for (const part of m[1].split(/[,{}]/)) {
            const t = part.trim();
            if (!t) continue;
            const asMatch = /(\w+)\s+as\s+(\w+)/.exec(t) || /\*\s+as\s+(\w+)/.exec(t);
            if (asMatch) names.add(asMatch[asMatch.length - 1]);
            else if (/^\w+$/.test(t)) names.add(t);
        }
        if (!names.has(word)) continue;

        const target = path.resolve(baseDir, spec);
        for (const ext of [...RESOLVE_EXTS, ...INDEX_EXTS]) {
            const cand = target + ext;
            if (!fileIsReadable(cand)) continue;
            // Find the symbol's declaration in the target file (not just line 0).
            const w = escapeRe(word);
            return locate(cand, [
                new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+(${w})\\b`),
                new RegExp(`export\\s*\\{[^}]*\\b(${w})\\b`),
                new RegExp(`(?:function|const|let|var|class|interface|type|enum)\\s+(${w})\\b`),
            ]);
        }
    }
    return null;
}

/** Same-file symbol (@prop/@event/$signal/$derived/function) → its declaration. */
export function resolveLocalSymbolDefinition(
    word: string, analysis: ScriptAnalysis, source: string, script: ScriptBlock, documentUri: string,
): Location | null {
    let keywords: string[] | null = null;
    if (analysis.props.some(p => p.name === word)) keywords = ['@prop'];
    else if (analysis.events.some(e => e.name === word)) keywords = ['@event'];
    else if (analysis.signals.some(s => s.name === word)) keywords = ['let', 'const', 'var'];
    else if (analysis.deriveds.some(d => d.name === word)) keywords = ['const', 'let'];
    else if (analysis.exports.some(e => e.kind === 'function' && e.name === word)) keywords = ['function', 'const', 'let'];
    // plain const/let/var (the head `c` of a chain `c.del`, for one) → to their declaration.
    else if (analysis.exports.some(e => e.name === word)) keywords = ['const', 'let', 'var', 'function', 'class'];
    if (!keywords) return null;

    const range = findDeclarationRange(source, script, word, keywords);
    return range ? { uri: documentUri, range } : null;
}

/**
 * Extract the word (tag name or identifier) at a given position in source.
 * Returns null if not on a word.
 */
export function getWordAtPosition(source: string, position: Position): string | null {
    const lines = source.split('\n');
    if (position.line >= lines.length) return null;

    const line = lines[position.line];
    const col = position.character;

    // Check if we're inside a tag: <pdx-xxx
    const tagMatch = line.match(/<(pdx-[\w-]+)/g);
    if (tagMatch) {
        for (const match of tagMatch) {
            const tag = match.slice(1); // remove '<'
            const idx = line.indexOf(match);
            if (col >= idx + 1 && col <= idx + match.length) {
                return tag;
            }
        }
    }

    // Extract word at position
    let start = col;
    let end = col;
    while (start > 0 && /[\w-]/.test(line[start - 1])) start--;
    while (end < line.length && /[\w-]/.test(line[end])) end++;

    const word = line.slice(start, end);
    return word.length > 0 ? word : null;
}

/**
 * Like getWordAtPosition but returns the word together with its exact range.
 * Used by prepareRename to highlight precisely the identifier/tag under the cursor.
 */
export function getWordRangeAtPosition(source: string, position: Position): { word: string; range: Range } | null {
    const lines = source.split('\n');
    if (position.line >= lines.length) return null;

    const line = lines[position.line];
    const col = position.character;
    let start = col;
    let end = col;
    while (start > 0 && /[\w$-]/.test(line[start - 1])) start--;
    while (end < line.length && /[\w$-]/.test(line[end])) end++;
    if (end <= start) return null;

    return {
        word: line.slice(start, end),
        range: Range.create(position.line, start, position.line, end),
    };
}
