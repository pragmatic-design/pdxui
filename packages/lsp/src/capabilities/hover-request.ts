// textDocument/hover over the workspace: a component's tag, prop or event from its description, a
// rune from the rune list, and TypeScript inside the projected regions.

import type { Hover, HoverParams } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getHoverInfo, getComponentHover } from './hover';
import { tsHover } from './ts-features';
import { getTagContext, positionToOffset } from '../utils/tag-context';
import { pdxToVirtual } from '../utils/virtual-file';
import type { Workspace } from '../workspace';

/** The hover for the cursor of `document`, or null. */
export function hoverAt(ws: Workspace, document: TextDocument, params: HoverParams): Hover | null {
    const source = document.getText();

    // A component/attribute from the manifest (tag, prop, event)
    const tagCtx = getTagContext(source, params.position);
    if (tagCtx) {
        const comp = ws.registryOf(params.textDocument.uri).describe(tagCtx.tag);
        if (comp) {
            const h = getComponentHover(comp, tagCtx);
            if (h) return h;
        }
    }

    const rune = getHoverInfo(source, params.position);
    if (rune) return rune;

    // TypeScript hover in the projected region (script or template expression).
    const tsService = ws.tsServiceOf(params.textDocument.uri);
    if (tsService) {
        const vf = ws.getVirtual(document);
        if (vf) {
            const v = pdxToVirtual(vf, positionToOffset(source, params.position));
            if (v >= 0) return tsHover(tsService, params.textDocument.uri, vf, v);
        }
    }
    return null;
}
