// CSS scoped style generation — handles pseudo-selectors, @media, @keyframes.
// Extracted from codegen.ts for maintainability.

import type { SFCDescriptor, SFCStyle } from '../parser/sfc';
import { jsQuote, jsString } from './js-literal';

// ─── Public ────────────────────────────────────────────────────────

/** Every style block of a descriptor, tolerating one built before `styles` existed. */
export function styleBlocks(descriptor: SFCDescriptor): SFCStyle[] {
    if (descriptor.styles) return descriptor.styles;
    return descriptor.style ? [descriptor.style] : [];
}

/**
 * Generate the style injection code from an SFC descriptor — one `<style>` element per block.
 *
 * A file may carry several: typically one `scoped`, for the component, and one plain, for the
 * page-level CSS that component owns. Each gets its own element id, or the second would overwrite
 * the first on every HMR pass.
 */
export function generateStyles(descriptor: SFCDescriptor, filename: string, production = false): string {
    const blocks = styleBlocks(descriptor);
    if (blocks.length === 0) return '';
    // A shadow component's CSS does not belong in the head — see generateShadowStyles.
    if (descriptor.template?.shadow) return '';

    // PRODUCTION: an import, so the bundler extracts it like any other stylesheet.
    //
    // The injection below ships the CSS as a STRING inside the JS bundle and writes it to the head
    // at module-evaluation time. That is a CSS string parsed by the JS engine, a DOM write on the
    // main thread before anything renders, styles that arrive after the markup they belong to, and
    // — with routes chunked — a route's CSS travelling in its JS chunk instead of
    // in a stylesheet the browser could have fetched in parallel. The Dual Mode table in
    // docs/architecture/framework.md promises "CSS extracted, zero JS overhead", and this is what
    // makes it true.
    //
    // Dev keeps the injection, deliberately: it is what makes HMR of a `<style scoped>` block
    // instant, and dev has no bundle to extract into.
    if (production) {
        return blocks.map((_, index) => `import ${jsQuote(styleModuleId(filename, index))};\n`).join('') + '\n';
    }

    return blocks.map((block, index) => {
        // Normalise line endings FIRST. The .pdx source is read verbatim, so on a CRLF
        // checkout (git core.autocrlf=true on Windows) the emitted style string carried
        // literal \r\n — making the compiled output, and therefore the golden snapshots,
        // differ between machines. CSS is line-ending agnostic; the emitted code should be too.
        const content = block.content.replace(/\r\n/g, '\n');
        // The first block keeps the bare hash, so a single-block file emits exactly what it always
        // did and the golden snapshots do not move.
        const id = index === 0 ? hash(filename) : `${hash(filename)}-${index}`;

        let css = block.scoped ? scopeStyles(content, `data-pdx-${hash(filename)}`) : content.trim();
        if (production) css = minifyCSS(css);
        return styleInjection(css, id);
    }).join('');
}

/** The prefix of every style module id, so the plugin and this file agree on one spelling. */
export const STYLE_MODULE_PREFIX = 'virtual:pdx-style/';

/**
 * The virtual module id a production build imports for one style block.
 *
 * `.css` at the end is not decoration: it is how Vite decides to run its CSS pipeline on what
 * `load` returns. The source path is carried base64-encoded so a Windows path, a space or a query
 * character cannot break the id, and the block index because a file may have several blocks.
 *
 * The path is encoded **verbatim**, separators and all. Normalising the backslashes of a Windows
 * path on the way in looks tidier, and is wrong: the scope attribute is
 * `hash(filename)` of the path the compiler was called with, so a normalised path would hash
 * differently and the emitted stylesheet would carry a scope no element on the page has — styles
 * silently not applying, on Windows only.
 */
export function styleModuleId(filename: string, index: number): string {
    return `${STYLE_MODULE_PREFIX}${Buffer.from(filename, 'utf8').toString('base64url')}-${index}.css`;
}

