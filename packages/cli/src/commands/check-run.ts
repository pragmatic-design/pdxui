// The work of `pdx check`, as a function: it inspects, fixes when asked, and returns the report.
// It prints nothing and never exits — `check.ts` does the printing and the exit code, and the MCP
// server returns the same report to an agent. One implementation, two callers.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, relative, resolve } from 'path';
import {
    parseSFC, ComponentResolver,
    findRepeatedLogic, repeatedLogicWarning, findSharedLoading, sharedLoadingWarning,
    diagnosticUrl, positionWarnings, parseIgnores, exemptionFor,
} from '@pdxui/compiler';
import { scanPdxFiles } from '../manifest/scanner';
import type { ResolvedConfig } from '../config/schema';
import { inspectFile, categoryOf } from './check-inspect';
import { applyFixes, reportFix, type ReportedFix } from './check-fix';

/** How many times `--fix` applies and re-inspects one file. */
const MAX_FIX_ROUNDS = 5;

export interface CheckFinding {
    code: string;
    severity: string;
    message: string;
    hint?: string;
    fixable: boolean;
    /** 1-based position in the file, when the finding carries one. */
    line?: number;
    column?: number;
    /** What `--fix` would do, as edits into the file. */
    fix?: ReportedFix;
    /** `defect`, or `design` — a review question, reported only with `--design`. */
    category?: 'defect' | 'design';
    /** For PDX_TS: the TypeScript code (2322, …) — `--types`. */
    tsCode?: number;
}

export interface FileReport {
    file: string;
    errors: string[];
    warnings: CheckFinding[];
    /** The fixes `--fix` applied to this file; its `warnings` are what is left after them. */
    fixed: { code: string; title: string }[];
}

export interface CheckOptions {
    fix?: boolean;
    /** Minimum severity to report: error, warn, info. */
    severity?: string;
    i18n?: boolean;
    design?: boolean;
    types?: boolean;
    /** Only these files (absolute, or relative to the project); every .pdx when absent. */
    files?: string[];
}

export interface CheckResult {
    reports: FileReport[];
    /** How many .pdx files were checked. */
    checked: number;
    totalErrors: number;
    totalWarnings: number;
    totalFixed: number;
    totalIgnored: number;
    /** Seconds the --types pass took, when it ran. */
    typecheckSeconds?: number;
}

/** The report `pdx check --json` prints: every finding with its category and its explanation's URL. */
export function checkJson(result: CheckResult) {
    return {
        // Each finding names where its code is explained, and whether it is a
        // defect or a design-review question.
        files: result.reports.map((r) => ({ ...r, warnings: r.warnings.map((w) => ({ ...w, category: categoryOf(w.code), url: diagnosticUrl(w.code) })) })),
        summary: {
            total: result.checked,
            errors: result.totalErrors,
            warnings: result.totalWarnings,
            fixed: result.totalFixed,
            ignored: result.totalIgnored,
        },
    };
}

