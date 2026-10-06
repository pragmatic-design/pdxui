// Sanitization helpers for innerHTML — prevents XSS from user-provided content.
// Uses DOMParser + whitelist approach: only allowed tags/attrs survive.

import { sanitizeUrl, sanitizeMediaUrl } from '@pdxui/core';

const SVG_TAGS = new Set([
    'svg', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect',
    'g', 'defs', 'use', 'symbol', 'text', 'tspan', 'title', 'desc',
    'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'stop',
    'animate', 'animatetransform', 'animatemotion', 'set', 'marker', 'image',
    'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feconvolvematrix',
    'fediffuselighting', 'fedisplacementmap', 'feflood', 'fegaussianblur',
    'feimage', 'femerge', 'femergenode', 'femorphology', 'feoffset',
    'fespecularlighting', 'fetile', 'feturbulence',
]);

const SVG_ATTRS = new Set([
    'viewbox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
    'fill-opacity', 'fill-rule', 'clip-rule', 'opacity', 'd', 'points',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'width', 'height', 'transform', 'class', 'id',
    'text-anchor', 'dominant-baseline', 'font-size', 'font-family', 'font-weight',
    'letter-spacing', 'word-spacing', 'text-decoration',
    'gradientunits', 'gradienttransform', 'spreadmethod', 'offset', 'stop-color', 'stop-opacity',
    'patternunits', 'patterntransform', 'preserveaspectratio',
    'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'color-interpolation-filters',
    'stddeviation', 'in', 'in2', 'result', 'mode', 'values', 'type',
    'dx', 'dy', 'flood-color', 'flood-opacity', 'lighting-color',
    'clip-path', 'mask', 'filter', 'color', 'display', 'visibility',
    'href', 'xlink:href', 'role', 'aria-hidden', 'aria-label', 'focusable',
    'tabindex', 'data-name',
]);

const HTML_TAGS = new Set([
    'div', 'span', 'p', 'a', 'b', 'i', 'em', 'strong', 'u', 's', 'small', 'sub', 'sup',
    'mark', 'abbr', 'time', 'code', 'pre', 'kbd', 'samp', 'var',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'br', 'hr', 'wbr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'img', 'picture', 'source', 'figure', 'figcaption',
    'details', 'summary', 'blockquote', 'cite', 'q',
    'label', 'input', 'button',
    // SVG tags also allowed in HTML context
    ...SVG_TAGS,
]);

const HTML_ATTRS = new Set([
    // NB: `id` is intentionally NOT allowed in HTML context — a user-supplied id can
    // shadow a DOM property (DOM clobbering) or collide with app anchors. SVG keeps `id`
    // (via SVG_ATTRS) because gradient/clip/use references need it.
    'class', 'title', 'lang', 'dir', 'hidden', 'tabindex',
    'role', 'aria-label', 'aria-hidden', 'aria-expanded', 'aria-selected',
    'aria-disabled', 'aria-describedby', 'aria-labelledby', 'aria-live',
    'href', 'rel', 'download',
    'src', 'alt', 'width', 'height', 'loading', 'decoding',
    'type', 'value', 'placeholder', 'disabled', 'readonly', 'checked',
    'colspan', 'rowspan', 'scope', 'headers',
    'data-test', 'data-key', 'data-index',
    // SVG attrs also allowed
    ...SVG_ATTRS,
]);

const EVENT_ATTR_RE = /^on/i;
// Attributes that resolve to a URL. SMIL `to`/`from`/`values` can animate an element's
// href (`<set attributeName="xlink:href" to="javascript:…">`) → treat them as URL-bearing too.
const URL_ATTR_NAMES = new Set(['href', 'xlink:href', 'src', 'to', 'from', 'values', 'by']);
// SMIL elements that can mutate another attribute's value at runtime.
const SMIL_TAGS = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);
// The admitted elements whose `src` loads a picture: it gets core's media policy, which also takes a
// raster data:image and a blob: URL. pdx-rich-text stores every pasted image as data:image, and the
// link policy would drop it whenever HTML is loaded. Links keep the link policy.
const MEDIA_SRC_TAGS = new Set(['img', 'source']);

