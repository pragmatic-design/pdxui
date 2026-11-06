// An html`` template's static markup as a tree, for rendering to a string where there is no DOM
// (#160). The client parses a template with the browser's parser (a <template>'s innerHTML); in Node
// there is none, and the framework takes no dependency for one. A template's strings are written by
// its author, so a small scanner is enough: elements, attributes, text, comments, and the holes the
// values go in.
//
// The holes are placed exactly as the client places them (template.ts): inside a tag a value is a text
// placeholder in an attribute, in content it is a `<!--pdx-N-->` comment. Read once per template and
// cached, as the client caches its parsed template.

import { PLACEHOLDER, COMMENT_PH_PREFIX } from '../renderer/template-plan';

/** An attribute: its name, and its raw value with any placeholders in it; `null` for `<x hidden>`. */
export interface TreeAttribute { name: string; value: string | null }

export type TreeNode =
    | { kind: 'element'; name: string; attributes: TreeAttribute[]; children: TreeNode[]; void: boolean }
    | { kind: 'text'; raw: string }
    | { kind: 'comment'; raw: string }
    | { kind: 'hole'; index: number };

/** The HTML void elements: no content, no closing tag. The same set the client expands `/>` by. */
export const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
/** Elements whose content is text up to their closing tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * The HTML parser lowercases tag and attribute names, then puts back the camelCase of these inside
 * <svg> (the "adjust SVG attributes / tag name" steps of the HTML standard). The client's template is
 * parsed that way, so the tree is too: `:textContent` is bound as `:textcontent` on both sides.
 */
const SVG_TAGS = new Map(['altGlyph', 'altGlyphDef', 'altGlyphItem', 'animateColor', 'animateMotion', 'animateTransform',
    'clipPath', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
    'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
    'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
    'feSpotLight', 'feTile', 'feTurbulence', 'foreignObject', 'glyphRef', 'linearGradient', 'radialGradient', 'textPath',
].map((n) => [n.toLowerCase(), n]));
const SVG_ATTRIBUTES = new Map(['attributeName', 'attributeType', 'baseFrequency', 'baseProfile', 'calcMode', 'clipPathUnits',
    'diffuseConstant', 'edgeMode', 'filterUnits', 'glyphRef', 'gradientTransform', 'gradientUnits', 'kernelMatrix',
    'kernelUnitLength', 'keyPoints', 'keySplines', 'keyTimes', 'lengthAdjust', 'limitingConeAngle', 'markerHeight',
    'markerUnits', 'markerWidth', 'maskContentUnits', 'maskUnits', 'numOctaves', 'pathLength', 'patternContentUnits',
    'patternTransform', 'patternUnits', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio',
    'primitiveUnits', 'refX', 'refY', 'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures', 'specularConstant',
    'specularExponent', 'spreadMethod', 'startOffset', 'stdDeviation', 'stitchTiles', 'surfaceScale', 'systemLanguage',
    'tableValues', 'targetX', 'targetY', 'textLength', 'viewBox', 'viewTarget', 'xChannelSelector', 'yChannelSelector', 'zoomAndPan',
].map((n) => [n.toLowerCase(), n]));

const cache = new WeakMap<TemplateStringsArray, TreeNode[]>();

/** The tree of a template's strings, read once per template. */
export function templateTree(strings: TemplateStringsArray): TreeNode[] {
    let tree = cache.get(strings);
    if (!tree) {
        tree = parse(markupWithHoles(strings));
        cache.set(strings, tree);
    }
    return tree;
}

/**
 * The template's strings joined with the client's placeholders: a text placeholder inside a tag, a
 * comment placeholder in content. The same quote- and comment-aware scan as template.ts.
 */
/** What closes a text placeholder: a zero-width space, as template.ts writes it after the index. */
const PLACEHOLDER_END = String.fromCharCode(0x200b);

function markupWithHoles(strings: readonly string[]): string {
    let out = strings[0];
    const state = { inTag: false, quote: '' };
    scan(strings[0], state);
    for (let i = 1; i < strings.length; i++) {
        out += state.inTag ? `${PLACEHOLDER}${i - 1}${PLACEHOLDER_END}` : `<!--${COMMENT_PH_PREFIX}${i - 1}-->`;
        out += strings[i];
        scan(strings[i], state);
    }
    return out;
}

function scan(chunk: string, s: { inTag: boolean; quote: string }): void {
    for (let j = 0; j < chunk.length; j++) {
        const c = chunk[j];
        if (s.quote) { if (c === s.quote) s.quote = ''; continue; }
        if (s.inTag && (c === '"' || c === "'")) { s.quote = c; continue; }
        if (!s.inTag && c === '<' && chunk.startsWith('!--', j + 1)) {
            const end = chunk.indexOf('-->', j + 4);
            if (end >= 0) { j = end + 2; continue; }
        }
        if (c === '<') s.inTag = true;
        else if (c === '>') s.inTag = false;
    }
}

const HOLE_COMMENT = new RegExp(`^${COMMENT_PH_PREFIX}(\\d+)$`);

