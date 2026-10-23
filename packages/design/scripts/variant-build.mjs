// `@variant` in @pdxui/design (#512, specified by #626 — docs/language/styles.md, "In the library").
//
// A library component declares its variant axes in its descriptor, and `packages/ui/custom-elements.json`
// lists them. The rules that style them are written as `@variant`, in two places:
//   - variant-sources/<path>.css, which gen-variants.mjs compiles into src/<path>.css. In a component's
//     own stylesheet, variant-sources/components/<name>.css, the tag pdx-<name> is implied;
//   - theme-sources/<name>.css, inside `@pdx-theme`, which gen-themes.mjs compiles before the theme guard.
// Both compile with the transform the compiler gives a .pdx, in its library form, and both check the
// rules against the manifest first: a rule naming a tag, an axis or a value the manifest does not declare
// is PDX_VARIANT_UNKNOWN and the generator writes nothing; a declared value no rule styles is
// PDX_VARIANT_UNSTYLED, reported.
//
// The output is COMMITTED, as the themes are: src/ reaches the browser as written (the package's
// `development` export), so an `@variant` left in it would be dropped by the browser.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandLibraryVariants, libraryVariantTests } from '../../compiler/src/compiler/variant-css.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const DESIGN = join(here, '..');
export const VARIANT_SOURCES = join(DESIGN, 'variant-sources');
export const THEME_SOURCES = join(DESIGN, 'theme-sources');
export const MANIFEST = join(DESIGN, '..', 'ui', 'custom-elements.json');

/** Every custom element of the manifest → the variant axes it declares (`[]` for none). */
export function manifestAxes(manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))) {
    const axes = new Map();
    for (const mod of manifest.modules ?? []) {
        for (const decl of mod.declarations ?? []) {
            if (decl.customElement && decl.tagName) axes.set(decl.tagName, decl.variants ?? []);
        }
    }
    return axes;
}

/** The tag a variant source implies: `components/<name>.css` → `pdx-<name>`, when that is a component. */
export function impliedTagOf(rel, axes) {
    // Match: a component's own stylesheet. Groups: [1]=name
    const name = /^components\/([\w-]+)\.css$/.exec(rel)?.[1];
    return name && axes.has(`pdx-${name}`) ? `pdx-${name}` : undefined;
}

/** The variant sources, as paths relative to variant-sources/ with `/` separators. */
export function variantSources() {
    if (!existsSync(VARIANT_SOURCES)) return [];
    return readdirSync(VARIANT_SOURCES, { recursive: true })
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => f.endsWith('.css'))
        .sort();
}

/** The CSS of a source with its `@variant` rules compiled; `impliedTag` for a component's own stylesheet. */
export function expandVariants(css, impliedTag, axes) {
    return expandLibraryVariants(css, impliedTag, (tag) => axes.get(tag));
}

/** The stylesheet a variant source generates: a line that says so, then the source compiled. */
export function generatedStylesheet(source, rel, axes) {
    return `/* GENERATED from packages/design/variant-sources/${rel} by packages/design/scripts/gen-variants.mjs — edit the source, then run it. */\n`
        + expandVariants(source, impliedTagOf(rel, axes), axes);
}

/** Every file of the package that may hold `@variant` rules: the variant sources and the theme sources. */
export function packageVariantFiles(axes) {
    const sources = variantSources().map((rel) => ({
        path: `variant-sources/${rel}`, css: readFileSync(join(VARIANT_SOURCES, rel), 'utf8'), impliedTag: impliedTagOf(rel, axes),
    }));
    const themes = readdirSync(THEME_SOURCES).filter((f) => f.endsWith('.css')).sort().map((f) => ({
        path: `theme-sources/${f}`, css: readFileSync(join(THEME_SOURCES, f), 'utf8'), impliedTag: undefined,
    }));
    return [...sources, ...themes];
}

/** What is wrong with a test against the manifest, or undefined; `styled` collects what it styles. */
function unknownOf(test, axes, styled) {
    const written = `@variant ${test.tag ? `${test.tag} ` : ''}${test.axis}(${test.value})`;
    if (!test.tag) return `${written} names no tag: outside a component's own stylesheet a rule names it, @variant pdx-<name> ${test.axis}(${test.value}).`;
    const declared = axes.get(test.tag);
    if (!declared) return `${written}: '${test.tag}' is not a component of @pdxui/ui.`;
    const axis = declared.find((a) => a.name === test.axis);
    if (!axis) return `${written}: '${test.axis}' is not a variant axis of ${test.tag} (${declared.map((a) => a.name).join(', ') || 'none declared'}).`;
    if (!axis.values.includes(test.value)) return `${written}: '${test.value}' is not a value of the axis '${axis.name}' (${axis.values.join(', ')}).`;
    // A value styles every value that shares its native selector (#626).
    const native = axis.native?.[test.value];
    for (const v of axis.values) if (v === test.value || (native !== undefined && axis.native[v] === native)) styled.add(`${test.tag} ${axis.name}(${v})`);
    return undefined;
}

/**
 * PDX_VARIANT_UNKNOWN (error) and PDX_VARIANT_UNSTYLED (warn) over the files, against the manifest's
 * axes. Each file is `{ path, css, impliedTag }`. The default value is the base rules' look and is
 * never reported, nor is a value that shares the default's native selector.
 */
export function checkVariants(files, axes) {
    const diagnostics = [];
    const styled = new Set();
    for (const file of files) {
        for (const test of libraryVariantTests(file.css, file.impliedTag)) {
            const message = unknownOf(test, axes, styled);
            if (message === undefined) continue;
            const line = file.css.slice(0, test.at).split('\n').length;
            diagnostics.push({ code: 'PDX_VARIANT_UNKNOWN', severity: 'error', file: file.path, line, message });
        }
    }
    for (const [tag, declared] of axes) {
        for (const axis of declared) {
            const base = axis.native?.[axis.default];
            for (const value of axis.values) {
                if (value === axis.default || (base !== undefined && axis.native[value] === base)) continue;
                if (styled.has(`${tag} ${axis.name}(${value})`)) continue;
                diagnostics.push({
                    code: 'PDX_VARIANT_UNSTYLED', severity: 'warn', file: 'packages/ui/custom-elements.json', line: 0,
                    message: `${tag} declares ${axis.name}: ${value}, and no @variant rule of @pdxui/design styles it.`,
                });
            }
        }
    }
    return diagnostics;
}

/**
 * The check for a generator: every diagnostic printed, and whether the package may be generated —
 * not when a rule is PDX_VARIANT_UNKNOWN.
 */
export function reportVariants(axes) {
    const diagnostics = checkVariants(packageVariantFiles(axes), axes);
    for (const d of diagnostics) {
        const where = d.line ? `${d.file}:${d.line}` : d.file;
        console[d.severity === 'error' ? 'error' : 'warn'](`${where}: ${d.code}: ${d.message}`);
    }
    return diagnostics.every((d) => d.severity !== 'error');
}