/** The file and block index inside a style module id — the exact inverse of `styleModuleId`. */
export function parseStyleModuleId(id: string): { file: string; index: number } | null {
    if (!id.startsWith(STYLE_MODULE_PREFIX)) return null;
    const spec = id.slice(STYLE_MODULE_PREFIX.length).replace(/\.css$/, '');
    const at = spec.lastIndexOf('-');
    if (at <= 0) return null;
    const index = Number(spec.slice(at + 1));
    if (!Number.isInteger(index) || index < 0) return null;
    return { file: Buffer.from(spec.slice(0, at), 'base64url').toString('utf8'), index };
}

/** The CSS one style block contributes — scoped and, in production, minified. */
export function styleCssFor(descriptor: SFCDescriptor, filename: string, index: number, production: boolean): string {
    const block = styleBlocks(descriptor)[index];
    if (!block) return '';
    // Line endings first: see the note in generateStyles.
    const content = block.content.replace(/\r\n/g, '\n');
    const css = block.scoped ? scopeStyles(content, `data-pdx-${hash(filename)}`) : content.trim();
    return production ? minifyCSS(css) : css;
}

/**
 * The setup-time call that puts a `<template shadow>` component's CSS inside its own root.
 *
 * A document stylesheet does not cross a shadow boundary, so the head injection the light-DOM path
 * uses leaves a shadow component unstyled — every piece correct, the combination impossible.
 * Returns '' for a light-DOM component, which keeps the head path untouched.
 *
 * The selectors are NOT scoped here, and `scoped` is therefore redundant under `shadow`: the root
 * is the scope already, nothing inside it can be reached from outside, and a host attribute would
 * select nothing extra.
 */
export function generateShadowStyles(descriptor: SFCDescriptor, filename: string, production = false): string {
    if (!descriptor.template?.shadow) return '';
    const blocks = styleBlocks(descriptor);
    if (blocks.length === 0) return '';

    let css = blocks.map(b => transformCssFunctions(b.content.replace(/\r\n/g, '\n'), `data-pdx-${hash(filename)}`)).join('\n').trim();
    if (!css) return '';
    if (production) css = minifyCSS(css);
    return `    __adoptStyles(ctx.el.shadowRoot, ${jsString(css)}, ${jsString(hash(filename))});`;
}

/**
 * Emit a <style> injection with a stable per-component id. On HMR re-execution the
 * previous style for the same component is replaced (not appended) — otherwise each
 * update accumulates a new <style>, leaking styles into the document head.
 */
function styleInjection(css: string, id: string): string {
    const styleId = `pdx-s-${id}`;
    return `{\n` +
        `  let __pdx_style = document.getElementById(${jsString(styleId)});\n` +
        `  if (!__pdx_style) { __pdx_style = document.createElement('style'); __pdx_style.id = ${jsString(styleId)}; document.head.appendChild(__pdx_style); }\n` +
        `  __pdx_style.textContent = ${jsString(css)};\n` +
        `}\n\n`;
}

/**
 * Minify CSS for production builds.
 * Strips comments, collapses whitespace, removes unnecessary semicolons.
 *
 * A space is only removed where CSS does not read it. One rule for every syntax
 * character would be wrong twice: `calc(a + b)` needs the spaces around its operator, and in a selector
 * the space before a `:` is the descendant combinator (`.list :hover` is not `.list:hover`). So a
 * PRELUDE (the text before `{`) is tightened around its combinators, and a DECLARATION around its
 * property's colon and its commas. Quoted strings are left exactly as written.
 */
