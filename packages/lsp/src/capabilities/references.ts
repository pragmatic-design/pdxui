// Find References — all uses of a symbol.
//   - Local identifier (prop/signal/derived/event/fetch/form/export): current document.
//   - Component tag (<pdx-foo>): every .pdx file in the workspace (cross-file scan).

import type { Location, Range } from 'vscode-languageserver';
import type { ScriptAnalysis, SFCDescriptor } from '@pdxui/compiler';
import { findLocalOccurrences, findTagUses, findAttributeOccurrences } from '../utils/occurrences';
import { findDeclarationRange, DECL_KEYWORDS } from '../utils/positions';
import { tagFromUri } from '../utils/component-index';

/** Names a .pdx declares as addressable symbols (props, events, signals, …). */
export function collectDeclaredNames(analysis: ScriptAnalysis): Set<string> {
    const names = new Set<string>();
    for (const p of analysis.props) names.add(p.name);
    for (const e of analysis.events) names.add(e.name);
    for (const s of analysis.signals) names.add(s.name);
    for (const d of analysis.deriveds) names.add(d.name);
    for (const f of analysis.fetches) names.add(f.name);
    for (const fm of analysis.forms) names.add(fm.name);
    for (const ex of analysis.exports) names.add(ex.name);
    return names;
}

function sameRange(a: Range, b: Range): boolean {
    return a.start.line === b.start.line && a.start.character === b.start.character
        && a.end.line === b.end.line && a.end.character === b.end.character;
}

/** A workspace file's URI + current text (current document included by the caller): a .pdx, or a
 *  .ts/.js/.html that may name a component tag. */
export interface WorkspaceFile { uri: string; content: string; }

export interface ReferenceQuery {
    word: string;
    source: string;
    descriptor: SFCDescriptor | null;
    analysis: ScriptAnalysis | null;
    uri: string;
    /** All .pdx files in the workspace, used for cross-file tag references. */
    files: WorkspaceFile[];
    includeDeclaration: boolean;
}

/** Resolve references for the symbol/tag under the cursor. */
export function getReferences(q: ReferenceQuery): Location[] {
    if (!q.word) return [];

    // Component tag → cross-file scan of every workspace .pdx, and of the .ts/.js/.html that name
    // it (a querySelector, an index.html).
    if (q.word.startsWith('pdx-')) {
        const locations: Location[] = [];
        for (const file of q.files) {
            for (const range of findTagUses(file.uri, file.content, q.word)) {
                locations.push({ uri: file.uri, range });
            }
        }
        return locations;
    }

    // Local identifier → current document, plus consumer attribute usages if it's a prop/event.
    if (!q.descriptor || !q.analysis) return [];
    if (!collectDeclaredNames(q.analysis).has(q.word)) return [];

    let ranges = findLocalOccurrences(q.source, q.descriptor, q.word);
    if (!q.includeDeclaration && q.descriptor.script) {
        const decl = findDeclarationRange(q.source, q.descriptor.script, q.word, DECL_KEYWORDS);
        if (decl) ranges = ranges.filter(r => !sameRange(r, decl));
    }
    const locations: Location[] = ranges.map(range => ({ uri: q.uri, range }));

    // Cross-file: a @prop/@event is consumed as an attribute on this component's tag.
    const isProp = q.analysis.props.some(p => p.name === q.word);
    const isEvent = q.analysis.events.some(e => e.name === q.word);
    if (isProp || isEvent) {
        const tag = q.analysis.customTag ?? tagFromUri(q.uri);
        const kind = isEvent ? 'event' : 'prop';
        for (const file of q.files) {
            for (const range of findAttributeOccurrences(file.content, tag, q.word, kind)) {
                locations.push({ uri: file.uri, range });
            }
        }
    }
    return locations;
}
