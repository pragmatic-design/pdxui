// Everything the editor shows under a .pdx: the compiler's findings, the components that do not
// resolve in the document's project, and the TypeScript errors of its projection. `server.ts` sends
// what this returns.

import type { Diagnostic } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { validate, positionWarnings, parseIgnores, exemptionFor } from '@pdxui/compiler';

import { getAnalysis } from '../document-manager';
import { toDiagnostics } from './diagnostics';
import { getTsDiagnostics } from './ts-diagnostics';
import type { Workspace } from '../workspace';

/** The diagnostics of a .pdx document, or none for any other file. */
export function diagnoseDocument(ws: Workspace, document: TextDocument): Diagnostic[] | null {
    if (!document.uri.endsWith('.pdx')) return null;

    const { warnings, descriptor, analysis } = getAnalysis(document);
    const source = document.getText();
    const diagnostics = toDiagnostics(warnings, source, descriptor?.script ?? null);

    // <pdx-*> components that do not resolve. This lives here and not in `getAnalysis`'s cache
    // because it depends on the workspace index, which changes without the document changing: a
    // cached analysis would go stale with respect to the set of known tags.
    // `validate` is re-run and only this code is taken from it — it is work over an AST that is
    // already parsed, and it keeps the message in one place instead of duplicating it here.
    if (analysis && descriptor?.template) {
        try {
            // The question `pdx check` asks, of the document's project: will this element
            // work — a component package or a project file defines it, or the design system styles it.
            const { resolver, manifest } = ws.registryOf(document.uri);
            const isKnownTag = (t: string) => resolver.knownWithoutImport(t) || manifest.has(t);
            // Placed in the file by the tag it names: the cached AST counts lines from the template.
            const unresolved = positionWarnings(source, validate(analysis, getAnalysis(document).ast, document.uri, { isKnownTag, knownTags: () => resolver.tags, searched: () => resolver.searched })
                .filter(w => w.code === 'PDX_UNRESOLVED_COMPONENT'));
            // The file's exemptions cover it too; the bridge already reported any malformed one.
            const ignores = parseIgnores(source);
            diagnostics.push(...toDiagnostics(unresolved.filter((w) => !exemptionFor(ignores, w)), source, descriptor?.script ?? null));
        } catch { /* resolution is best-effort: a malformed template must not kill the others */ }
    }

    // Undeclared template→script references come with the compiler's own findings, above:
    // PDX_UNDECLARED_REF is validate()'s, the same check `pdx check` runs.

    // TS type diagnostics (script + template) from the virtual file.
    const tsService = ws.typeCheckEnabled ? ws.tsServiceOf(document.uri) : null;
    if (tsService) {
        const vf = ws.getVirtual(document);
        if (vf) diagnostics.push(...getTsDiagnostics(tsService, document.uri, vf, source));
    }

    return diagnostics;
}
