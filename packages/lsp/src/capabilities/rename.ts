// Rename — workspace-aware rename of a .pdx symbol or component tag.
//
//   - Local symbol (signal/derived/fetch/form/function): edits in the current document.
//   - @prop / @event: edits in the current document AND every consumer that binds the
//     attribute (`:prop` / `::prop` / `@event`), so the rename is not silently partial.
//   - Component tag (<pdx-foo>): renames every usage across the workspace, plus the
//     defining file itself — the source file is renamed (filename-derived tag) or its
//     @tag literal is rewritten (explicit @tag).

import type { Range, WorkspaceEdit, TextEdit } from 'vscode-languageserver';
import type { ScriptAnalysis, SFCDescriptor } from '@pdxui/compiler';
import { findLocalOccurrences, findAttributeOccurrences, findTagUses } from '../utils/occurrences';
import { collectDeclaredNames } from './references';
import { tagFromUri, type ComponentInfo } from '../utils/component-index';
import type { WorkspaceFile } from './references';
import { escapeRegex } from '../utils/positions';

/** Valid JS identifier (for symbol rename). */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** Valid custom-element tag (for tag rename): pdx-foo, pdx-foo-bar. */
const TAG_NAME = /^pdx-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Thrown when the requested new name is invalid for its kind. */
export class InvalidRenameError extends Error {}

/** A symbol's new name must be an identifier; TypeScript's rename does not check it. */
export function assertIdentifier(newName: string): void {
    if (!IDENTIFIER.test(newName)) throw new InvalidRenameError(`'${newName}' is not a valid identifier`);
}

interface RenameContext {
    word: string;
    source: string;
    descriptor: SFCDescriptor | null;
    analysis: ScriptAnalysis | null;
    /**
     * The component package that defines a tag, or null for a project one. A package's tag cannot be
     * renamed from here: its definition is in node_modules, and renaming every use of `pdx-button`
     * (69 files on the showcase) would leave each one pointing at nothing.
     */
    tagPackage?: (tag: string) => string | null;
}

type RenameKind = 'symbol' | 'tag' | null;

/** Classify the thing under the cursor: a renamable local symbol, a component tag, or neither. */
export function renameKind(ctx: RenameContext): RenameKind {
    if (!ctx.word) return null;
    if (ctx.word.startsWith('pdx-')) return 'tag';
    if (ctx.descriptor?.script && ctx.analysis && collectDeclaredNames(ctx.analysis).has(ctx.word)) return 'symbol';
    return null;
}

/**
 * Range to highlight for the rename input (the exact word under the cursor), or null. Throws an
 * InvalidRenameError — the editor shows its message — for a tag a component package defines.
 */
export function prepareRename(ctx: RenameContext & { wordRange: Range | null }): Range | null {
    if (!ctx.wordRange) return null;
    const kind = renameKind(ctx);
    if (kind === 'tag') assertProjectTag(ctx);
    return kind ? ctx.wordRange : null;
}

/** A tag defined by a component package is not renamed: say by which. */
function assertProjectTag(ctx: RenameContext): void {
    const pkg = ctx.tagPackage?.(ctx.word);
    if (pkg) throw new InvalidRenameError(`<${ctx.word}> is defined by ${pkg} and cannot be renamed here.`);
}

interface RenameEditContext extends RenameContext {
    newName: string;
    uri: string;
    files: WorkspaceFile[];
    /** Tag → component info, for tag rename (defining file + @tag-ness). */
    index?: Map<string, ComponentInfo>;
}

/** Build the workspace edits to perform the rename, or null if nothing renamable. */
export function getRenameEdits(ctx: RenameEditContext): WorkspaceEdit | null {
    const kind = renameKind(ctx);
    if (kind === 'symbol') return renameSymbol(ctx);
    if (kind === 'tag') return renameTag(ctx);
    return null;
}

// ─── Symbol rename (local + cross-file prop/event) ──────────────────

function renameSymbol(ctx: RenameEditContext): WorkspaceEdit | null {
    if (!ctx.descriptor || !ctx.analysis) return null;
    if (!IDENTIFIER.test(ctx.newName)) {
        throw new InvalidRenameError(`'${ctx.newName}' is not a valid identifier`);
    }

    const ranges = findLocalOccurrences(ctx.source, ctx.descriptor, ctx.word);
    if (ranges.length === 0) return null;

    const changes: Record<string, TextEdit[]> = {
        [ctx.uri]: ranges.map(range => ({ range, newText: ctx.newName })),
    };

    // Cross-file: a @prop/@event is consumed as an attribute on this component's tag.
    const isProp = ctx.analysis.props.some(p => p.name === ctx.word);
    const isEvent = ctx.analysis.events.some(e => e.name === ctx.word);
    if (isProp || isEvent) {
        const tag = ctx.analysis.customTag ?? tagFromUri(ctx.uri);
        const akind = isEvent ? 'event' : 'prop';
        for (const file of ctx.files) {
            const attrs = findAttributeOccurrences(file.content, tag, ctx.word, akind);
            if (attrs.length === 0) continue;
            (changes[file.uri] ??= []).push(...attrs.map(range => ({ range, newText: ctx.newName })));
        }
    }

    dedupeChanges(changes);
    return { changes };
}

