// Legacy-mode compilation (defineProps + explicit return). Backward compatibility.

import type { TemplateNode } from '../parser/template';
import type { SFCDescriptor } from '../parser/sfc';
import { generateNodes } from './codegen-template';
import { generateStyles, generateShadowStyles, hash, styleBlocks } from './codegen-styles';
import type { PluginRunner } from '../plugin-system';
import type { CompileContext } from './compile-context';
import { applyFormBindings } from './codegen-form-binding';
import { indent, extractTag, sourceFileOption } from './codegen-shared';
import { originMark } from './sourcemap';
import { coreRuntimeNames } from './core-import-names';
import { jsQuote } from './js-literal';

/** Compile using legacy defineProps + explicit return syntax. */
export function compileLegacyMode(descriptor: SFCDescriptor, ast: TemplateNode[], filename: string, _runner: PluginRunner | null | undefined, ctx: CompileContext): string {
    const production = ctx.production;
    const imports = new Set<string>(['html', 'component']);
    applyFormBindings(ast);
    const renderCode = generateNodes(ast, imports, ctx);
    const tag = extractTag(filename);

    let setupBody = '';
    let propsCode = '{}';
    let topLevelImports = '';

    if (descriptor.script) {
        const extracted = extractLegacyScript(descriptor.script.content.trim());
        propsCode = extracted.props || '{}';
        setupBody = extracted.body;
        topLevelImports = extracted.imports;
        for (const name of extracted.coreImportNames) imports.add(name);
    }

    // Production: static template pre-compilation
    const isStaticRender = production && !renderCode.includes('${');
    if (isStaticRender) {
        imports.delete('html');
        imports.add('__staticHTML');
    }

    // `<template shadow>`: the root has to be asked for, and the CSS has to go INTO it — a document
    // stylesheet does not cross the boundary. Without both, a shadow component with no <script>
    // block — a template and its styles, the smallest there is — renders in the light DOM with its
    // styles in the head, and `shadow` does nothing at all.
    const shadowStyles = generateShadowStyles(descriptor, filename, production);
    if (shadowStyles) imports.add('__adoptStyles');

    const coreImports = Array.from(imports).sort().join(', ');
    let code = `import { ${coreImports} } from '@pdxui/core';\n`;
    if (topLevelImports) code += topLevelImports + '\n';
    code += '\n';
    code += generateStyles(descriptor, filename, production);
    code += `component(${jsQuote(tag)}, {\n`;
    code += `  props: ${propsCode},\n`;
    code += sourceFileOption(ctx.sourceFile);
    if (descriptor.template?.shadow) code += `  shadow: true,\n`;
    // `scoped` writes every selector against [data-pdx-HASH]; the attribute has to be put on the
    // host or the whole stylesheet matches nothing. New mode does it in its generated setup; this
    // path does it here, and this path is also where a .pdx with NO <script> block lands, which is
    // the smallest component there is: without it, a template and its styles, silently unstyled.
    const scopeAttr = !shadowStyles && styleBlocks(descriptor).some(b => b.scoped)
        ? `ctx.el.setAttribute('data-pdx-${hash(filename)}', '');` : '';
    // The frame's lines point at their blocks when the caller builds a source map.
    const frameMark = (block?: { start: number } | null) => (ctx.mapOrigins && block ? originMark(block.start) : '');
    if (setupBody || scopeAttr || shadowStyles) {
        code += `  ${frameMark(descriptor.script)}setup(ctx) {\n`;
        if (shadowStyles) code += `${shadowStyles}\n`;
        if (scopeAttr) code += `    ${scopeAttr}\n`;
        if (setupBody) code += `    ${indent(setupBody, 4)}\n`;
        code += `  },\n`;
    }
    if (isStaticRender) {
        code += `  static: true,\n`;
        const staticContent = renderCode.slice(5, -1);
        code += `  ${frameMark(descriptor.template)}render: () => __staticHTML(\`${staticContent}\`),\n`;
    } else {
        code += `  ${frameMark(descriptor.template)}render: (ctx) => ${renderCode},\n`;
    }
    code += `});\n`;

    return code;
}

// ─── Legacy Script Extraction ──────────────────────────────────────

interface LegacyScriptParts {
    imports: string;
    coreImportNames: string[];
    props: string | null;
    body: string;
}

/**
 * Extract defineProps, defineEmits, imports, and remaining body from legacy-mode script.
 * Used only for backward compatibility with the old defineProps/return syntax.
 */
function extractLegacyScript(script: string): LegacyScriptParts {
    const lines = script.split('\n');
    const importLines: string[] = [];
    const bodyLines: string[] = [];
    const coreImportNames: string[] = [];

    for (const line of lines) {
        if (line.trim().startsWith('import ')) {
            if (line.includes('@pdxui/core')) {
                coreImportNames.push(...coreRuntimeNames(line));
            } else {
                importLines.push(line.trim());
            }
        } else {
            bodyLines.push(line);
        }
    }

    const body = bodyLines.join('\n').trim();

    // Match: defineProps({ ... })
    const propsRegex = /(?:const\s+\w+\s*=\s*)?defineProps\s*\(\s*(\{[\s\S]*?\})\s*\)/;
    const propsMatch = propsRegex.exec(body);
    let props: string | null = null;
    let cleanBody = body;
    if (propsMatch) {
        props = propsMatch[1].trim();
        cleanBody = body.slice(0, propsMatch.index) + body.slice(propsMatch.index + propsMatch[0].length);
        cleanBody = cleanBody.replace(/^\s*;\s*$/gm, '').trim();
    }

    // Match: defineEmits() → replace with ctx.emit wrapper
    const emitsRegex = /(?:const\s+(\w+)\s*=\s*)?defineEmits\s*(?:<[^>]*>)?\s*\(\s*\)/;
    const emitsMatch = emitsRegex.exec(cleanBody);
    if (emitsMatch) {
        const emitVar = emitsMatch[1] || 'emit';
        cleanBody = cleanBody.slice(0, emitsMatch.index) + cleanBody.slice(emitsMatch.index + emitsMatch[0].length);
        cleanBody = cleanBody.replace(/^\s*;\s*$/gm, '').trim();
        cleanBody = `const ${emitVar} = (event, detail) => ctx.emit(event, detail);\n${cleanBody}`;
    }

    return { imports: importLines.join('\n'), coreImportNames, props, body: cleanBody };
}
