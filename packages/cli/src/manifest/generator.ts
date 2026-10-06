// Manifest generator — analyzes .pdx files and produces ComponentManifest.

import { readFileSync } from 'fs';
import { relative } from 'pathe';
import { parseSFC, parseTemplate, analyzeScript, findComponentTags, deriveTag } from '@pdxui/compiler';
import type { ComponentManifest, RouteManifest, FetchManifest, FormManifest, ComponentMetadata } from './schema';

/**
 * Analyze a single .pdx file and produce its component manifest.
 * Uses the compiler's parseSFC + analyzeScript + parseTemplate + findComponentTags.
 */
export function analyzeComponent(filePath: string, rootDir: string): ComponentManifest {
    const source = readFileSync(filePath, 'utf-8');
    const descriptor = parseSFC(source);

    const scriptContent = descriptor.script?.content ?? '';
    const analysis = analyzeScript(scriptContent, filePath, { setup: descriptor.script?.setup });
    // The tag the compiler registers: `@tag`, else its filename rule — not a copy of it.
    const tag = analysis.customTag ?? deriveTag(filePath);

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
        events: analysis.events.map(e => ({
            name: e.name,
            payloadType: e.payloadType,
        })),
        slots: analysis.slots.map(s => ({
            name: s.name,
            scoped: !!s.scopeType,
            scopeType: s.scopeType,
        })),
        exposes: analysis.exposes,
        signals: analysis.signals.map(s => s.name),
        stores: analysis.stores.map(s => s.name),
        dependencies: deps,
        features: Array.from(analysis.usedFeatures),
        fetches: fetches.length > 0 ? fetches : undefined,
        forms: forms.length > 0 ? forms : undefined,
        metadata,
    };
}
