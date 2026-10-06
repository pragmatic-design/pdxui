// Document Symbols — outline of a .pdx: @prop / @event / $signal / $derived / functions.
// Powers the editor outline, breadcrumb, and "Go to Symbol" (Ctrl+Shift+O).

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import type { ScriptAnalysis } from '@pdxui/compiler';
import { findDeclarationRange, type ScriptBlock } from '../utils/positions';

export function getDocumentSymbols(analysis: ScriptAnalysis, source: string, script: ScriptBlock): DocumentSymbol[] {
    const out: DocumentSymbol[] = [];

    const add = (name: string, kind: SymbolKind, detail: string, keywords: string[]): void => {
        const range = findDeclarationRange(source, script, name, keywords);
        if (range) out.push(DocumentSymbol.create(name, detail, kind, range, range));
    };

    for (const p of analysis.props) add(p.name, SymbolKind.Property, '@prop', ['@prop']);
    for (const e of analysis.events) add(e.name, SymbolKind.Event, '@event', ['@event']);
    for (const s of analysis.signals) add(s.name, SymbolKind.Variable, '$signal', ['let', 'const']);
    for (const d of analysis.deriveds) add(d.name, SymbolKind.Variable, '$derived', ['const', 'let']);
    for (const ex of analysis.exports) {
        if (ex.kind === 'function') add(ex.name, SymbolKind.Function, 'function', ['function']);
    }

    return out;
}
