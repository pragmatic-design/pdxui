// Compiler Bridge — error-safe wrappers around @pdxui/compiler APIs.
// The LSP must never crash on malformed input; these wrappers catch errors.

// Import from @pdxui/compiler — resolved via esbuild alias to source
import { parseSFC, parseTemplate, templateStartInFile, analyzeScript, validate, compile, positionWarnings, applyIgnores } from '@pdxui/compiler';
import type { SFCDescriptor, TemplateNode, ScriptAnalysis, ValidationWarning } from '@pdxui/compiler';

export interface AnalysisResult {
    descriptor: SFCDescriptor | null;
    ast: TemplateNode[];
    analysis: ScriptAnalysis | null;
    warnings: ValidationWarning[];
}

export interface AnalyzeOptions {
    /** The props a component declares, for the bound names compile() checks. */
    propsOf?: (tag: string) => ReadonlySet<string> | null;
    /** The allowed values of enum props, for PDX_INVALID_ENUM_VALUE. */
    enumValues?: (tag: string, prop: string) => readonly string[] | null;
}

/** Parse and analyze a .pdx source string. Never throws. */
export function analyzeDocument(source: string, filename: string, options?: AnalyzeOptions): AnalysisResult {
    const result: AnalysisResult = {
        descriptor: null,
        ast: [],
        analysis: null,
        warnings: [],
    };

    try {
        result.descriptor = parseSFC(source);
    } catch {
        return result;
    }

    if (result.descriptor.template) {
        try {
            result.ast = parseTemplate(result.descriptor.template.content, 1);
        } catch { /* malformed template */ }
    }

    if (result.descriptor.script) {
        try {
            result.analysis = analyzeScript(result.descriptor.script.content, filename, { setup: result.descriptor.script.setup });
            result.warnings.push(...result.analysis.warnings);
        } catch { /* malformed script */ }
    }

    if (result.analysis && result.ast.length > 0 && result.descriptor.template) {
        try {
            // `result.ast` counts lines from the template, and the editor's other features read it
            // that way. validate() gets its own parse, counted from the file, so its findings carry
            // file positions — PDX_RAW_INTERPOLATION_IN_BINDING above all, which compile() throws on
            // and so never returns.
            const template = result.descriptor.template;
            // The column too, for a template that starts on the `<template>` line.
            const start = templateStartInFile(source, template);
            const fileAst = parseTemplate(template.content, start.line, undefined, start.column);
            result.warnings.push(...validate(result.analysis, fileAst, filename, { enumValues: options?.enumValues }));
        } catch { /* validation error */ }
    }

    // What the compiler finds while GENERATING code (PDX_UNKNOWN_PROP, PDX_PROP_NAME_CASE,
    // PDX_REWRITE_FALLBACK): validate() never sees it, and without this the editor would show
    // nothing where `vite dev` warns. compile() returns the analyzer's and validate()'s warnings too, in
    // file positions: those replace the ones listed above, and the rest are added.
    if (result.descriptor.template) {
        try {
            const listed = new Map(result.warnings.map((w, i) => [`${w.code}: ${w.message}`, i]));
            for (const w of compile(source, filename, [], undefined, { propsOf: options?.propsOf, enumValues: options?.enumValues, applyIgnores: false }).warnings) {
                const key = `${w.code}: ${w.message}`;
                const at = listed.get(key);
                if (at !== undefined) { result.warnings[at] = w; continue; }
                listed.set(key, result.warnings.length);
                result.warnings.push(w);
            }
        } catch { /* a document the compiler cannot build (an external src=, a half-typed block) keeps the warnings above */ }
    }

    // parseSFC(source) succeeded above, so placing them cannot throw on it.
    positionWarnings(source, result.warnings, result.analysis?.body);
    // The file's `pdx-ignore` exemptions, once over everything. Unused ones are
    // `pdx check`'s to report: the editor does not run the design heuristics an exemption may be for.
    result.warnings = applyIgnores(source, result.warnings).warnings;

    return result;
}
