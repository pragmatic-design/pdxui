// A block's static markup as an HTML string, when the HTML parser keeps it exactly (#369).
//
// Since #109 a block's static markup is built once by a builder and copied per render. One DOM call
// per node is the builder that keeps the compiler's tree exactly; an HTML string of the same markup
// is far shorter, and core's `staticMarkup` parses it once instead. The walk reaches the nodes by
// `firstChild`/`nextSibling` paths, so the parse must give back the very same tree, node for node.
//
// The parser does not always. It moves or adds nodes for some content models (an implicit <tbody>,
// a <p> closed by a <div>, an <a> inside an <a>), reads some elements' content as raw text, merges
// adjacent text, drops empty text, renames SVG names it knows and lowercases the others. A block
// with any of those keeps its DOM calls: `blockHtml` answers null. The rule errs towards the DOM
// calls — a block left out costs bytes, a block let in wrongly costs a broken render.
//
// An empty text node — an anchor the render binds — is written `<!---->`, and `staticMarkup` puts an
// empty text node back in its place.

/** One node of a block's static markup, as the HTML form needs to know it. */
export interface MarkupNode {
    kind: 'root' | 'element' | 'text' | 'comment' | 'anchor' | 'sink';
    kids: MarkupNode[];
    /** An element's tag, as written. */
    tag?: string;
    /** An element in the SVG namespace. */
    svg?: boolean;
    /** An element written with no content: a void element, or one closed by `/>`. */
    isVoid?: boolean;
    /** An element's static attributes, in the order they are set. */
    attrs?: Array<[string, string]>;
    /** A text node's or a comment's data. */
    data?: string;
}

/** The elements the parser treats as void: no content, no closing tag. */
const PARSER_VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
    'param', 'keygen', 'frame', 'basefont', 'bgsound',
]);

/**
 * Elements whose content or position the parser handles in its own way: table content (implicit
 * <tbody>, foster parenting), selects and options, raw-text and escapable raw-text elements, the
 * document structure, <template> (its children go to its content), <image> (renamed <img>), MathML,
 * and the elements a nested start tag closes.
 */
const EXCLUDED = new Set([
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'select', 'option', 'optgroup', 'datalist',
    'script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext',
    'html', 'head', 'body', 'frameset', 'frame', 'template', 'image', 'math', 'nobr',
    'rb', 'rt', 'rtc', 'rp', 'param', 'keygen', 'basefont', 'bgsound',
]);

