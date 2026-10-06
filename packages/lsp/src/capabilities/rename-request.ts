// textDocument/prepareRename and textDocument/rename over the workspace: the lexical rename for a
// tag, a @prop or an @event, which knows the attributes that consume them, and TypeScript for a
// script symbol, in every file that uses it.

import { ResponseError, ErrorCodes, type PrepareRenameParams, type RenameParams, type Range, type WorkspaceEdit } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getAnalysis } from '../document-manager';
import { prepareRename, getRenameEdits, InvalidRenameError, assertIdentifier } from './rename';
import { getWordAtPosition, getWordRangeAtPosition } from './definition';
import { tsRenameEdits, realFileName, type RenameSource } from './ts-rename';
import { positionToOffset } from '../utils/tag-context';
import { pdxToVirtual } from '../utils/virtual-file';
import { buildComponentIndex } from '../utils/component-index';
import type { Workspace } from '../workspace';

/** Every .pdx of the workspace, projected, plus the document itself when it is a real file (.pdx.ts). */
function renameSources(ws: Workspace, document: TextDocument): RenameSource[] {
    const sources: RenameSource[] = ws.buildWorkspaceFiles()
        .filter(f => f.uri.endsWith('.pdx'))
        .map(f => ({ uri: f.uri, source: f.content, vf: ws.virtualOfText(f.uri, f.content) }));
    if (!document.uri.endsWith('.pdx')) sources.push({ uri: document.uri, source: document.getText() });
    else if (!sources.some(s => s.uri === document.uri)) {
        sources.push({ uri: document.uri, source: document.getText(), vf: ws.virtualOfText(document.uri, document.getText()) });
    }
    return sources;
}

/** The range a rename at the cursor would replace, null when nothing there renames, or the refusal. */
export function prepareRenameAt(ws: Workspace, document: TextDocument, params: PrepareRenameParams): Range | ResponseError<void> | null {
    const source = document.getText();
    const wr = getWordRangeAtPosition(source, params.position);
    if (!wr) return null;
    const offset = positionToOffset(source, params.position);

    // A .pdx.ts is TypeScript: what TypeScript can rename.
    if (!document.uri.endsWith('.pdx')) {
        const svc = ws.tsServiceOf(document.uri);
        return svc?.canRename(realFileName(document.uri), source, offset) ? wr.range : null;
    }

    const { analysis, descriptor } = getAnalysis(document);
    try {
        const range = prepareRename({ word: wr.word, source, descriptor, analysis, wordRange: wr.range, tagPackage: ws.tagPackageOf(document.uri) });
        if (range) return range;
    } catch (e) {
        if (e instanceof InvalidRenameError) return new ResponseError(ErrorCodes.InvalidRequest, e.message);
        throw e;
    }
    // A symbol the .pdx imports or declares in a way the lexical index does not list: TypeScript decides.
    const svc = ws.tsServiceOf(document.uri);
    const vf = ws.getVirtual(document);
    const v = vf ? pdxToVirtual(vf, offset) : -1;
    return svc && vf && v >= 0 && svc.canRename(svc.virtualName(document.uri), vf.content, v) ? wr.range : null;
}

/** The edits of renaming the symbol at the cursor to `params.newName`, null for none, or the refusal. */
export function renameAt(ws: Workspace, document: TextDocument, params: RenameParams): WorkspaceEdit | ResponseError<void> | null {
    const source = document.getText();
    const word = getWordAtPosition(source, params.position);
    if (!word) return null;
    const offset = positionToOffset(source, params.position);
    const svc = ws.tsServiceOf(document.uri);

    if (!document.uri.endsWith('.pdx')) {
        try { assertIdentifier(params.newName); } catch (e) {
            if (e instanceof InvalidRenameError) return new ResponseError(ErrorCodes.InvalidRequest, e.message);
            throw e;
        }
        return svc ? tsRenameEdits(svc, renameSources(ws, document), { uri: document.uri, offset }, params.newName) : null;
    }

    const { analysis, descriptor } = getAnalysis(document);
    const files = ws.buildWorkspaceFiles();
    try {
        const ctx = {
            word, newName: params.newName, source, descriptor, analysis, uri: params.textDocument.uri,
            files, index: buildComponentIndex(files.filter(f => f.uri.endsWith('.pdx'))), tagPackage: ws.tagPackageOf(document.uri),
        };
        // A tag, a @prop or an @event: the lexical rename, which knows the attributes that consume them.
        const isAttributeSymbol = !!analysis && (analysis.props.some(p => p.name === word) || analysis.events.some(e => e.name === word));
        if (word.startsWith('pdx-') || isAttributeSymbol || !svc) return getRenameEdits(ctx);
        assertIdentifier(params.newName);
        // A script symbol: where TypeScript says it is used, in every file; the lexical
        // rename of this file when TypeScript finds nothing.
        return tsRenameEdits(svc, renameSources(ws, document), { uri: document.uri, offset }, params.newName) ?? getRenameEdits(ctx);
    } catch (e) {
        if (e instanceof InvalidRenameError) {
            return new ResponseError(ErrorCodes.InvalidRequest, e.message);
        }
        throw e;
    }
}