// ─── Tag rename (usages cross-file + defining file) ─────────────────

function renameTag(ctx: RenameEditContext): WorkspaceEdit | null {
    assertProjectTag(ctx);
    if (!TAG_NAME.test(ctx.newName)) {
        throw new InvalidRenameError(`'${ctx.newName}' is not a valid component tag (expected pdx-...)`);
    }

    // Edits to every file that uses the tag: .pdx and .html markup, .ts/.js strings.
    const textEdits: { uri: string; edits: TextEdit[] }[] = [];
    for (const file of ctx.files) {
        const occ = findTagUses(file.uri, file.content, ctx.word);
        if (occ.length > 0) textEdits.push({ uri: file.uri, edits: occ.map(range => ({ range, newText: ctx.newName })) });
    }

    const defining = ctx.index?.get(ctx.word);

    // Explicit @tag: rewrite the literal in the defining file, no file rename.
    if (defining?.usesCustomTag) {
        const defFile = ctx.files.find(f => f.uri === defining.uri);
        if (defFile) {
            const litEdit = tagLiteralEdit(defFile.content, ctx.word, ctx.newName);
            if (litEdit) {
                const existing = textEdits.find(t => t.uri === defining.uri);
                if (existing) existing.edits.push(litEdit);
                else textEdits.push({ uri: defining.uri, edits: [litEdit] });
            }
        }
        if (textEdits.length === 0) return null;
        return { changes: Object.fromEntries(textEdits.map(t => [t.uri, dedupe(t.edits)])) };
    }

    // Filename-derived tag: rename usages (changes) + rename the defining file (RenameFile).
    const documentChanges: object[] = textEdits.map(t => ({
        textDocument: { uri: t.uri, version: null },
        edits: dedupe(t.edits),
    }));

    if (defining) {
        const newUri = renamedUri(defining.uri, ctx.newName);
        if (newUri !== defining.uri) {
            documentChanges.push({ kind: 'rename', oldUri: defining.uri, newUri });
        }
    }

    if (documentChanges.length === 0) return null;
    return { documentChanges } as WorkspaceEdit;
}

/** Edit that rewrites the `@tag 'old'` / `@tag "old"` literal to the new tag. */
function tagLiteralEdit(content: string, oldTag: string, newTag: string): TextEdit | null {
    // Match: @tag 'old' or @tag "old". Group 1 = quote, group 2 = old tag — escaped whole: a tag
    // may hold a `.`, which unescaped matched any character (#71).
    const re = new RegExp(`@tag\\s+(["'])(${escapeRegex(oldTag)})\\1`);
    const m = re.exec(content);
    if (!m) return null;
    const nameStart = m.index + m[0].indexOf(oldTag, 4);
    return {
        range: rangeFromOffsets(content, nameStart, oldTag.length),
        newText: newTag,
    };
}

/** New file URI when a filename-derived tag is renamed: foo.pdx→bar.pdx, pdx-foo.pdx→pdx-bar.pdx. */
function renamedUri(uri: string, newTag: string): string {
    const slash = uri.lastIndexOf('/');
    const base = uri.slice(slash + 1);
    const hadPrefix = base.startsWith('pdx-');
    const newBase = (hadPrefix ? newTag : newTag.replace(/^pdx-/, '')) + '.pdx';
    return uri.slice(0, slash + 1) + newBase;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a single-line range covering `len` chars at absolute `offset` in `content`. */
function rangeFromOffsets(content: string, offset: number, len: number): Range {
    let line = 0, col = 0;
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === '\n') { line++; col = 0; } else col++;
    }
    return { start: { line, character: col }, end: { line, character: col + len } };
}

function rangeKey(r: Range): string {
    return `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;
}

/** Remove duplicate edits (same range) — defends against a file matching twice. */
function dedupe(edits: TextEdit[]): TextEdit[] {
    const seen = new Set<string>();
    return edits.filter(e => { const k = rangeKey(e.range); if (seen.has(k)) return false; seen.add(k); return true; });
}

function dedupeChanges(changes: Record<string, TextEdit[]>): void {
    for (const uri of Object.keys(changes)) changes[uri] = dedupe(changes[uri]);
}