/** A start tag of one of these closes an open <p> (WHATWG, «in body»). */
const CLOSES_P = new Set([
    'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl',
    'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
    'hgroup', 'hr', 'listing', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'summary',
    'table', 'ul', 'xmp', 'plaintext', 'dd', 'dt', 'li',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** An element that, opened inside itself, closes the first: its descendants may not have its name. */
const NOT_NESTED: Record<string, Set<string>> = {
    a: new Set(['a']),
    button: new Set(['button']),
    form: new Set(['form']),
    li: new Set(['li']),
    dd: new Set(['dd', 'dt']),
    dt: new Set(['dd', 'dt']),
    p: CLOSES_P,
};

/** An attribute name the parser reads back as the same name. */
const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;

/**
 * The parser lowercases every name in SVG content, then puts back the case of these (WHATWG, «adjust
 * SVG attributes» and the SVG tag name table of «in foreign content»).
 */
const SVG_TAGS = names('altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend '
    + 'feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap '
    + 'feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge '
    + 'feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence '
    + 'foreignObject glyphRef linearGradient radialGradient textPath');
const SVG_ATTRS = names('attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits diffuseConstant '
    + 'edgeMode filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints '
    + 'keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits '
    + 'maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY '
    + 'pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur '
    + 'requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset '
    + 'stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox '
    + 'viewTarget xChannelSelector yChannelSelector zoomAndPan');

function names(list: string): Map<string, string> {
    return new Map(list.split(' ').map((n) => [n.toLowerCase(), n]));
}

/** Whether an SVG name written `name` comes back from the parser as `name`. */
const svgKeeps = (name: string, table: Map<string, string>): boolean => (table.get(name.toLowerCase()) ?? name.toLowerCase()) === name;

/**
 * Where an element's own list scope ends: an <li> closes an open <li> only up to the nearest list,
 * a <dd>/<dt> an open <dd>/<dt> up to the nearest <dl>. So `<li><ul><li>` is kept.
 */
const SCOPE_END: Record<string, Set<string>> = {
    li: new Set(['ul', 'ol', 'menu']),
    dd: new Set(['dl']),
    dt: new Set(['dl']),
};

/** The descendant elements of `n`, in HTML (an <svg> subtree is its own content), not past `stop`. */
function htmlDescendants(n: MarkupNode, stop: Set<string> | undefined, out: string[] = []): string[] {
    for (const k of n.kids) {
        if (k.kind !== 'element' || k.svg) continue;
        const tag = k.tag!.toLowerCase();
        out.push(tag);
        if (!stop?.has(tag)) htmlDescendants(k, stop, out);
    }
    return out;
}

/** Whether the parser keeps `n` and everything under it exactly as written. */
function keeps(n: MarkupNode): boolean {
    if (n.kind === 'sink') return false;
    if (n.kind === 'comment') {
        const d = n.data ?? '';
        // Empty is an anchor's placeholder; these the parser ends or changes early.
        return d !== '' && !d.includes('--') && !d.startsWith('>') && !d.startsWith('->') && !d.endsWith('-') && !/[\r\0]/.test(d);
    }
    if (n.kind === 'text') return (n.data ?? '') !== '' && !/[\r\0]/.test(n.data!);
    if (n.kind === 'anchor') return true;
    if (n.kind === 'element') {
        const tag = n.tag!;
        const lower = tag.toLowerCase();
        if (n.svg) {
            // The parser lowercases SVG names and puts back the case of those it knows (viewBox,
            // linearGradient); the compiler keeps them as written. A name reads back the same only when
            // both agree. A prefixed attribute (xlink:href) and xmlns get a namespace from the parser
            // and none from setAttribute.
            if (!svgKeeps(tag, SVG_TAGS)) return false;
            for (const [name] of n.attrs ?? []) {
                if (!svgKeeps(name, SVG_ATTRS) || name.includes(':') || name.toLowerCase() === 'xmlns') return false;
            }
        } else {
            if (EXCLUDED.has(lower)) return false;
            // A parser-void element the compiler gave content, or a non-void one it left open.
            if (PARSER_VOID.has(lower) && (!n.isVoid || n.kids.length > 0)) return false;
            const forbidden = NOT_NESTED[lower];
            if (forbidden && htmlDescendants(n, SCOPE_END[lower]).some((t) => forbidden.has(t))) return false;
            if (HEADINGS.has(lower) && n.kids.some((k) => k.kind === 'element' && HEADINGS.has(k.tag!.toLowerCase()))) return false;
            // <pre> and <listing> drop a newline that starts their content.
            if ((lower === 'pre' || lower === 'listing') && n.kids[0]?.kind === 'text' && n.kids[0].data!.startsWith('\n')) return false;
        }
        const seen = new Set<string>();
        for (const [name, value] of n.attrs ?? []) {
            const key = name.toLowerCase();
            // The parser keeps the first of two, setAttribute the last.
            if (!SAFE_NAME.test(name) || seen.has(key) || /[\r\0]/.test(value)) return false;
            seen.add(key);
        }
    }
    // Two text nodes side by side are one after a parse.
    for (let i = 1; i < n.kids.length; i++) {
        if (n.kids[i].kind === 'text' && n.kids[i - 1].kind === 'text') return false;
    }
    return n.kids.every(keeps);
}

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The markup as HTML, whether or not the parser keeps it. `blockHtml` is the one to emit; this is
 * exported for the browser test that shows each excluded case really parses into another tree.
 */
export function writeHtml(n: MarkupNode): string {
    return write(n);
}

function write(n: MarkupNode): string {
    switch (n.kind) {
        case 'text': return escapeText(n.data!);
        case 'comment': return `<!--${n.data}-->`;
        case 'anchor': return '<!---->';
        case 'element': {
            const attrs = (n.attrs ?? []).map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)).join('');
            const open = `<${n.tag}${attrs}>`;
            // A parser-void element has no closing tag; any other is closed, `/>` or not — the
            // parser ignores `/>` on an HTML element and would nest the next sibling in it.
            if (!n.svg && PARSER_VOID.has(n.tag!.toLowerCase())) return open;
            return `${open}${n.kids.map(write).join('')}</${n.tag}>`;
        }
        default: return n.kids.map(write).join('');
    }
}

/** The block's markup as HTML the parser keeps exactly, or null when the block keeps its DOM calls. */
export function blockHtml(root: MarkupNode): string | null {
    return keeps(root) ? write(root) : null;
}

/** U+2028 and U+2029, line terminators to an older JavaScript parser. Built, not written, here. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// Match: what a single-quoted literal cannot hold as written — a backslash, the quote, a newline,
// U+2028 and U+2029.
const UNQUOTED = new RegExp(`[\\\\'\\n${LS}${PS}]`, 'g');

const ESCAPES: Record<string, string> = { '\\': '\\\\', "'": "\\'", '\n': '\\n', [LS]: '\\u2028', [PS]: '\\u2029' };

/**
 * `html` as a single-quoted JavaScript literal. Not `jsString`: that writes every `<` as a six-byte
 * escape where the markup has one character. What it guards against — a `</script>` closing the
 * <script> an inlined module sits in — needs only `</script` defused.
 */
export function htmlLiteral(html: string): string {
    const body = html
        .replace(UNQUOTED, (ch) => ESCAPES[ch])
        .replace(/<\/(script)/gi, '<\\/$1');
    return `'${body}'`;
}