export function minifyCSS(css: string): string {
    const strings: string[] = [];
    const text = css
        .replace(/\/\*[\s\S]*?\*\//g, '')                                   // strip comments
        // Match: a double- or single-quoted string, escapes included — kept aside, verbatim.
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (s) => `__PDX_CSS_STR${strings.push(s) - 1}__`)
        .replace(/\s+/g, ' ');                                              // collapse whitespace

    // Groups alternate: [text, delimiter, text, delimiter, …, text]; the delimiter says what the text was.
    const parts = text.split(/([{};])/);
    let out = '';
    for (let i = 0; i < parts.length; i += 2) {
        const delimiter = parts[i + 1] ?? '';
        out += (delimiter === '{' ? tightenPrelude(parts[i]) : tightenDeclaration(parts[i])) + delimiter;
    }
    return out
        .replace(/;}/g, '}')                                                // remove last ; before }
        .replace(/__PDX_CSS_STR(\d+)__/g, (_, n: string) => strings[Number(n)]);
}

/** A selector or an at-rule prelude: combinators and commas lose their spaces; a space before `:` is kept. */
function tightenPrelude(prelude: string): string {
    return prelude.trim()
        .replace(/\s*([>+~,])\s*/g, '$1')
        .replace(/:\s+/g, ':');   // `(min-width: 600px)` → `(min-width:600px)`
}

/** A declaration: the property's colon and the commas lose their spaces; operators in the value keep them. */
function tightenDeclaration(declaration: string): string {
    return declaration.trim()
        // Match: the property up to its first colon. Groups: [1]=property
        .replace(/^([^:]*?)\s*:\s*/, '$1:')
        .replace(/\s*,\s*/g, ',');
}

// ─── CSS Scoping ───────────────────────────────────────────────────

/**
 * Scope all CSS selectors with [data-pdx-HASH] attribute.
 * Steps: strip comments → transform responsive() → transform bind() → recursively process blocks → insert scope attr.
 */
function scopeStyles(css: string, scopeId: string): string {
    return scopeBlock(transformCssFunctions(css, scopeId), scopeId);
}

/**
 * The compile-time CSS transforms, without the scoping: comments out, `responsive()` to `clamp()`,
 * `bind()` to a custom property. Shared with the shadow path, which wants all of them and none of
 * the scoping.
 */
function transformCssFunctions(css: string, scopeId: string): string {
    css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip CSS comments
    css = transformResponsiveCSS(css); // responsive(min, max) → clamp()
    return transformBindCSS(css, scopeId); // bind(signal) → var(--pdx-HASH-signal)
}

/**
 * Detect bind(signalName) usages in the CSS and return the list of bound signal names.
 * Used by codegen to generate the effect that sets CSS custom properties.
 */
export function extractCSSBindings(css: string, _scopeId: string): string[] {
    const bindings: string[] = [];
    const re = /bind\(\s*(\w+)\s*\)/g;
    let match;
    while ((match = re.exec(css)) !== null) {
        if (!bindings.includes(match[1])) bindings.push(match[1]);
    }
    return bindings;
}

/**
 * Transform `bind(signalName)` in CSS to `var(--pdx-HASH-signalName)`.
 * The actual value is set at runtime via el.style.setProperty() in a single batched effect.
 * This is a compile-time transform — the CSS is fully static.
 *
 * bind(bgColor)  → var(--pdx-a1b2c3-bgColor)
 * bind(angle)    → var(--pdx-a1b2c3-angle)
 */
function transformBindCSS(css: string, scopeId: string): string {
    // scopeId is 'data-pdx-HASH' — extract just the hash part
    const hashPart = scopeId.replace('data-pdx-', '');
    return css.replace(
        /bind\(\s*(\w+)\s*\)/g,
        (_match, signalName) => `var(--pdx-${hashPart}-${signalName})`
    );
}

/**
 * Transform `responsive(min, max)` CSS function calls into `clamp()`.
 * Supports optional viewport range: `responsive(min, max, vMin, vMax)`.
 *
 * responsive(16px, 64px)           → clamp(16px, calc(16px + 48 * ((100vw - 320px) / 1600)), 64px)
 * responsive(14px, 18px, 480, 1200) → clamp(14px, calc(14px + 4 * ((100vw - 480px) / 720)), 18px)
 *
 * This is a compile-time transform — zero runtime cost.
 */
