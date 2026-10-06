// TS diagnostics — type errors from the virtual file (script + template), mapped
// back onto the .pdx through virtualToPdx. Diagnostics landing in the generated
// scaffolding (an unmapped offset) are dropped → no noise from the synthetic parts.

import { DiagnosticSeverity } from 'vscode-languageserver';
import type { Diagnostic } from 'vscode-languageserver';
import ts from 'typescript';
import { offsetToPosition } from '../utils/positions';
import { virtualToPdx, type VirtualFile } from '../utils/virtual-file';
import type { PdxTsService } from '../utils/ts-service';

// TS codes too noisy in a .pdx context.
const IGNORED_CODES = new Set<number>([
    2307, // Cannot find module '…'
    2792, // Cannot find module … moduleResolution
]);

export function getTsDiagnostics(
    svc: PdxTsService, uri: string, vf: VirtualFile, source: string,
): Diagnostic[] {
    return mapTsDiagnostics(svc.getSemanticDiagnostics(uri, vf.content), vf, source);
}

/**
 * TypeScript's diagnostics of a projected .pdx, placed on the .pdx — the editor's and
 * `pdx check --types`'s, so the two report the same thing at the same place.
 */
export function mapTsDiagnostics(diagnostics: readonly ts.Diagnostic[], vf: VirtualFile, source: string): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of diagnostics) {
        if (typeof d.code === 'number' && IGNORED_CODES.has(d.code)) continue;
        if (d.start == null || d.length == null) continue;
        const startPdx = virtualToPdx(vf, d.start);
        if (startPdx < 0) continue; // scaffolding generato → ignora
        const endPdx = virtualToPdx(vf, d.start + d.length);
        out.push({
            severity: d.category === ts.DiagnosticCategory.Warning
                ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
            code: typeof d.code === 'number' ? `ts(${d.code})` : undefined,
            source: 'pdx-ts',
            message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
            range: {
                start: offsetToPosition(source, startPdx),
                end: offsetToPosition(source, endPdx < 0 ? startPdx : endPdx),
            },
        });
    }
    return out;
}
