// Manifest generator — analyzes .pdx files and produces ComponentManifest.

import { readFileSync } from 'fs';
import { relative } from 'pathe';
import { parseSFC, parseTemplate, analyzeScript, findComponentTags, deriveTag, importedLocalNames, modelEventName, DEFAULT_TAG_PREFIX } from '@pdxui/compiler';
import type { ComponentManifest, RouteManifest, FetchManifest, FormManifest, ComponentMetadata } from './schema';
import { typeToSchema } from './type-schema';

/** The specifier of the import that binds `name`, among the script's import statements; '' when none does. */
function importedFrom(imports: string[], name: string): string {
    for (const stmt of imports) {
        if (!importedLocalNames(stmt).includes(name)) continue;
        // Groups: [1]=the specifier
        const m = /\bfrom\s*['"]([^'"]+)['"]/.exec(stmt);
        if (m) return m[1];
    }
    return '';
}

/**
 * Analyze a single .pdx file and produce its component manifest.
 * Uses the compiler's parseSFC + analyzeScript + parseTemplate + findComponentTags.
 */
export function analyzeComponent(filePath: string, rootDir: string, prefix: string = DEFAULT_TAG_PREFIX): ComponentManifest {
    const source = readFileSync(filePath, 'utf-8');
    const descriptor = parseSFC(source);

    const scriptContent = descriptor.script?.content ?? '';
    const analysis = analyzeScript(scriptContent, filePath);
    // The tag the compiler registers: `@tag`, else its filename rule with the app's prefix — not a copy of it.
    const tag = analysis.customTag ?? deriveTag(filePath, prefix);

    const templateContent = descriptor.template?.content ?? '';
    const ast = parseTemplate(templateContent);
    const deps = findComponentTags(ast);

    // Extract route info if @page is declared
    const routeInfo = analysis.route?.page ? {
        path: analysis.route.page,
        file: relative(rootDir, filePath),
        tag,
        guard: analysis.route.guard,
        loader: analysis.route.loader,
        search: analysis.route.search,
        prefetch: analysis.route.prefetch,
        layout: analysis.route.layout,
        lazy: true,
    } as RouteManifest : undefined;

    // Extract fetch endpoints
    const fetches: FetchManifest[] = analysis.fetches.map(f => ({
        name: f.name,
        method: f.method,
        url: f.url,
        type: f.type,
        reactive: f.hasReactiveParams,
    }));

    // Extract form declarations
    const forms: FormManifest[] = analysis.forms.map(f => ({
        name: f.name,
        kind: f.kind,
        schemaRef: f.schemaExpr,
        fields: f.fields?.map(fd => ({
            name: fd.name,
            type: fd.type,
            required: fd.required,
            rules: fd.rules,
        })),
    }));

    const agentActions = (analysis.actions ?? []).flatMap(a => a.agent === undefined ? [] : [{
        name: a.name, agent: a.agent, consequential: a.consequential, input: typeToSchema(a.inputType),
    }]);

    // Compute metadata
    const metadata: ComponentMetadata = {
        category: analysis.route?.page ? 'page' : undefined,
        signalCount: analysis.signals.length,
        effectCount: analysis.effects.length,
    };

    return {
        tag,
        file: relative(rootDir, filePath),
        route: routeInfo,
        props: analysis.props.map(p => ({
            name: p.name,
            type: p.tsType,
            default: p.default,
            required: p.default === undefined,
        })),
        // A model's `<name>-change` (#124) is an event of the component like any it declares.
        events: [
            ...analysis.events.map(e => ({ name: e.name, payloadType: e.payloadType })),
            ...analysis.props.filter(p => p.model).map(p => ({ name: modelEventName(p.name), payloadType: `{ value: ${p.tsType} }` })),
        ],
        ...(analysis.props.some(p => p.model) ? { models: analysis.props.filter(p => p.model).map(p => p.name) } : {}),
        slots: analysis.slots.map(s => ({
            name: s.name,
            scoped: !!s.scopeType,
            scopeType: s.scopeType,
        })),
        exposes: analysis.exposes,
        // The tokens of @provide / @inject, which the compiler accepts only when imported (#496).
        provides: analysis.provides.map(p => ({ token: p.token, from: importedFrom(analysis.userImports, p.token) })),
        injects: analysis.injects.map(i => ({ token: i.token, from: importedFrom(analysis.userImports, i.token), optional: i.fallback !== undefined })),
        // The @action an agent may call (#502): recorded only, for the WebMCP adapter.
        ...(agentActions.length > 0 ? { actions: agentActions } : {}),
        signals: analysis.signals.map(s => s.name),
        stores: analysis.stores.map(s => s.name),
        dependencies: deps,
        features: Array.from(analysis.usedFeatures),
        fetches: fetches.length > 0 ? fetches : undefined,
        forms: forms.length > 0 ? forms : undefined,
        metadata,
    };
}