/** Check the project at `cwd`: the work of `pdx check`, without its output. */
export async function runCheck(cwd: string, resolved: ResolvedConfig, args: CheckOptions = {}): Promise<CheckResult> {
    let files = await scanPdxFiles(resolved.root);
    if (args.files && args.files.length > 0) {
        const wanted = new Set(args.files.map((f) => resolve(cwd, f).replace(/\\/g, '/').toLowerCase()));
        files = files.filter((f) => wanted.has(resolve(f).replace(/\\/g, '/').toLowerCase()));
    }

    // What tags will actually be registered: the ones @pdxui/ui exports, plus the ones the
    // project's own .pdx files declare. Without this set the unresolved-component check does
    // not run at all — see ValidateOptions. A resolver that cannot be built (no @pdxui/ui
    // installed) leaves it undefined rather than reporting every component as missing.
    let isKnownTag: ((tag: string) => boolean) | undefined;
    // The components' declared props, for the bound names compile() checks.
    let propsOf: ((tag: string) => ReadonlySet<string> | null) | undefined;
    // The tags a misspelt one may have meant.
    let knownTags: (() => Iterable<string>) | undefined;
    // Where it looked, for the unresolved-component hint.
    let searched: (() => readonly string[]) | undefined;
    // The manifest's enum values, for PDX_INVALID_ENUM_VALUE — the dev server's check.
    let enumValues: ((tag: string, prop: string) => readonly string[] | null) | undefined;
    try {
        const resolver = new ComponentResolver();
        // The component packages the PROJECT depends on, read from its package.json — the
        // cwd's, not `resolved.root`, which is `<cwd>/src` and has none.
        if (!resolver.registerUiManifest(resolved.cwd)) resolver.registerUiPackage(resolved.cwd);
        // The PROJECT root, not `resolved.root`. `resolveConfig` sets root to `<cwd>/src` when
        // that directory exists, and this method appends `src/` and `pages/` itself — so
        // passing the former would scan `<cwd>/src/src`, find nothing, and leave the resolver
        // holding only the @pdxui/ui exports: every component the project declares would be
        // reported PDX_UNRESOLVED_COMPONENT, "will not be registered", on apps where it does
        // register. The Vite plugin passes the project root here too (plugin.ts:195), so both
        // resolve the same components. The i18n dictionaries avoid the same doubled path, below.
        // The build's scan rule: src/ and pages/ plus the config's components folder.
        resolver.registerProjectComponents(resolved.cwd, [resolved.components]);
        // `knownWithoutImport`, not `resolve`. The question this diagnostic asks is "will this
        // element work?", and there are two ways for the answer to be yes with nothing to
        // import: the design system STYLES the tag (pdx-stack, pdx-row …), or another
        // @pdxui package DEFINES it — pdx-router-outlet comes from @pdxui/router. The
        // resolver draws that distinction; the narrower question would report the second
        // group as broken too.
        isKnownTag = (tag: string) => resolver.knownWithoutImport(tag);
        propsOf = (tag: string) => resolver.propsOf(tag);
        knownTags = () => resolver.tags;
        searched = () => resolver.searched;
        enumValues = (tag: string, prop: string) => resolver.enumValues(tag, prop);
    } catch { /* no resolver → the check stays silent, which is the honest default */ }

    const result: CheckResult = { reports: [], checked: files.length, totalErrors: 0, totalWarnings: 0, totalFixed: 0, totalIgnored: 0 };
    if (files.length === 0) return result;

    const severityOrder = { error: 0, warn: 1, info: 2 };
    const minLevel = severityOrder[(args.severity ?? 'warn') as keyof typeof severityOrder] ?? 1;
    const reports = result.reports;
    // Every file's source as checked, for the one rule that needs them all at once (CD-L1).
    const sources: { file: string; source: string }[] = [];

    for (const file of files) {
        const report: FileReport = { file, errors: [], warnings: [], fixed: [] };

        try {
            let source = readFileSync(file, 'utf-8');
            const descriptor = parseSFC(source);

            if (!descriptor.template) {
                sources.push({ file, source });
                report.errors.push('Missing <template> block');
                result.totalErrors++;
                reports.push(report);
                continue;
            }

            const options = { minLevel, isKnownTag, knownTags, searched, propsOf, enumValues, design: !!args.design };
            let inspected = inspectFile(source, file, options);
            // --fix: apply what can be applied, then report the file as it is AFTER — what is
            // left, re-validated, and what was fixed — so an agent does not have to run again to
            // learn what remains.
            // In rounds: a fix can uncover findings the file hid — a `${}` in a bound value stops
            // the compile, and what the compile finds appears once it is fixed. A
            // fix refused for overlapping one applied is tried again on the next round. Bounded,
            // so two fixes that undo each other cannot loop.
            if (args.fix) {
                for (let round = 0; round < MAX_FIX_ROUNDS; round++) {
                    const fixable = inspected.warnings.flatMap((w) => (w.fix ? [{ ...w, fix: w.fix }] : []));
                    const applied = applyFixes(source, fixable);
                    if (applied.applied.length === 0) break;
                    source = applied.source;
                    writeFileSync(file, source, 'utf-8');
                    report.fixed.push(...applied.applied.map((w) => ({ code: w.code, title: w.fix.title })));
                    result.totalFixed += applied.applied.length;
                    inspected = inspectFile(source, file, options);
                }
            }
            sources.push({ file, source });
            result.totalIgnored += inspected.ignored;
            report.warnings = inspected.warnings.map(({ fix, ...w }) => ({ ...w, fixable: !!fix, ...(fix ? { fix: reportFix(source, fix) } : {}) }));

            // Findings flagged severity:'error' (parse-OK but semantically invalid) must
            // fail the build like a parse error — otherwise CI passes with real errors.
            const errCount = report.warnings.filter(w => w.severity === 'error').length;
            result.totalErrors += errCount;
            result.totalWarnings += report.warnings.length - errCount;
        } catch (err) {
            report.errors.push((err as Error).message);
            result.totalErrors++;
        }

        reports.push(report);
    }

    // --types: the editor's type-check, headless. One TypeScript program for every
    // file, on the files as they are after --fix; each error is a PDX_TS finding, an error.
    // Loaded only here: TypeScript is not read by a check that does not ask for it.
    if (args.types && sources.length > 0) {
        const { typecheckPdx } = await import('@pdxui/lsp/typecheck');
        const started = performance.now();
        const byFile = typecheckPdx(resolved.cwd, sources.map(s => ({ path: s.file, content: s.source })));
        const sourceOf = new Map(sources.map(s => [s.file, s.source]));
        for (const report of reports) {
            const ignores = parseIgnores(sourceOf.get(report.file) ?? '');
            for (const e of byFile.get(report.file) ?? []) {
                const finding = { code: 'PDX_TS', severity: 'error', message: e.message, fixable: false, line: e.line, column: e.column, tsCode: e.tsCode };
                // The file's exemptions cover these too.
                if (exemptionFor(ignores, finding)) { result.totalIgnored++; continue; }
                report.warnings.push(finding);
                result.totalErrors++;
            }
        }
        result.typecheckSeconds = (performance.now() - started) / 1000;
    }

    // CD-L1: a function written alike in two pages is a composable nobody extracted.
    // A warning, so it counts only when warnings are asked for; the places are named relative to
    // where check runs, which is how a reader finds them.
    if (severityOrder.warn <= minLevel) {
        const shownAs = (file: string): string => relative(cwd, file).replace(/\\/g, '/');
        const reportOf = new Map(reports.map(rep => [shownAs(rep.file), rep]));
        const shownSources = sources.map(s => ({ file: shownAs(s.file), source: s.source }));
        const repeated = findRepeatedLogic(shownSources);
        const found = [
            ...repeated.flatMap(r => r.locations.map(at => ({ at, w: repeatedLogicWarning(r, at) }))),
            // CD-D1: a route and a route inside it loading the same endpoint.
            ...findSharedLoading(shownSources).flatMap(s => s.locations.map(at => ({ at, w: sharedLoadingWarning(s, at) }))),
        ];
        const sourceOf = new Map(shownSources.map(s => [s.file, s.source]));
        for (const { at, w } of found) {
            const report = reportOf.get(at.file);
            if (!report) continue;
            const fileSource = sourceOf.get(at.file) ?? '';
            positionWarnings(fileSource, [w]);
            // The file's exemptions cover these too. The per-file pass cannot see a cross-file
            // finding, so it calls the exemption unused: that report is withdrawn.
            const exemption = exemptionFor(parseIgnores(fileSource), w);
            if (exemption) {
                if (args.design) result.totalIgnored++;
                const unused = report.warnings.findIndex((x) => x.code === 'PDX_IGNORE_UNUSED' && x.line === exemption.line);
                if (unused >= 0) { report.warnings.splice(unused, 1); result.totalWarnings--; }
                continue;
            }
            // Both cross-file rules are review questions: `--design` reports them.
            // They are still computed without it, so an exemption for one is not called unused.
            if (!args.design && categoryOf(w.code) === 'design') continue;
            report.warnings.push({ code: w.code, severity: w.severity, message: w.message, hint: w.hint, fixable: false, line: w.line, column: w.column });
            result.totalWarnings++;
        }
    }

    // i18n cross-locale validation
    if (args.i18n) {
        for (const r of checkI18nKeys(resolved.root)) {
            reports.push({
                file: r.file,
                errors: [],
                warnings: r.missingKeys.map(k => ({
                    code: 'PDX_I18N_MISSING_KEY',
                    severity: 'warn',
                    message: `Translation key "${k.key}" missing in locale "${k.locale}"`,
                    fixable: false,
                })),
                fixed: [],
            });
            result.totalWarnings += r.missingKeys.length;
        }
    }

    return result;
}

