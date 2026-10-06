// textDocument/definition over the workspace: a tag to its component, an import to its file, a
// projected expression to what TypeScript says, then the regex fallbacks.

import type { DefinitionParams, Definition, LocationLink } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getAnalysis } from '../document-manager';
import { resolveTagDefinition, resolveComponentDefinition, resolveImportDefinition, resolveImportedSymbol, resolveLocalSymbolDefinition, getWordAtPosition } from './definition';
import { tsDefinition } from './ts-features';
import { getTagContext, positionToOffset } from '../utils/tag-context';
import { pdxToVirtual } from '../utils/virtual-file';
import type { Workspace } from '../workspace';

/** Where the symbol under the cursor of `document` is defined, or null. */
export function definitionAt(ws: Workspace, document: TextDocument, params: DefinitionParams): Definition | LocationLink[] | null {
    const source = document.getText();
    const uri = params.textDocument.uri;
    const { manifest, components } = ws.registryOf(uri);

    // 1. A tag (or one of its attributes/events) → the component's file.
    const tagCtx = getTagContext(source, params.position);
    if (tagCtx) {
        // attrToken: jump to that specific member (prop/event); otherwise to the component's declaration.
        const loc = resolveComponentDefinition(tagCtx.tag, manifest, components, tagCtx.attrToken);
        if (loc) return loc;
    }

    // 2. A local import: the cursor on the module specifier → that file.
    const importLoc = resolveImportDefinition(source, params.position, uri);
    if (importLoc) return importLoc;

    const word = getWordAtPosition(source, params.position);
    if (!word) return null;

    // 3. A pdx- tag (outside a tag context) → the component's file.
    if (word.startsWith('pdx-')) {
        const loc = resolveComponentDefinition(word, manifest, components) ?? resolveTagDefinition(word, components);
        if (loc) return loc;
    }

    // 4. The projected region (script or template expression): the PRECISE TS
    //    definition (the member `c.del`, an import into .ts/.pdx.ts at the exact line, types).
    //    It comes before the regex heuristics: the LanguageService resolves an import to the
    //    exact symbol, while the heuristics land on the start of the file or on a re-export.
    const tsService = ws.tsServiceOf(uri);
    if (tsService) {
        const vf = ws.getVirtual(document);
        if (vf) {
            const v = pdxToVirtual(vf, positionToOffset(source, params.position));
            if (v >= 0) {
                const locs = tsDefinition(tsService, uri, vf, v, source);
                if (locs.length) return locs;
            }
        }
    }

    // 5. Fallback: a binding imported from a relative module (a .pdx target TS cannot
    //    parse, for one) → find the declaration in the module's file with a regex.
    const impSym = resolveImportedSymbol(source, word, uri);
    if (impSym) return impSym;

    // 6. Fallback: a symbol in the same file (@prop/@event/$signal/$derived/a function).
    const { analysis, descriptor } = getAnalysis(document);
    if (analysis && descriptor?.script) {
        const symLoc = resolveLocalSymbolDefinition(word, analysis, source, descriptor.script, uri);
        if (symLoc) return symLoc;
    }

    return null;
}
