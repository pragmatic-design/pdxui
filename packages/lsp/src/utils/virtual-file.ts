// Virtual file — assembles the virtual TS file for a .pdx:
//   [projected script (offsets 1:1 with the script)] + [;export {};] + [__pdxRender(){…}]
// and provides the two-way mapping between .pdx offsets and virtual offsets.

import type { TemplateNode } from '@pdxui/compiler';
import { projectScript } from './ts-service';
import { projectTemplate } from './template-projection';
import type { ResolveType } from './template-projection';
import type { SegmentMap } from './segment-map';

const EPILOGUE = '\n;export {};\n';

export interface VirtualFile {
    content: string;
    scriptStart: number;     // the offset in the .pdx where the <script> content starts
    scriptLen: number;       // the length of the <script> content (the 1:1 region at the head of the virtual file)
    templateMap: SegmentMap | null;
}

export function buildVirtualFile(
    scriptContent: string, scriptStart: number,
    ast: TemplateNode[] | null, templateContent: string | null, templateStart: number,
    resolveType?: ResolveType,
): VirtualFile {
    let content = projectScript(scriptContent) + EPILOGUE;
    let templateMap: SegmentMap | null = null;

    if (ast && ast.length > 0 && templateContent != null && templateStart >= 0) {
        const proj = projectTemplate(ast, templateContent, templateStart, content.length, resolveType);
        content += proj.code;
        templateMap = proj.map;
    }

    return { content, scriptStart, scriptLen: scriptContent.length, templateMap };
}

/** A .pdx offset → the virtual file's offset, or -1 when it is outside a projected region. */
export function pdxToVirtual(vf: VirtualFile, pdxOffset: number): number {
    if (pdxOffset >= vf.scriptStart && pdxOffset <= vf.scriptStart + vf.scriptLen) {
        return pdxOffset - vf.scriptStart; // the script region: 1:1 at the head of the virtual file
    }
    return vf.templateMap ? vf.templateMap.toGen(pdxOffset) : -1;
}

/** A virtual file offset → the .pdx offset, or -1 when it lands in the scaffolding. */
export function virtualToPdx(vf: VirtualFile, vOffset: number): number {
    if (vOffset <= vf.scriptLen) return vf.scriptStart + vOffset; // the script region, 1:1
    return vf.templateMap ? vf.templateMap.toSrc(vOffset) : -1;
}
