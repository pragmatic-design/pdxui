// Virtual file — assembles the virtual TS file for a .pdx:
//   [projected script] + [;export {};] + [__pdxRender(){…}]
// and provides the two-way mapping between .pdx offsets and virtual offsets. The projected script is
// 1:1 with the script but for the text it inserts (`insertions`, #564), which the mapping steps over.

import type { TemplateNode } from '@pdxui/compiler';
import { projectScriptMapped, type ScriptInsertion } from './project-script';
import { projectTemplate } from './template-projection';
import type { ResolveType, ResolveSnippet } from './template-projection';
import type { SegmentMap } from './segment-map';
import { refTargets, typeRefs, type ResolveExposed } from './ref-types';

const EPILOGUE = '\n;export {};\n';

export interface VirtualFile {
    content: string;
    scriptStart: number;     // the offset in the .pdx where the <script> content starts
    scriptLen: number;       // the length of the <script> content
    /** What the projection inserted into the script, in order: the only offsets it moved. */
    insertions: ScriptInsertion[];
    templateMap: SegmentMap | null;
    /** Where the template projection starts in `content`; -1 when there is none. What comes after it
     *  is checked under `strict`, what comes before it is not (#468). */
    templateBase: number;
}

export function buildVirtualFile(
    scriptContent: string, scriptStart: number,
    ast: TemplateNode[] | null, templateContent: string | null, templateStart: number,
    resolveType?: ResolveType,
    /** What a component tag exposes, to type a `:ref` on it (#140). */
    resolveExposed?: ResolveExposed,
    /** What types a `@snippet`'s parameters (#490). */
    resolveSnippet?: ResolveSnippet,
): VirtualFile {
    const projected = projectScriptMapped(scriptContent);
    const { script, declarations } = typeRefs(projected.text, refTargets(ast, resolveExposed));
    let content = script + EPILOGUE + (declarations ? declarations + '\n' : '');
    let templateMap: SegmentMap | null = null;
    let templateBase = -1;

    if (ast && ast.length > 0 && templateContent != null && templateStart >= 0) {
        templateBase = content.length;
        const proj = projectTemplate(ast, templateContent, templateStart, content.length, resolveType, resolveSnippet);
        content += proj.code;
        templateMap = proj.map;
    }

    return { content, scriptStart, scriptLen: scriptContent.length, insertions: projected.insertions, templateMap, templateBase };
}

/** The script region's length in the virtual file: the script's, and what was inserted into it. */
function scriptVirtualLen(vf: VirtualFile): number {
    return vf.scriptLen + vf.insertions.reduce((sum, ins) => sum + ins.length, 0);
}

/** A .pdx offset → the virtual file's offset, or -1 when it is outside a projected region. */
export function pdxToVirtual(vf: VirtualFile, pdxOffset: number): number {
    if (pdxOffset >= vf.scriptStart && pdxOffset <= vf.scriptStart + vf.scriptLen) {
        // The script region: 1:1 at the head of the virtual file, moved by what was inserted before it.
        const off = pdxOffset - vf.scriptStart;
        return off + vf.insertions.filter((ins) => ins.at <= off).reduce((sum, ins) => sum + ins.length, 0);
    }
    return vf.templateMap ? vf.templateMap.toGen(pdxOffset) : -1;
}

/**
 * A virtual file offset → the .pdx offset, or -1 when it lands in the scaffolding. An offset inside
 * inserted text has no character of its own in the .pdx: it is the place the text was inserted at.
 */
export function virtualToPdx(vf: VirtualFile, vOffset: number): number {
    if (vOffset <= scriptVirtualLen(vf)) {
        let shift = 0;
        for (const ins of vf.insertions) {
            const start = ins.at + shift;
            if (vOffset < start) break;
            if (vOffset < start + ins.length) return vf.scriptStart + ins.at;
            shift += ins.length;
        }
        return vf.scriptStart + vOffset - shift;
    }
    return vf.templateMap ? vf.templateMap.toSrc(vOffset) : -1;
}