/** Is `value` acceptable for URL attribute `name` on element `tag`? */
function safeUrlAttr(tag: string, name: string, value: string): boolean {
    if (name === 'src' && MEDIA_SRC_TAGS.has(tag)) return sanitizeMediaUrl(value) !== null;
    return sanitizeUrl(value) !== null;
}

function stripDangerousAttrs(el: Element, allowed: Set<string>): void {
    // A SMIL animation that targets a URL attribute can smuggle a javascript: URL past the
    // per-attribute check below — drop the whole element if it animates href/xlink:href.
    const tag = el.tagName.toLowerCase();
    if (SMIL_TAGS.has(tag)) {
        const target = (el.getAttribute('attributeName') || '').toLowerCase();
        if (target === 'href' || target === 'xlink:href') {
            el.remove();
            return;
        }
    }
    // `id` is allowed (via SVG_ATTRS) only for SVG elements, which need it for internal
    // gradient/clip/use references. On HTML elements a user-supplied id is a DOM-clobbering
    // vector, so strip it there.
    const isSvg = SVG_TAGS.has(tag);
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (EVENT_ATTR_RE.test(name)) {
            el.removeAttribute(attr.name);
        } else if (name === 'id' && !isSvg) {
            el.removeAttribute(attr.name);
        } else if (!allowed.has(name)) {
            el.removeAttribute(attr.name);
        } else if (URL_ATTR_NAMES.has(name) && !safeUrlAttr(tag, name, attr.value)) {
            // sanitizeUrl rejects javascript:/data:/vbscript:, control-char-smuggled schemes
            // (`java&#9;script:`, decoded by DOMParser) and protocol-relative URLs; the media policy
            // an image src gets adds only blob: and raster data:image.
            el.removeAttribute(attr.name);
        }
    }
}

function walkAndSanitize(node: Node, allowedTags: Set<string>, allowedAttrs: Set<string>): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            const tag = el.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object'
                || tag === 'embed' || tag === 'form' || tag === 'foreignobject') {
                el.remove();
                continue;
            }
            if (!allowedTags.has(tag)) {
                // Sanitize the subtree FIRST, then promote the (now-clean) children and drop the
                // wrapper. Without this, promoted children bypass sanitization (they aren't in the
                // iterated snapshot) → e.g. <wrapper><img onerror=…></wrapper> would survive. XSS.
                walkAndSanitize(el, allowedTags, allowedAttrs);
                while (el.firstChild) node.insertBefore(el.firstChild, el);
                el.remove();
                continue;
            }
            stripDangerousAttrs(el, allowedAttrs);
            walkAndSanitize(el, allowedTags, allowedAttrs);
        }
    }
}

let _parser: DOMParser | null = null;
function getParser(): DOMParser {
    if (!_parser) _parser = new DOMParser();
    return _parser;
}

/**
 * Sanitize SVG markup — strips script tags, event handlers, foreignObject,
 * and any non-whitelisted SVG tags/attributes.
 */
export function sanitizeSVG(input: string): string {
    if (!input || !input.includes('<')) return input;
    const doc = getParser().parseFromString(input, 'text/html');
    walkAndSanitize(doc.body, SVG_TAGS, SVG_ATTRS);
    return doc.body.innerHTML;
}

/**
 * Sanitize general HTML — whitelist of safe tags and attributes.
 * Strips scripts, event handlers, iframes, embeds, forms.
 */
export function sanitizeHTML(input: string): string {
    if (!input || !input.includes('<')) return input;
    const doc = getParser().parseFromString(input, 'text/html');
    walkAndSanitize(doc.body, HTML_TAGS, HTML_ATTRS);
    return doc.body.innerHTML;
}

/**
 * Escape a string for safe insertion as text content in HTML.
 * Use when you need to embed user text inside an HTML string template.
 */
export function escapeHTML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
