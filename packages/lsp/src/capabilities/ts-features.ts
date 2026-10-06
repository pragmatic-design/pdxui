// TS features — completion/hover/definition from the virtual file (script + template),
// with the .pdx ↔ virtual position mapping going through VirtualFile.

import { CompletionItem, CompletionItemKind, MarkupKind } from 'vscode-languageserver';
import type { Hover, Location } from 'vscode-languageserver';
import type ts from 'typescript';
import type { PdxTsService } from '../utils/ts-service';
import { virtualToPdx, type VirtualFile } from '../utils/virtual-file';
import { offsetToPosition } from '../utils/positions';

const KIND_MAP: Record<string, CompletionItemKind> = {
    function: CompletionItemKind.Function,
    method: CompletionItemKind.Method,
    property: CompletionItemKind.Property,
    var: CompletionItemKind.Variable,
    let: CompletionItemKind.Variable,
    const: CompletionItemKind.Constant,
    class: CompletionItemKind.Class,
    interface: CompletionItemKind.Interface,
    enum: CompletionItemKind.Enum,
    keyword: CompletionItemKind.Keyword,
    module: CompletionItemKind.Module,
    alias: CompletionItemKind.Reference,
    parameter: CompletionItemKind.Variable,
};

export function tsCompletions(svc: PdxTsService, uri: string, vf: VirtualFile, vOffset: number): CompletionItem[] {
    const info = svc.getCompletions(uri, vf.content, vOffset);
    if (!info) return [];
    return info.entries.map(e => ({
        label: e.name,
        kind: KIND_MAP[e.kind] ?? CompletionItemKind.Text,
        detail: e.kindModifiers || undefined,
        sortText: e.sortText,
    }));
}

export function tsHover(svc: PdxTsService, uri: string, vf: VirtualFile, vOffset: number): Hover | null {
    const qi = svc.getQuickInfo(uri, vf.content, vOffset);
    if (!qi) return null;
    const sig = parts(qi.displayParts);
    const doc = parts(qi.documentation);
    if (!sig && !doc) return null;
    return { contents: { kind: MarkupKind.Markdown, value: '```typescript\n' + sig + '\n```' + (doc ? '\n\n' + doc : '') } };
}

export function tsDefinition(
    svc: PdxTsService, uri: string, vf: VirtualFile, vOffset: number, source: string,
): Location[] {
    const out: Location[] = [];
    for (const d of svc.getDefinition(uri, vf.content, vOffset)) {
        if (d.virtual) {
            const s = virtualToPdx(vf, d.startOffset);
            if (s < 0) continue; // a definition in the scaffolding → nowhere to navigate to
            const e = virtualToPdx(vf, d.endOffset);
            out.push({ uri, range: { start: offsetToPosition(source, s), end: offsetToPosition(source, e < 0 ? s : e) } });
        } else {
            out.push({ uri: pathToUri(d.fileName), range: { start: d.startLC, end: d.endLC } });
        }
    }
    return out;
}

function parts(p: ts.SymbolDisplayPart[] | undefined): string {
    return (p ?? []).map(x => x.text).join('');
}

function pathToUri(p: string): string {
    const n = p.replace(/\\/g, '/');
    return n.startsWith('/') ? `file://${n}` : `file:///${n}`;
}