/** Parse markup into a tree. Unclosed elements close at the end; a stray closing tag is ignored. */
function parse(markup: string): TreeNode[] {
    const root: TreeNode[] = [];
    // `name` is lowercased for matching a closing tag; `svg` says the element is in SVG content.
    const stack: Array<{ name: string; children: TreeNode[]; svg: boolean }> = [{ name: '', children: root, svg: false }];
    let i = 0;
    const top = () => stack[stack.length - 1].children;
    while (i < markup.length) {
        const lt = markup.indexOf('<', i);
        if (lt < 0) { pushText(top(), markup.slice(i)); break; }
        if (lt > i) pushText(top(), markup.slice(i, lt));
        if (markup.startsWith('<!--', lt)) {
            const end = markup.indexOf('-->', lt + 4);
            const data = markup.slice(lt + 4, end < 0 ? markup.length : end);
            const hole = data.match(HOLE_COMMENT);
            top().push(hole ? { kind: 'hole', index: Number(hole[1]) } : { kind: 'comment', raw: data });
            i = end < 0 ? markup.length : end + 3;
            continue;
        }
        if (markup[lt + 1] === '/') {
            const end = markup.indexOf('>', lt);
            const name = markup.slice(lt + 2, end < 0 ? markup.length : end).trim().toLowerCase();
            for (let k = stack.length - 1; k > 0; k--) {
                if (stack[k].name === name) { stack.length = k; break; }
            }
            i = end < 0 ? markup.length : end + 1;
            continue;
        }
        if (!/[A-Za-z]/.test(markup[lt + 1] ?? '')) { pushText(top(), '<'); i = lt + 1; continue; }
        const tag = readTag(markup, lt);
        const lower = tag.name.toLowerCase();
        const parent = stack[stack.length - 1];
        // In SVG content, but not inside a foreignObject, which holds HTML again.
        const svg = (parent.svg && parent.name !== 'foreignobject') || lower === 'svg';
        const name = svg ? (SVG_TAGS.get(lower) ?? lower) : lower;
        const attributes = tag.attributes.map((a) => {
            const n = a.name.toLowerCase();
            return { name: svg ? (SVG_ATTRIBUTES.get(n) ?? n) : n, value: a.value };
        });
        const isVoid = VOID_ELEMENTS.has(lower);
        const element: TreeNode = { kind: 'element', name, attributes, children: [], void: isVoid };
        top().push(element);
        i = tag.end;
        if (isVoid || tag.selfClosing) continue;
        if (RAW_TEXT.has(lower) && !svg) {
            const close = markup.toLowerCase().indexOf(`</${lower}`, i);
            const text = markup.slice(i, close < 0 ? markup.length : close);
            if (text) element.children.push(...splitRawText(text));
            i = close < 0 ? markup.length : markup.indexOf('>', close) + 1;
            continue;
        }
        stack.push({ name: lower, children: element.children, svg });
    }
    return root;
}

/** Raw text keeps its holes: a `<textarea>` or `<title>` interpolation. */
function splitRawText(text: string): TreeNode[] {
    const out: TreeNode[] = [];
    const re = new RegExp(`<!--${COMMENT_PH_PREFIX}(\\d+)-->`, 'g');
    let last = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last) out.push({ kind: 'text', raw: text.slice(last, m.index) });
        out.push({ kind: 'hole', index: Number(m[1]) });
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', raw: text.slice(last) });
    return out;
}

function pushText(into: TreeNode[], raw: string): void {
    if (raw) into.push({ kind: 'text', raw });
}

/** Read `<name attr=… …>` from `start`: its name, attributes, end and whether it self-closes. */
function readTag(markup: string, start: number): { name: string; attributes: TreeAttribute[]; end: number; selfClosing: boolean } {
    let i = start + 1;
    while (i < markup.length && /[\w:.-]/.test(markup[i])) i++;
    const name = markup.slice(start + 1, i);
    const attributes: TreeAttribute[] = [];
    let selfClosing = false;
    while (i < markup.length) {
        while (i < markup.length && /\s/.test(markup[i])) i++;
        const c = markup[i];
        if (c === '>') { i++; break; }
        if (c === '/' && markup[i + 1] === '>') { selfClosing = true; i += 2; break; }
        if (c === undefined) break;
        let n = i;
        while (n < markup.length && !/[\s=>]/.test(markup[n]) && !(markup[n] === '/' && markup[n + 1] === '>')) n++;
        const attrName = markup.slice(i, n);
        i = n;
        while (i < markup.length && /\s/.test(markup[i])) i++;
        if (markup[i] !== '=') { if (attrName) attributes.push({ name: attrName, value: null }); continue; }
        i++;
        while (i < markup.length && /\s/.test(markup[i])) i++;
        let value: string;
        if (markup[i] === '"' || markup[i] === "'") {
            const q = markup[i];
            const close = markup.indexOf(q, i + 1);
            value = markup.slice(i + 1, close < 0 ? markup.length : close);
            i = close < 0 ? markup.length : close + 1;
        } else {
            // An unquoted value ends before `/>`, as the client's `/>` expansion reads it.
            let v = i;
            while (v < markup.length && !/[\s>]/.test(markup[v]) && !(markup[v] === '/' && markup[v + 1] === '>')) v++;
            value = markup.slice(i, v);
            i = v;
        }
        attributes.push({ name: attrName, value });
    }
    return { name, attributes, end: i, selfClosing };
}
