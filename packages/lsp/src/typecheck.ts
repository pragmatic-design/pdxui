// @pdxui/lsp/typecheck — the editor's type-check of .pdx files, without an editor.
//
// `pdx check --types` runs it, so an agent or a CI job sees the TypeScript errors the editor shows:
// the same projection of script and template, the same rune declarations, the same mapping back
// onto the .pdx. One program holds every file, built once.

import { pathToFileURL } from 'url';
import { parseSFC, parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from './utils/ts-service';
import { buildVirtualFile } from './utils/virtual-file';
import { mapTsDiagnostics } from './capabilities/ts-diagnostics';
import { buildRegistry } from './utils/project-registry';
import { projectResolveType, resolveSnippetType } from './workspace';

/** One TypeScript error, placed on the .pdx. */
export interface PdxTypeError {
    /** The TypeScript code: 2322 for "Type … is not assignable…". */
    tsCode: number;
    message: string;
    /** 1-based, as `pdx check` reports positions. */
    line: number;
    column: number;
}

/**
 * The TypeScript errors of each .pdx in `files`, checked together against the project at `rootDir`
 * (its nearest tsconfig.json, its node_modules). A file with no script has none. The app's
 * `.pdx/routes.d.ts` types `navigate()` and `<pdx-link>` unless `routeTypes` is false (#150).
 */
export function typecheckPdx(rootDir: string, files: { path: string; content: string }[], options: { routeTypes?: boolean } = {}): Map<string, PdxTypeError[]> {
    const svc = new PdxTsService(rootDir, undefined, options);
    // The project's components, as the editor types them: a handler's event, a model, a snippet (#479).
    const registry = buildRegistry(rootDir);
    const resolveType = projectResolveType(registry);
    const projected = files.flatMap((f) => {
        const descriptor = parseSFC(f.content);
        if (!descriptor.script) return [];
        const tmpl = descriptor.template;
        const ast = tmpl ? parseTemplate(tmpl.content, 1) : [];
        const vf = buildVirtualFile(descriptor.script.content, descriptor.script.start, ast, tmpl?.content ?? null, tmpl ? tmpl.start : -1,
            resolveType, undefined, (tag, name) => resolveSnippetType(registry, tag, name));
        const uri = pathToFileURL(f.path).href;
        return [{ file: f, vf, fileName: svc.virtualName(uri) }];
    });

    const diagnostics = svc.diagnoseAll(projected.map((p) => ({ fileName: p.fileName, content: p.vf.content, templateBase: p.vf.templateBase })));
    const out = new Map<string, PdxTypeError[]>();
    for (const p of projected) {
        const found = mapTsDiagnostics(diagnostics.get(p.fileName) ?? [], p.vf, p.file.content).map((d) => ({
            tsCode: Number(/\d+/.exec(String(d.code))?.[0] ?? 0),
            message: d.message,
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
        }));
        out.set(p.file.path, found);
    }
    return out;
}
