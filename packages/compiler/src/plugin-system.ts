// Compiler Plugin System — hook-based extensibility for @pdxui packages.
//
// Every satellite package (@pdxui/http, @pdxui/state, etc.) can register
// plugins that extend the compiler with custom transformations, directives, and types.
//
// Hook execution order follows plugin registration order.
// Each hook receives a PluginContext with utilities for adding imports, code, and warnings.

import type { ScriptAnalysis } from './compiler/script-analyzer';

// ─── Public Types ──────────────────────────────────────────────────

/** A compiler plugin that extends .pdx compilation with custom behavior. */
export interface CompilerPlugin {
    /** Unique plugin name (for debugging and dedup). */
    name: string;

    /** Transform the raw script content before the analyzer runs.
     *  Use for: custom rune detection, pre-processing macros. */
    transformScript?(script: string, ctx: PluginContext): string;

    /** Post-process the script analysis. Add custom metadata, detect patterns.
     *  Use for: auto-detecting @fetch patterns, registering custom state. */
    analyzeScript?(analysis: ScriptAnalysis, ctx: PluginContext): void;

    /** Transform the generated JS code before output.
     *  Use for: injecting runtime helpers, wrapping output. */
    transformOutput?(code: string, ctx: PluginContext): string;

    /** Generate additional TypeScript declarations for the .pdx.d.ts file.
     *  Use for: adding custom interfaces, augmenting component types. */
    generateTypes?(analysis: ScriptAnalysis, ctx: PluginContext): string;

    /**
     * Register custom template directives.
     * The compiler calls generate() when encountering @directiveName in templates.
     * Parse is handled automatically (expression + block pattern).
     */
    templateDirectives?: Record<string, TemplateDirectiveHandler>;
}

/** Handler for a custom template directive. */
export interface TemplateDirectiveHandler {
    /** Generate JS code for this directive usage.
     *  @param expr — the expression inside @directive (expr) { ... }
     *  @param bodyCode — the generated html`` for the body block
     *  @param imports — Set to add required imports
     *  @returns JS code string to embed in the template */
    generate(expr: string, bodyCode: string, imports: Set<string>): string;
}

/** Context passed to every plugin hook with utilities for extending the compilation. */
export interface PluginContext {
    /** Source filename being compiled. */
    filename: string;
    /** Component tag name (e.g. 'pdx-counter'). */
    tag: string;
    /** Add an import name to the generated @pdxui/core import. */
    addImport(name: string): void;
    /** Add a line of code to the setup() body. */
    addSetupCode(code: string): void;
    /** Add a user-level import statement (non-framework). */
    addUserImport(statement: string): void;
    /** Emit a compilation warning. */
    warn(message: string): void;
}

// ─── Plugin Runner ─────────────────────────────────────────────────

/**
 * Executes compiler plugins in registration order.
 * Created per-file during compilation.
 */
export class PluginRunner {
    private plugins: CompilerPlugin[];
    private ctx: PluginContext;

    /** Extra imports collected from plugins. */
    extraImports = new Set<string>();
    /** Extra setup code lines from plugins. */
    extraSetupCode: string[] = [];
    /** Extra user import statements from plugins. */
    extraUserImports: string[] = [];
    /** Warnings from plugins. */
    warnings: string[] = [];

    constructor(plugins: CompilerPlugin[], filename: string, tag: string) {
        this.plugins = plugins;
        this.ctx = {
            filename,
            tag,
            addImport: (name) => this.extraImports.add(name),
            addSetupCode: (code) => this.extraSetupCode.push(code),
            addUserImport: (stmt) => this.extraUserImports.push(stmt),
            warn: (msg) => {
                this.warnings.push(`[${this.currentPlugin}] ${msg}`);
                console.warn(`[pdx:${this.currentPlugin}] ${filename}: ${msg}`);
            },
        };
    }

    private currentPlugin = '';

    /** Run transformScript hooks — each plugin transforms the script sequentially. */
    runTransformScript(script: string): string {
        let result = script;
        for (const p of this.plugins) {
            if (p.transformScript) {
                this.currentPlugin = p.name;
                result = p.transformScript(result, this.ctx);
            }
        }
        return result;
    }

    /** Run analyzeScript hooks — plugins can augment the analysis. */
    runAnalyzeScript(analysis: ScriptAnalysis): void {
        for (const p of this.plugins) {
            if (p.analyzeScript) {
                this.currentPlugin = p.name;
                p.analyzeScript(analysis, this.ctx);
            }
        }
    }

    /** Run transformOutput hooks — each plugin transforms the final JS. */
    runTransformOutput(code: string): string {
        let result = code;
        for (const p of this.plugins) {
            if (p.transformOutput) {
                this.currentPlugin = p.name;
                result = p.transformOutput(result, this.ctx);
            }
        }
        return result;
    }

    /** Run generateTypes hooks — collect additional .d.ts content. */
    runGenerateTypes(analysis: ScriptAnalysis): string {
        const parts: string[] = [];
        for (const p of this.plugins) {
            if (p.generateTypes) {
                this.currentPlugin = p.name;
                const types = p.generateTypes(analysis, this.ctx);
                if (types) parts.push(types);
            }
        }
        return parts.join('\n');
    }

    /** Collect all custom template directives from plugins. */
    getTemplateDirectives(): Map<string, TemplateDirectiveHandler> {
        const directives = new Map<string, TemplateDirectiveHandler>();
        for (const p of this.plugins) {
            if (p.templateDirectives) {
                for (const [name, handler] of Object.entries(p.templateDirectives)) {
                    // Collision: two plugins claim the same @directive. Silent
                    // last-wins is a debugging trap — surface it.
                    if (directives.has(name)) {
                        console.warn(
                            `[pdx] Template directive "@${name}" is registered by more than one plugin. ` +
                            'The last registration wins; rename one to avoid ambiguity.',
                        );
                    }
                    directives.set(name, handler);
                }
            }
        }
        return directives;
    }

    /** Check if any plugins are registered. */
    get hasPlugins(): boolean {
        return this.plugins.length > 0;
    }
}
