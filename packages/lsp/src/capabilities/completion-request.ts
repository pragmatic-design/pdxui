// textDocument/completion over the workspace: TypeScript inside the projected regions, a component's
// attributes, events, enum values and slots inside its tag, runes and tags elsewhere.

import type { CompletionItem, CompletionParams } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getRuneCompletions, getRegistryTagCompletions, getSlotCompletions, getTranslationKeyCompletions, getTagAttributeCompletions } from './completion';
import { tsCompletions } from './ts-features';
import { getTagContext, positionToOffset, enclosingCustomElement } from '../utils/tag-context';
import { pdxToVirtual } from '../utils/virtual-file';
import type { Workspace } from '../workspace';

/** The completion items at the cursor of `document`. */
export function completionsAt(ws: Workspace, document: TextDocument, params: CompletionParams): CompletionItem[] {
    const source = document.getText();
    const uri = params.textDocument.uri;
    const line = document.getText({ start: { line: params.position.line, character: 0 }, end: params.position });

    // $t(' trigger: the translation keys.
    if (line.includes("$t('") || line.includes('$t("')) {
        return getTranslationKeyCompletions(ws.translations);
    }

    // 1. A projected region (script, {{ }}, binding values, handlers) → TypeScript IntelliSense.
    const tsService = ws.tsServiceOf(uri);
    if (tsService) {
        const vf = ws.getVirtual(document);
        if (vf) {
            const v = pdxToVirtual(vf, positionToOffset(source, params.position));
            if (v >= 0) {
                const items = tsCompletions(tsService, uri, vf, v);
                return line.trim().startsWith('@') ? [...getRuneCompletions(), ...items] : items;
            }
        }
    }

    // 2. Inside a tag <pdx-xxx …>: an attribute/event name, or a static enum value — for a library
    //    component from its manifest, for a project one from its analysed .pdx. A child's
    //    `slot="…"` offers the named slots of the component around it.
    const registry = ws.registryOf(uri);
    const tagCtx = getTagContext(source, params.position);
    if (tagCtx && !tagCtx.onTagName) {
        if (tagCtx.inValue === 'slot') {
            const parent = enclosingCustomElement(source, tagCtx.tagStart);
            const parentComp = parent ? registry.describe(parent) : undefined;
            if (parentComp) return getSlotCompletions(parentComp);
        }
        const comp = registry.describe(tagCtx.tag);
        if (comp) return getTagAttributeCompletions(comp, tagCtx);
    }

    // 3. Start of a line / @ → runes + tags; '<' → tags.
    const tags = getRegistryTagCompletions(registry.manifest, registry.components);
    if (line.trim().startsWith('@') || line.trim() === '') {
        return [...getRuneCompletions(), ...tags];
    }
    if (line.includes('<')) return tags;
    return getRuneCompletions();
}
