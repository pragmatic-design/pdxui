// What `pdx check` finds in one .pdx file: the analyser's, validate()'s and compile()'s findings, and
// the design heuristics, each placed in the file and carrying its fix when its code has one.
// One function, so `--fix` can run it again on the fixed file.

import { readFileSync } from 'fs';
import { dirname, resolve as resolvePath } from 'path';
import {
    parseSFC, parseTemplate, templateStartInFile, analyzeScript, validate, compile, designHeuristics, positionWarnings, applyIgnores,
    DIAGNOSTICS,
} from '@pdxui/compiler';
import type { FixProposal } from '@pdxui/compiler';

export interface InspectedWarning {
    code: string;
    severity: string;
    message: string;
    hint?: string;
    /** 1-based position in the file, when the finding carries one. */
    line?: number;
    column?: number;
    fix?: FixProposal;
}

export interface InspectOptions {
    /** The least severe level reported: error 0, warn 1, info 2. */
    minLevel: number;
    /** Report the `design` category too — `pdx check --design`. Defects only otherwise. */
    design?: boolean;
    isKnownTag?: (tag: string) => boolean;
    /** The tags a misspelt one may have meant, for its did-you-mean and rename. */
    knownTags?: () => Iterable<string>;
    /** Where components were looked for, named by PDX_UNRESOLVED_COMPONENT's hint. */
    searched?: () => readonly string[];
    propsOf?: (tag: string) => ReadonlySet<string> | null;
    /** The allowed values of enum props, for PDX_INVALID_ENUM_VALUE. */
    enumValues?: (tag: string, prop: string) => readonly string[] | null;
}

const SEVERITY_ORDER: Record<string, number> = { error: 0, warn: 1, info: 2 };

export interface InspectResult {
    warnings: InspectedWarning[];
    /** How many findings the file's `pdx-ignore` exemptions silenced. */
    ignored: number;
}

/**
 * Every finding in `source`, at or above `minLevel`, each once. A compile that throws propagates:
 * it is an error the build would hit too. The file must have a `<template>`.
 */
export function inspectFile(source: string, file: string, options: InspectOptions): InspectResult {
    const out: InspectedWarning[] = [];
    const reported = new Set<string>();
    // `everyOne`: a heuristic can say the same thing on two lines, and each is a finding.
    const add = (w: { code: string; severity?: string; message: string; hint?: string; line?: number; column?: number; fix?: FixProposal }, everyOne = false): void => {
        const key = `${w.code}: ${w.message}`;
        if (!everyOne && reported.has(key)) return;
        reported.add(key);
        // The analyzer's warnings carry a severity only where it is not the default.
        const severity = w.severity ?? 'warn';
        out.push({
            code: w.code, severity, message: w.message, hint: w.hint,
            ...(w.line !== undefined ? { line: w.line, column: w.column } : {}),
            ...(w.fix ? { fix: w.fix } : {}),
        });
    };

    const descriptor = parseSFC(source);
    // Counted from where the template starts in the file, so a template finding's line — and its
    // column on the `<template>` line — is the file's, as compile() counts it.
    const start = templateStartInFile(source, descriptor.template!);
    const ast = parseTemplate(descriptor.template!.content, start.line, undefined, start.column);
    const analysis = analyzeScript(descriptor.script?.content ?? '', file, { setup: descriptor.script?.setup });
    for (const w of positionWarnings(source, analysis.warnings, analysis.body)) add(w);

    // Cross-check template vs script
    const validated = validate(analysis, ast, file, {
        ...(options.isKnownTag ? { isKnownTag: options.isKnownTag, knownTags: options.knownTags, searched: options.searched } : {}),
        enumValues: options.enumValues,
    });
    for (const w of positionWarnings(source, validated, analysis.body)) add(w);

    // What the compiler finds while GENERATING code — a bound name the component does not declare
    // (PDX_UNKNOWN_PROP), one that matches only by case (PDX_PROP_NAME_CASE), a skipped signal
    // rewrite (PDX_REWRITE_FALLBACK). validate() never sees these, so without this pass they would
    // reach `vite dev`'s console and nothing else. compile() also returns the analyzer's and validate()'s
    // warnings: the ones already reported are not added again.
    // A `${}` in a bound value stops compile() with an error: it is reported above, with its fix,
    // and the generation findings come once it is fixed.
    if (!validated.some((w) => w.code === 'PDX_RAW_INTERPOLATION_IN_BINDING')) {
        // Exemptions are applied below, once, to everything: compile() would apply them to its part only.
        const compiled = compile(source, file, [], (src, from) => readFileSync(resolvePath(dirname(from), src), 'utf-8'), {
            propsOf: options.propsOf, enumValues: options.enumValues, applyIgnores: false,
        });
        for (const w of compiled.warnings) add(w);
    }

    // The heuristic component-design rules: questions for a review, so they are asked
    // here and never in compile(), whose warnings reach the dev server on every save.
    for (const w of positionWarnings(source, designHeuristics(source, file))) add(w, true);

    // The file's `pdx-ignore` exemptions, over every check's findings — so an exemption
    // that silences nothing can be told apart, and is reported. Before the severity filter: an
    // exemption for an `info` code is used even when `info` is not shown.
    const exempted = applyIgnores(source, out, { reportUnused: true });
    // Design-review questions are `--design`'s. Filtered after the exemptions, so an
    // exemption for one is used, not reported as unused, when they are not shown.
    const shown = (w: { code: string }): boolean => options.design || categoryOf(w.code) !== 'design';
    const warnings: InspectedWarning[] = exempted.warnings
        .filter(shown)
        .filter((w) => (SEVERITY_ORDER[w.severity] ?? 1) <= options.minLevel);
    return { warnings, ignored: exempted.silenced.filter(shown).length };
}

/** A code's category in the diagnostics catalog; a code it does not know counts as a defect. */
export function categoryOf(code: string): 'defect' | 'design' {
    return DIAGNOSTICS[code]?.category ?? 'defect';
}