function transformResponsiveCSS(css: string): string {
    // Match: responsive(min_value unit, max_value unit [, viewportMin, viewportMax])
    // Support negative values with optional minus sign
    return css.replace(
        /responsive\(\s*(-?[\d.]+)(px|rem|em)\s*,\s*(-?[\d.]+)\2\s*(?:,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+))?\s*\)/g,
        (_match, minStr, unit, maxStr, vMinStr, vMaxStr) => {
            const min = parseFloat(minStr);
            const max = parseFloat(maxStr);
            const vMin = vMinStr ? parseFloat(vMinStr) : 320;
            const vMax = vMaxStr ? parseFloat(vMaxStr) : 1920;
            const delta = max - min;
            const vDelta = vMax - vMin;
            return `clamp(${min}${unit}, calc(${min}${unit} + ${delta} * ((100vw - ${vMin}px) / ${vDelta})), ${max}${unit})`;
        }
    );
}

/**
 * Process a CSS block recursively. Handles:
 * - Regular rules: .btn { ... } → .btn[scope] { ... }
 * - @media/@supports/@layer: recurse into inner selectors
 * - @keyframes/@font-face: pass through WITHOUT scoping (names aren't selectors)
 * - Pseudo-selectors: insert scope BEFORE pseudo (.btn:hover → .btn[scope]:hover)
 */
function scopeBlock(css: string, scopeId: string): string {
    let result = '';
    let pos = 0;

    while (pos < css.length) {
        while (pos < css.length && /\s/.test(css[pos])) result += css[pos++];
        if (pos >= css.length) break;

        if (css[pos] === '@') {
            const atEnd = css.indexOf('{', pos);
            if (atEnd === -1) { result += css.slice(pos); break; }

            const atRule = css.slice(pos, atEnd).trim();
            const blockEnd = findCSSBlockEnd(css, atEnd);
            const blockContent = css.slice(atEnd + 1, blockEnd);

            if (atRule.startsWith('@keyframes') || atRule.startsWith('@font-face')) {
                result += atRule + ' {' + blockContent + '}';
            } else if (atRule.startsWith('@media') || atRule.startsWith('@supports') || atRule.startsWith('@layer')) {
                result += atRule + ' {' + scopeBlock(blockContent, scopeId) + '}';
            } else {
                result += atRule + ' {' + blockContent + '}';
            }
            pos = blockEnd + 1;
            continue;
        }

        const braceIdx = css.indexOf('{', pos);
        if (braceIdx === -1) { result += css.slice(pos); break; }

        const selector = css.slice(pos, braceIdx);
        const blockEnd = findCSSBlockEnd(css, braceIdx);
        const properties = css.slice(braceIdx + 1, blockEnd);

        const scopedSelector = selector
            .split(',')
            .map(s => scopeSelector(s.trim(), scopeId))
            .join(', ');

        result += scopedSelector + ' {' + properties + '}';
        pos = blockEnd + 1;
    }

    return result;
}

/**
 * Scope a CSS selector by prepending the host attribute as ancestor.
 * .btn:hover → [data-pdx-HASH] .btn:hover
 *
 * Light DOM approach: only the host element has [data-pdx-HASH],
 * all descendants are matched via descendant combinator.
 * This avoids needing to set the attribute on every rendered element.
 */
function scopeSelector(sel: string, scopeId: string): string {
    if (!sel) return sel;
    return `[${scopeId}] ${sel}`;
}

/** Find the closing } of a CSS block, tracking brace depth. */
function findCSSBlockEnd(css: string, openBrace: number): number {
    let depth = 0;
    for (let i = openBrace; i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return css.length - 1;
}

/**
 * Simple string hash (djb2 variant) for generating short scope IDs.
 * Produces 6-character base36 string. Collision risk is acceptable
 * since scope IDs only need to be unique within a single project.
 */
export function hash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36).slice(0, 6);
}
