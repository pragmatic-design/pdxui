// @pdxui/compiler — Vite plugin for .pdx Single File Components

export { pdx, compile } from './plugin';
export type { PdxPluginOptions, CompileResult, CompileOptions } from './plugin';
export { generateDts } from './compiler/dts-generator';
export { SourceMapBuilder } from './compiler/sourcemap';
export type { SourceMapJSON } from './compiler/sourcemap';

// Re-export parser/compiler for advanced use
export { parseSFC } from './parser/sfc';
export type { SFCDescriptor, SFCBlock, SFCScript, SFCStyle } from './parser/sfc';

export { parseTemplate, templateStartInFile } from './parser/template';
export type {
    TemplateNode, HtmlNode, InterpolationNode,
    IfNode, ForNode, SwitchNode, RequireNode, TransitionConfig,
} from './parser/template';

export { compileSFC } from './compiler/codegen';
/** The filename → custom element tag rule. The one rule: the CLI and the LSP call it. */
export { deriveTag } from './compiler/codegen-shared';
export { analyzeScript, inlineFormFields } from './compiler/script-analyzer';
export type {
    ScriptAnalysis, PropInfo, EventInfo, SlotInfo, FormFieldDecl,
    SignalDecl, DerivedDecl, StoreDecl, WatchDecl, ExportDecl,
    RouteInfo,
} from './compiler/script-analyzer';
export { minifyHTML } from './compiler/minify';
export { findComponentTags, generateComponentImports } from './compiler/resolve';
export { ComponentResolver } from './component-resolver';
export { componentPackages } from './component-packages';
export { RUNES, DECORATOR_RUNES } from './compiler/runes';
/** The one reading of an `@fetch` line: the LSP types the resource from its `as Type`. */
export { parseFetchDecl } from './compiler/script-analyzer-helpers';
export type { RuneInfo } from './compiler/runes';
export type { ComponentPackage } from './component-packages';
export type { ComponentEntry } from './component-resolver';

// Validation
export { validate, collectTemplateIdentifiers } from './compiler/validate';
export type { ValidationWarning, DiagnosticSeverity, FixProposal, FixEdit } from './compiler/validate';
export { proposeFixes } from './compiler/fix-proposals';
export { applyIgnores, parseIgnores, exemptionFor } from './compiler/ignores';
export { positionWarnings } from './compiler/position-warnings';
// What every PDX_* code means, and where it is explained.
export { DIAGNOSTICS, diagnosticUrl, explainDiagnostic } from './diagnostics/catalog';
export type { DiagnosticEntry, DiagnosticCategory } from './diagnostics/catalog';
// CD-L1, across files — `pdx check` runs it over the whole app
export { findRepeatedLogic, repeatedLogicWarning } from './compiler/repeated-logic';
export type { RepeatedLogic } from './compiler/repeated-logic';
// The heuristic rules, per file and CD-D1 across files — `pdx check` only
export { designHeuristics } from './compiler/design-heuristics';
export { findSharedLoading, sharedLoadingWarning } from './compiler/shared-loading';
export type { SharedLoading } from './compiler/shared-loading';

// Tokenizer utilities — mask strings/comments while preserving offsets (used by
// tooling like the LSP for offset-stable identifier matching in the script block).
export { maskNonCode, skipNonCode } from './compiler/tokenizer';

// Form binding — register custom form controls for compiler auto-wiring
export { registerCompilerFormControl } from './compiler/codegen-form-binding';

// Plugin system
export { PluginRunner } from './plugin-system';
export type { CompilerPlugin, PluginContext } from './plugin-system';
