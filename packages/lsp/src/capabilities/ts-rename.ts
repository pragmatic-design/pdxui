// TS rename — a script symbol renamed where TypeScript says it is used, across files.
//
// The lexical rename sees one file: a function a .pdx.ts exports would keep its old name wherever a
// .pdx imports it. Here every .pdx of the workspace is projected into the TypeScript program at once,
// with the real files open in the editor, and `findRenameLocations` answers; each location in a
// projected file is mapped back onto its .pdx, and one in the scaffolding is dropped.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { WorkspaceEdit, TextEdit } from 'vscode-languageserver';
import { offsetToPosition } from '../utils/positions';
import { pdxToVirtual, virtualToPdx, type VirtualFile } from '../utils/virtual-file';
import type { PdxTsService } from '../utils/ts-service';
import { pathToUri } from '../utils/uri';

/** A file the rename may touch: a .pdx with its projection, or a real file (a .pdx.ts) with its text. */
export interface RenameSource {
    uri: string;
    /** The file's text: the .pdx source, or the real file's content. */
    source: string;
    /** The projection of a .pdx; absent for a real file. */
    vf?: VirtualFile | null;
}

/** A file path as TypeScript names it, for a URI. */
export function realFileName(uri: string): string {
    let p: string;
    try { p = fileURLToPath(uri); } catch { p = uri.replace(/^file:\/\/\/?/, ''); }
    return p.split('\\').join('/');
}

/** File names compare case-insensitively where the file system does (Windows). */
const key = (fileName: string) => (process.platform === 'win32' ? fileName.toLowerCase() : fileName);

/**
 * The edits that rename what is at `offset` in `target` (a .pdx offset, or an offset in a real
 * file) to `newName`, or null when TypeScript finds nothing to rename there.
 */
export function tsRenameEdits(svc: PdxTsService, sources: RenameSource[], target: { uri: string; offset: number }, newName: string): WorkspaceEdit | null {
    const byName = new Map<string, RenameSource>();
    const entries: { fileName: string; content: string }[] = [];
    for (const s of sources) {
        if (s.vf === null) continue; // a .pdx with no script projects nothing
        const fileName = s.vf ? svc.virtualName(s.uri) : realFileName(s.uri);
        const content = s.vf ? s.vf.content : s.source;
        byName.set(key(fileName), s);
        entries.push({ fileName, content });
    }

    const own = sources.find(s => s.uri === target.uri);
    if (!own) return null;
    const targetName = own.vf ? svc.virtualName(own.uri) : realFileName(own.uri);
    const offset = own.vf ? pdxToVirtual(own.vf, target.offset) : target.offset;
    if (offset < 0) return null;

    const changes: Record<string, TextEdit[]> = {};
    for (const loc of svc.renameLocations(entries, targetName, offset)) {
        const src = byName.get(key(loc.fileName));
        let uri: string, text: string, start: number, end: number;
        if (src?.vf) {
            start = virtualToPdx(src.vf, loc.start);
            end = virtualToPdx(src.vf, loc.start + loc.length);
            if (start < 0 || end < 0) continue; // the projection's scaffolding, not the author's code
            ({ uri, source: text } = src);
        } else {
            uri = src?.uri ?? pathToUri(loc.fileName);
            try { text = src?.source ?? readFileSync(loc.fileName, 'utf-8'); } catch { continue; } // gone from disk
            start = loc.start;
            end = loc.start + loc.length;
        }
        (changes[uri] ??= []).push({ range: { start: offsetToPosition(text, start), end: offsetToPosition(text, end) }, newText: newName });
    }
    return Object.keys(changes).length > 0 ? { changes } : null;
}