// ─── i18n Cross-Locale Check ────────────────────────────────────────

interface I18nMissingKey { key: string; locale: string; }
interface I18nFileReport { file: string; missingKeys: I18nMissingKey[]; }

export function checkI18nKeys(root: string): I18nFileReport[] {
    // `root` is already the project source root (cwd/src by convention), so translations
    // live at <root>/translations — NOT <root>/src/translations (that would double the `src`).
    const translationsDir = join(root, 'translations');
    if (!existsSync(translationsDir)) return [];

    const files = readdirSync(translationsDir).filter(f => f.endsWith('.json'));
    if (files.length < 2) return [];

    // Load all locale keys
    const localeKeys = new Map<string, Set<string>>();
    for (const file of files) {
        const locale = basename(file, '.json');
        try {
            const content = JSON.parse(readFileSync(join(translationsDir, file), 'utf-8'));
            const keys = flattenKeys(content);
            localeKeys.set(locale, new Set(keys));
        } catch { /* malformed JSON */ }
    }

    // Find union of all keys
    const allKeys = new Set<string>();
    for (const keys of localeKeys.values()) {
        for (const k of keys) allKeys.add(k);
    }

    // Find missing keys per locale
    const reports: I18nFileReport[] = [];
    for (const [locale, keys] of localeKeys) {
        const missingKeys: I18nMissingKey[] = [];
        for (const k of allKeys) {
            if (!keys.has(k)) missingKeys.push({ key: k, locale });
        }
        if (missingKeys.length > 0) {
            reports.push({ file: join(translationsDir, `${locale}.json`), missingKeys });
        }
    }
    return reports;
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys;
}
