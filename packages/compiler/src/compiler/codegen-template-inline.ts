// Inline DOM construction codegen for production builds.
// Generates imperative createElement/appendChild code instead of html`` tagged templates.
// Eliminates: innerHTML parsing, placeholder regex, bindAttribute dispatch, DOM walking.
// Gated behind: production: true + inlineBindings: true

import { extractLoopInvariants } from './codegen-template';
import type {
    TemplateNode, IfNode, ForNode, SwitchNode, RequireNode,
    InterpolationNode, ShowNode, PortalNode, DeferNode, TryNode, AwaitNode, LetNode,
    CustomDirectiveNode, SlotTemplateNode,
} from '../parser/template';
import { prefixCtx, callSignals, isRowBinding, withLoopScope, trackKeyArg } from './codegen-prefix';
import { createCompileContext, type CompileContext } from './compile-context';
import { boundPropName } from './codegen-prop-names';
import { buildEventHandler } from './codegen-template-rewrite';
import { hoistSlotTemplate } from './codegen-template';
import { templateMark, htmlOriginOf, attributeOrigins } from './codegen-origins';
import { originMark } from './sourcemap';
import { jsQuote, jsString } from './js-literal';

// ─── Constants ────────────────────────────────────────────────────

/** The HTML void elements: no content, no closing tag. The html`` rewrite expands `<x />` of any other. */
export const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Bound names whose value is a URL: the inline path hands them to core's `sanitizeBoundUrl`.
 * A copy of core's list (`URL_PROPS` in renderer/template.ts, `URL_ATTRS` in renderer/dom.ts),
 * because the compiler does not import core; `inline-url-binding.test.ts` fails if they differ.
 */
export const URL_BINDINGS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

/**
 * HTML attribute names whose DOM property is spelled differently. A copy of core's `ATTR_TO_PROP`
 * (renderer/template.ts), because the compiler does not import core; `inline-attr-to-prop.test.ts`
 * fails if they differ. Without it `:tabindex` would assign `el["tabindex"]`, a property nobody reads.
 * `class` is here for the parity of the table; `:class` itself compiles to `classBind`.
 */
export const ATTR_TO_PROP: Record<string, string> = {
    class: 'className',
    for: 'htmlFor',
    tabindex: 'tabIndex',
    readonly: 'readOnly',
    maxlength: 'maxLength',
    cellspacing: 'cellSpacing',
    cellpadding: 'cellPadding',
    rowspan: 'rowSpan',
    colspan: 'colSpan',
    usemap: 'useMap',
    frameborder: 'frameBorder',
    contenteditable: 'contentEditable',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Properties an SVG element can ASSIGN. Its other DOM properties of the same name as an attribute —
 * `width`, `x`, `href`, `className` — are read-only SVGAnimated* views, so a bound name on SVG is
 * written as the attribute, as core's `bindProperty` does.
 */
const SVG_WRITABLE_PROPS = new Set(['textContent', 'innerHTML', 'style']);

/** What the generator needs to know about the element a binding sits on. */
interface ElementKind {
    /** A custom element (its tag has a hyphen): a hyphenated name is its camelCase prop. */
    custom: boolean;
    /** In the SVG namespace: bound names are attributes, save the writable properties above. */
    svg: boolean;
    /** The element name, lowercase: a component's bound names are resolved against its props. */
    tag: string;
}

/**
 * Is `prop` written with setAttribute rather than assigned? The rule is core's `bindProperty`:
 * aria-* and data-* always; a name with `:` (it cannot be a property); on SVG every name but the
 * writable ones; on a plain element a name with `-`, which a JavaScript property cannot contain.
 * A hyphenated name on a component is its prop, camelCased by `propName`.
 */
function isAttributeBinding(prop: string, kind: ElementKind): boolean {
    if (prop.startsWith('aria-') || prop.startsWith('data-') || prop.includes(':')) return true;
    if (kind.svg) return !SVG_WRITABLE_PROPS.has(prop);
    return !kind.custom && prop.includes('-');
}

/**
 * The property a bound name assigns: `tabindex` is `tabIndex` (core's `ATTR_TO_PROP`, on every
 * element, as core maps it), and a component's `item-height` is its `itemHeight` prop.
 */
function propName(prop: string, kind: ElementKind): string {
    const mapped = ATTR_TO_PROP[prop];
    if (mapped) return mapped;
    return kind.custom ? prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) : prop;
}

/** The named entities a `.pdx` template realistically carries; the numeric forms are general. */
const NAMED_ENTITIES: Record<string, string> = {
    lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
};

/**
 * Decode HTML entities the way the browser would.
 *
 * The template path hands its markup to `html```, which core parses with innerHTML — so `&lt;`,
 * `&amp;` and `&#64;` are decoded by the BROWSER. The inline path builds the DOM itself, with
 * `createTextNode` and `setAttribute`, which decode nothing: undecoded, an entity would stay on
 * screen as an entity, and a `<pre><code>` block showing PDX source would render `&#64;for` where
 * every other build renders `@for`.
 *
 * `&amp;` is resolved LAST and in the same pass, never by rescanning: decoding it first and looking
 * again would turn the text `&amp;lt;` into a tag — the double-decode every hand-rolled unescaper
 * gets wrong. One regex, one replacement per match.
 */
export function decodeEntities(s: string): string {
    // Match: &name;  &#NN;  &#xHH;   Groups: [1]=name  [2]=decimal  [3]=hex
    return s.replace(/&(?:([a-zA-Z][a-zA-Z0-9]*)|#(\d+)|#[xX]([0-9a-fA-F]+));/g, (whole, name, dec, hex) => {
        if (dec) return String.fromCodePoint(Number(dec));
        if (hex) return String.fromCodePoint(parseInt(hex, 16));
        if (name === 'amp') return '&';
        return NAMED_ENTITIES[name] ?? whole;   // an entity we do not know stays as written
    });
}

const KEY_MAP: Record<string, string | string[]> = {
    enter: 'Enter', escape: 'Escape', space: ' ', tab: 'Tab',
    delete: ['Delete', 'Backspace'],
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
};

// ─── Public API ───────────────────────────────────────────────────

/** Generate imperative DOM construction code from template AST. Returns an IIFE. */
export function generateInlineNodes(nodes: TemplateNode[], imports: Set<string>, ctx?: CompileContext): string {
    const gen = new InlineGen(imports, 0, ctx);
    gen.walk(nodes);
    return gen.build();
}

// ─── Generator ────────────────────────────────────────────────────

class InlineGen {
    private lines: string[] = [];
    private idx: number;
    private stack: string[] = [];
    /** Parallel to `stack`: whether that element's children are in the SVG namespace. */
    private svgStack: boolean[] = [];
    /** Whether the top level of this generator is inside an <svg> (a block body within one). */
    private readonly baseSvg: boolean;
    private imports: Set<string>;
    private ctx: CompileContext;
    /** Loop-invariant reads already hoisted in THIS block: signal name to the computed holding it. */
    private li = new Map<string, string>();

    constructor(imports: Set<string>, startIdx = 0, ctx?: CompileContext, baseSvg = false) {
        this.imports = imports;
        this.idx = startIdx;
        this.baseSvg = baseSvg;
        // Fallback context for backward compat (tests that don't pass ctx). Built by the factory
        // rather than spelled out: an inline literal would silently go stale every time
        // CompileContext gains a field.
        this.ctx = ctx ?? createCompileContext();
    }

    private v(prefix = 'el'): string { return `__${prefix}${this.idx++}`; }
    /** The origin mark the next line written carries: set just before a node's statement. */
    private pending = '';
    private out(line: string): void { this.lines.push(this.pending + line); this.pending = ''; }
    private parent(): string { return this.stack[this.stack.length - 1] ?? '__frag'; }
    /** Are the elements created here, under the current parent, SVG? */
    private childrenSvg(): boolean { return this.svgStack[this.svgStack.length - 1] ?? this.baseSvg; }
    private read(expr: string): string { return callSignals(prefixCtx(expr, this.ctx), this.ctx); }

    walk(nodes: TemplateNode[]): void {
        for (const node of nodes) {
            switch (node.type) {
                case 'html': this.html(node.content, htmlOriginOf(this.ctx, node)); break;
                case 'interpolation': this.interp(node); break;
                case 'if': this.ifN(node); break;
                case 'for': this.forN(node); break;
                case 'switch': this.switchN(node); break;
                case 'require': this.requireN(node); break;
                case 'show': this.showN(node); break;
                case 'portal': this.portalN(node); break;
                case 'defer': this.deferN(node); break;
                case 'try': this.tryN(node); break;
                case 'await': this.awaitN(node); break;
                case 'let': this.letN(node); break;
                case 'custom-directive': this.customDirectiveN(node as CustomDirectiveNode); break;
                case 'slot-template': this.slotTemplateN(node as SlotTemplateNode); break;
                default:
                    // NOT a silent break. A node type this generator cannot render would vanish
                    // from the module without a trace. A warning is the difference between a
                    // missing feature and an invisible one.
                    this.ctx.warnings.push({
                        code: 'PDX_INLINE_NODE_UNSUPPORTED',
                        severity: 'warn',
                        message: `The inline render path cannot compile a '${(node as { type: string }).type}' node, so it was left out.`,
                        hint: 'Build without inlineBindings, or open an issue for this node type.',
                    });
                    break;
            }
        }
    }

    /**
     * A scoped slot the parent passes down: `<slot name="item" let:label>…</slot>`.
     *
     * The function is hoisted by the SAME helper the template path uses, so the two cannot disagree
     * about a slot's name, its scope variables or its body. What differs is only where the carrier
     * goes: interpolated into the template there, appended to the current parent here.
     *
     * The body is generated by the template path — `html``` and all — which is why the module still
     * needs the `html` import even though this render path never writes one itself.
     */
    private slotTemplateN(node: SlotTemplateNode): void {
        this.out(`${this.parent()}.appendChild(${hoistSlotTemplate(node, this.imports, this.ctx)});`);
    }

    // ─── HTML Fragment Parsing ────────────────────────────────

    html(content: string, at: ((k: number) => number | null) | null = null): void {
        let i = 0;
        while (i < content.length) {
            if (content[i] !== '<') {
                const next = content.indexOf('<', i);
                const text = content.slice(i, next === -1 ? content.length : next);
                // Whitespace-only text is one space, as the browser's parser keeps it in dev: emitting
                // nothing would make two inline siblings run together in a build.
                if (text) {
                    const data = /^\s+$/.test(text) ? ' ' : decodeEntities(text);
                    this.out(`${this.parent()}.appendChild(document.createTextNode(${jsString(data)}));`);
                }
                i = next === -1 ? content.length : next;
                continue;
            }
            if (content[i + 1] === '/') {
                const end = content.indexOf('>', i);
                if (this.stack.length > 0) { this.stack.pop(); this.svgStack.pop(); }
                i = end === -1 ? content.length : end + 1;
            } else if (content[i + 1] === '!') {
                const end = content.indexOf('-->', i);
                i = end === -1 ? content.length : end + 3;
            } else {
                const tagEnd = this.tagEnd(content, i);
                const tagStart = i;
                this.openTag(content.slice(i, tagEnd + 1), at ? (k) => at(tagStart + k) : null);
                i = tagEnd + 1;
            }
        }
    }

    /**
     * Where the tag opened at `start` ends.
     *
     * Quoted values are skipped, and so is an unquoted `${…}` value — which is not a nicety: the
     * form binding pass injects `:error=${() => ctx.f?.error()}` on every `<pdx-form-field>`, and
     * `=>` contains a `>`. Without this the tag would end inside the arrow, the rest of it would
     * become a text node, and the module would not parse at all. An author never writes `${…}` in
     * an attribute — rule 7 of CONTRIBUTING.md — but the compiler does.
     */
    private tagEnd(s: string, start: number): number {
        let inQ = false, qCh = '';
        for (let i = start + 1; i < s.length; i++) {
            if (inQ) { if (s[i] === qCh) inQ = false; continue; }
            if (s[i] === '"' || s[i] === "'") { inQ = true; qCh = s[i]; continue; }
            if (s[i] === '$' && s[i + 1] === '{') { i = this.matchBrace(s, i + 1); continue; }
            if (s[i] === '>') return i;
        }
        return s.length - 1;
    }

    private openTag(tag: string, at: ((k: number) => number | null) | null = null): void {
        const nm = tag.match(/^<([\w-]+)/);
        if (!nm) return;
        const name = nm[1];
        const isVoid = VOID_ELEMENTS.has(name) || tag.endsWith('/>');
        // <svg> and everything inside it live in the SVG namespace: created with createElement they
        // would be HTML elements that draw nothing. foreignObject's children are HTML again.
        const svg = name === 'svg' || this.childrenSvg();
        const kind: ElementKind = { custom: !svg && name.includes('-'), svg, tag: name.toLowerCase() };

        const el = this.v();
        this.out(svg
            ? `const ${el} = document.createElementNS(${jsString(SVG_NS)}, ${jsQuote(name)});`
            : `const ${el} = document.createElement(${jsQuote(name)});`);
        this.attrs(tag, el, kind, at ? attributeOrigins(tag, at) : null);
        this.out(`${this.parent()}.appendChild(${el});`);
        if (!isVoid) {
            this.stack.push(el);
            this.svgStack.push(svg && name !== 'foreignObject');
        }
    }

    // ─── Attribute Processing ─────────────────────────────────

    private attrs(tag: string, el: string, kind: ElementKind, origins: Map<string, number> | null = null): void {
        const sp = tag.indexOf(' ');
        if (sp === -1) return;
        const s = tag.slice(sp, tag.endsWith('/>') ? -2 : -1);
        // Match attribute names plus quoted OR unquoted ${...} values. The form-binding
        // pass injects pre-rewritten interpolations like `:checked=${() => ctx.f?.value()}`;
        // those must be detected (not silently produce `el["checked"] = ;`).
        // Groups: [1]=name  [2]/[3]=quoted value  [4]=`${` opening an unquoted value.
        // Names take `-` and `:` — `:aria-label`, `:xlink:href`, `@pdx-change`, `xlink:href` — and
        // `.` for modifiers. Without them `:aria-label` would match `:aria` with an empty value and
        // the module would not parse.
        const re = /(::[\w.:-]+|:[\w.:-]+|@[\w.:-]+|[\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\$\{)))?/g;
        // The static class is written FIRST, whichever side of the class bindings it sits on: `:class`
        // and `:class.x` add and remove their own classes through classList, and a static
        // setAttribute("class") after them would wipe what they had added. The attribute, not
        // `className`: on SVG that is a read-only SVGAnimatedString.
        // Match: ` class="a b"` (not `:class`, not `data-class`)  Groups: [1]/[2]=the value
        const staticClass = /\sclass=(?:"([^"]*)"|'([^']*)')/.exec(s);
        const staticClassValue = staticClass ? (staticClass[1] ?? staticClass[2]) : '';
        if (staticClass) this.out(`${el}.setAttribute("class", ${jsString(staticClassValue)});`);
        let m;
        while ((m = re.exec(s)) !== null) {
            const n = m[1];
            let val = m[2] ?? m[3] ?? '';
            let preRewritten = false;
            // Unquoted ${...} value — extract balanced inner expression (already final JS).
            if (m[4]) {
                const open = m.index + m[0].length - 2; // position of `${`
                const close = this.matchBrace(s, open + 1);
                val = s.slice(open + 2, close);
                preRewritten = true;
                re.lastIndex = close + 1;
            }
            // The statement this attribute becomes points at it.
            const origin = origins?.get(n);
            this.pending = origin == null ? '' : originMark(origin);
            if (n.startsWith('::'))          this.twoWay(el, n.slice(2), val, kind);
            else if (n.startsWith(':class.')) this.classToggle(el, n.slice(7), val);
            else if (n.startsWith(':style.')) this.styleProp(el, n.slice(7), val);
            else if (n === ':show')           this.showBind(el, val);
            else if (n === ':ref' || n === 'ref') this.refBind(el, val);
            else if (n === ':class')          this.classBind(el, val, staticClassValue, preRewritten);
            else if (n.startsWith(':'))       this.propBind(el, n.slice(1), val, kind, preRewritten);
            else if (n.startsWith('@'))       this.eventBind(el, n.slice(1), val, preRewritten);
            else if (n === 'class')           continue; // written first, above
            else if (val)                     this.out(`${el}.setAttribute(${jsString(n)}, ${jsString(decodeEntities(val))});`);
            else                              this.out(`${el}.setAttribute(${jsString(n)}, '');`);
            this.pending = '';
        }
    }

    /** Find the index of the `}` matching the `{` of a `${` at position `braceOpen`. */
    private matchBrace(s: string, braceOpen: number): number {
        let depth = 1;
        for (let i = braceOpen + 1; i < s.length; i++) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') { depth--; if (depth === 0) return i; }
        }
        return s.length - 1;
    }

    private propBind(el: string, prop: string, expr: string, kind: ElementKind, preRewritten = false): void {
        this.imports.add('effect');
        // Pre-rewritten values are already final JS (often a `() => …` getter from form-binding).
        const value = preRewritten ? `(${expr})()` : this.read(expr);
        this.out(`effect(() => { ${this.assign(el, this.boundName(prop, kind), value, kind)} });`);
    }

    /**
     * A component's bound name, as the component declares it: `:withborder` is its `withBorder`
     * prop, as in the interpreted build (`boundPropName`). A plain element's is unchanged.
     */
    private boundName(prop: string, kind: ElementKind): string {
        return kind.custom ? boundPropName(kind.tag, prop, this.ctx) : prop;
    }

    /**
     * `:class`, as core's `bindProperty` does it: through classList, owning only the classes it wrote.
     * Each value removes the previous value's classes and adds its own, so the static class and a
     * class `:class.x` turned on stay; a dynamic class that is also static is never
     * removed. `el["class"]` is an expando and `className` is read-only on SVG. In a block,
     * so two bound elements in one scope do not collide.
     */
    private classBind(el: string, expr: string, staticClass: string, preRewritten: boolean): void {
        this.imports.add('effect');
        const value = preRewritten ? `(${expr})()` : this.read(expr);
        const statics = jsString(staticClass.split(/\s+/).filter(Boolean));
        this.out(`{ const __s = new Set(${statics}); let __w = []; effect(() => { `
            + `const __n = String(${value} ?? '').split(/\\s+/).filter(Boolean); `
            + `for (const __t of __w) if (!__n.includes(__t) && !__s.has(__t)) ${el}.classList.remove(__t); `
            + `for (const __t of __n) ${el}.classList.add(__t); __w = __n; }); }`);
    }

    /**
     * The statement that writes `value` for the bound name `prop`. A URL name goes through core's
     * `sanitizeBoundUrl`, as the interpreted path does, and a refused value removes the attribute:
     * assigning it raw would make `:href` holding `javascript:` a live link in this build only.
     * A name that is an attribute (`isAttributeBinding`) is set with setAttribute, and removed for
     * null or false, as core's attribute branch does.
     */
    private assign(el: string, prop: string, value: string, kind: ElementKind): string {
        const url = URL_BINDINGS.has(prop.toLowerCase());
        if (url) this.imports.add('sanitizeBoundUrl');
        if (isAttributeBinding(prop, kind)) return this.attributeWrite(el, prop, value, url);
        const p = jsString(propName(prop, kind));
        const property = url
            ? `const __safeUrl = sanitizeBoundUrl(${el}, ${p}, ${value}); `
                + `if (__safeUrl == null) ${el}.removeAttribute(${p}); else ${el}[${p}] = __safeUrl;`
            : `${el}[${p}] = ${value};`;
        // A plain element's property set is fixed, so it is asked, as core's `bindProperty` does
        // (`camel in el`): a name the element does not have — `:itemprop`, `:for` on a
        // <div> — is its attribute. Assigning it would set an expando nothing reads. A
        // component declares its props, and is never asked. Its value goes through core's
        // `assignBoundProperty`: before the component connects, `offsetTop` or `prefix` is still the
        // DOM's read-only getter, and a plain assignment would throw.
        if (kind.custom) {
            this.imports.add('assignBoundProperty');
            return url
                ? `const __safeUrl = sanitizeBoundUrl(${el}, ${p}, ${value}); `
                    + `if (__safeUrl == null) ${el}.removeAttribute(${p}); else assignBoundProperty(${el}, ${p}, __safeUrl);`
                : `assignBoundProperty(${el}, ${p}, ${value});`;
        }
        // On a plain element null is cleared by core's `clearBoundProperty`, the rule `bindProperty`
        // uses: by the property's type. Assigning null coerces — `maxLength = null` becomes 0 —
        // and removing the attribute alone leaves a field's `value` on screen. A component keeps
        // the assignment above: its props are signal-backed.
        if (!url) this.imports.add('clearBoundProperty');
        const plainProperty = url
            ? property
            : `const __v = ${value}; if (__v == null) clearBoundProperty(${el}, ${jsString(prop)}, ${p}); else ${el}[${p}] = __v;`;
        return `if (${p} in ${el}) { ${plainProperty} } else { ${this.attributeWrite(el, prop, value, url)} }`;
    }

    /** Write `value` as the attribute `prop`: null or false removes it, as core's attribute branch does. */
    private attributeWrite(el: string, prop: string, value: string, url: boolean): string {
        const a = jsString(prop);
        const set = url
            ? `const __safeUrl = sanitizeBoundUrl(${el}, ${a}, __v); if (__safeUrl == null) ${el}.removeAttribute(${a}); else ${el}.setAttribute(${a}, __safeUrl);`
            : `${el}.setAttribute(${a}, __v === true ? '' : String(__v));`;
        return `const __v = ${value}; if (__v == null || __v === false) ${el}.removeAttribute(${a}); else { ${set} }`;
    }

    private eventBind(el: string, desc: string, expr: string, preRewritten = false): void {
        const parts = desc.split('.');
        const ev = parts[0], mods = new Set(parts.slice(1));
        // The SAME builder the template path uses, so every handler form the docs promise compiles
        // the same under `inlineBindings`: `$event` bound, `count++` and `open = !open` rewritten
        // as signal writes, and two statements kept as two statements.
        //
        // A `${…}` value arrives already rewritten by the caller and is passed through untouched.
        const rawHandler = preRewritten ? expr : buildEventHandler(expr, this.ctx);
        // Wrap with safeHandler for global error interception
        this.imports.add('safeHandler');
        const handler = `safeHandler(${rawHandler}, ctx.el?.tagName?.toLowerCase(), ${jsQuote(ev)})`;

        const optP: string[] = [];
        if (mods.has('once')) optP.push('once:true');
        if (mods.has('capture')) optP.push('capture:true');
        if (mods.has('passive')) optP.push('passive:true');
        const opts = optP.length > 0 ? `, {${optP.join(',')}}` : '';

        const rt = new Set(mods);
        rt.delete('once'); rt.delete('capture'); rt.delete('passive');

        if (rt.size === 0) {
            this.out(`${el}.addEventListener(${jsQuote(ev)}, ${handler}${opts});`);
        } else {
            const w: string[] = [];
            if (rt.has('self')) w.push('if(e.target!==e.currentTarget)return;');
            for (const [mod, keys] of Object.entries(KEY_MAP)) {
                if (rt.has(mod)) {
                    const a = Array.isArray(keys) ? keys : [keys];
                    w.push(`if(!${jsString(a)}.includes(e.key))return;`);
                }
            }
            if (rt.has('prevent')) w.push('e.preventDefault();');
            if (rt.has('stop')) w.push('e.stopPropagation();');
            w.push(`(${handler})(e);`);
            this.out(`${el}.addEventListener(${jsQuote(ev)},(e)=>{${w.join('')}}${opts});`);
        }
    }

    private twoWay(el: string, desc: string, expr: string, kind: ElementKind): void {
        this.imports.add('effect');
        const parts = desc.split('.'), prop = this.boundName(parts[0], kind), mods = new Set(parts.slice(1));
        const sig = prefixCtx(expr, this.ctx), p = jsString(propName(prop, kind));
        this.out(`effect(() => { ${this.assign(el, prop, `${sig}()`, kind)} });`);
        const ev = mods.has('lazy') ? 'change' : 'input';
        let val = `${el}[${p}]`;
        if (mods.has('trim')) val = `(typeof ${val}==='string'?${val}.trim():${val})`;
        if (mods.has('number')) val = `(Number(${val})||0)`;
        this.out(`${el}.addEventListener(${jsQuote(ev)},()=>{${sig}.set(${val});});`);
    }

    private classToggle(el: string, cls: string, expr: string): void {
        this.imports.add('effect');
        this.out(`effect(()=>{${el}.classList.toggle(${jsString(cls)},!!(${callSignals(prefixCtx(expr, this.ctx), this.ctx)}));});`);
    }

    private styleProp(el: string, prop: string, expr: string): void {
        this.imports.add('effect');
        this.out(`effect(()=>{${el}.style.setProperty(${jsString(prop)},String(${callSignals(prefixCtx(expr, this.ctx), this.ctx)}??''));});`);
    }

    private showBind(el: string, expr: string): void {
        this.imports.add('effect');
        this.out(`effect(()=>{${el}.style.display=(${callSignals(prefixCtx(expr, this.ctx), this.ctx)})?'':'none';});`);
    }

    private refBind(el: string, expr: string): void {
        const px = prefixCtx(expr, this.ctx);
        this.out(`if(typeof ${px}==='function'&&typeof ${px}.set==='function')${px}.set(${el});`);
    }

    // ─── Interpolation ────────────────────────────────────────

    interp(node: InterpolationNode): void {
        this.imports.add('effect');
        // The template path's rule, from core: null, undefined and false are empty text. With
        // `String(…)` here the build would show the words the dev server does not.
        this.imports.add('interpolationText');
        const t = this.v('t');
        const expr = this.read(node.expr);
        this.out(`const ${t}=document.createTextNode('');`);
        this.out(`${this.parent()}.appendChild(${t});`);
        this.pending = templateMark(this.ctx, node.exprOffset);
        if (node.pipes?.length > 0) {
            this.imports.add('pipe');
            const fns = node.pipes.map(p => `ctx.${p}`).join(',');
            this.out(`effect(()=>{${t}.data=interpolationText(pipe(${expr},${fns}));});`);
        } else {
            this.out(`effect(()=>{${t}.data=interpolationText(${expr});});`);
        }
    }

    // ─── Control Flow ─────────────────────────────────────────

    private sub(nodes: TemplateNode[]): string {
        // A block inside an <svg> builds SVG elements too.
        const g = new InlineGen(this.imports, this.idx, this.ctx, this.childrenSvg());
        g.walk(nodes);
        this.idx = g.idx;
        return `const __frag=document.createDocumentFragment();${g.lines.join('')}return __frag;`;
    }

    ifN(node: IfNode): void {
        this.imports.add('when');
        const cond = callSignals(prefixCtx(node.condition, this.ctx), this.ctx);
        const then = this.sub(node.body);
        const els = node.elseBody ? `()=>{${this.sub(node.elseBody)}}` : 'null';
        const cf = this.v('cf');
        this.pending = templateMark(this.ctx, node.exprOffset);
        this.out(`const ${cf}=when(()=>${cond},()=>{${then}},${els});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    forN(node: ForNode): void {
        // Row getters for a plain item, as in codegen-template.ts.
        const rows = isRowBinding(node);
        const helper = rows ? 'eachRow' : 'each';
        this.imports.add(helper);
        const items = callSignals(prefixCtx(node.items, this.ctx), this.ctx);
        const keyArg = trackKeyArg(node, this.ctx);
        let body = withLoopScope(node, rows, this.ctx, () => this.sub(node.body));
        const params = node.index ? `${node.item},${node.index}` : node.item;
        const cf = this.v('cf');

        // A read that does not depend on the row is lifted into ONE computed, outside the loop —
        // the same transform the template path applies, through the same `extractLoopInvariants`,
        // so the two paths cannot disagree about what is invariant.
        //
        // It matters more here than it reads: this path writes an `effect()` per row, and each one
        // subscribes to the signal itself. Unhoisted, a 1500-row list puts 1500 entries in that
        // signal's subscriber set where the template path puts one, and a change re-reads the signal
        // 1500 times instead of recomputing once. Production only, like the template path's: in dev the
        // read stays where the author wrote it.
        if (this.ctx.production) {
            const invariants = extractLoopInvariants(body, node.item, this.ctx);
            if (invariants.length > 0) {
                this.imports.add('computed');
                for (const name of invariants) {
                    const alias = this.hoist(name);
                    body = body.replace(new RegExp(`ctx\\.${name}\\(\\)`, 'g'), `${alias}()`);
                    // Match: `ctx.NAME` passed by reference — not followed by a word char, `(` or
                    // `.` (a member of the signal object is never a read of its value).
                    body = body.replace(new RegExp(`ctx\\.${name}(?!\\w|\\(|\\.)`, 'g'), `${alias}()`);
                }
            }
        }
        if (node.emptyBody) {
            // @empty fallback — when() wraps each + empty
            this.imports.add('when');
            const emptyBody = this.sub(node.emptyBody);
            const wf = this.v('wf');
            this.pending = templateMark(this.ctx, node.exprOffset);
            this.out(`const ${cf}=${helper}(()=>${items},${keyArg},(${params})=>{${body}});`);
            this.out(`const ${wf}=when(()=>${items}?.length>0,()=>{const f=document.createDocumentFragment();f.appendChild(${cf});return f;},()=>{${emptyBody}});`);
            this.out(`${this.parent()}.appendChild(${wf});`);
        } else {
            this.pending = templateMark(this.ctx, node.exprOffset);
            this.out(`const ${cf}=${helper}(()=>${items},${keyArg},(${params})=>{${body}});`);
            this.out(`${this.parent()}.appendChild(${cf});`);
        }
    }

    /**
     * The computed that holds a loop-invariant read, one per signal and per BLOCK — two @for loops
     * side by side share it instead of each declaring its own, which would fail with `const __li_draft
     * has already been declared`: every line this generator writes lands in the same JS block, so a
     * second declaration of the same name is a syntax error, not a shadow.
     *
     * The name carries the counter for the other direction: a loop nested inside another one writes
     * into its own generator, and if both picked `__li_unit` the outer one's rewrite would reach the
     * inner declaration and turn it into `const __li_unit = computed(() => __li_unit())` — a read of
     * itself, which throws the first time a row renders.
     */
    private hoist(name: string): string {
        const known = this.li.get(name);
        if (known) return known;
        const alias = `__li${this.idx++}_${name}`;
        this.li.set(name, alias);
        this.out(`const ${alias}=computed(()=>ctx.${name}());`);
        return alias;
    }

    letN(node: LetNode): void {
        const expr = callSignals(prefixCtx(node.expr, this.ctx), this.ctx);
        this.out(`ctx.${node.name}=${expr};`);
    }

    switchN(node: SwitchNode): void {
        this.imports.add('match');
        const expr = callSignals(prefixCtx(node.expr, this.ctx), this.ctx);
        const cases = node.cases.map(c => `${jsString(c.value)}:()=>{${this.sub(c.body)}}`);
        if (node.defaultBody) cases.push(`_:()=>{${this.sub(node.defaultBody)}}`);
        const cf = this.v('cf');
        this.out(`const ${cf}=match(()=>${expr},{${cases.join(',')}});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    requireN(node: RequireNode): void {
        this.imports.add('requirePermission');
        const body = this.sub(node.body);
        const els = node.elseBody ? `()=>{${this.sub(node.elseBody)}}` : 'null';
        const cf = this.v('cf');
        this.out(`const ${cf}=requirePermission(${jsQuote(node.permission)},()=>{${body}},${els});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    showN(node: ShowNode): void {
        this.imports.add('show');
        const cond = callSignals(prefixCtx(node.condition, this.ctx), this.ctx);
        const body = this.sub(node.body);
        const cf = this.v('cf');
        this.out(`const ${cf}=show(()=>${cond},(()=>{${body}})());`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    portalN(node: PortalNode): void {
        this.imports.add('portal');
        const body = this.sub(node.body);
        const cf = this.v('cf');
        this.out(`const ${cf}=portal(()=>(()=>{${body}})(),${jsQuote(node.target)});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    deferN(node: DeferNode): void {
        this.imports.add('defer');
        const body = this.sub(node.body);
        const opts: string[] = [`trigger:${jsQuote(node.trigger)}`];
        if (node.placeholder) opts.push(`placeholder:()=>{${this.sub(node.placeholder)}}`);
        if (node.loading) opts.push(`loading:()=>{${this.sub(node.loading)}}`);
        if (node.error) opts.push(`error:()=>{${this.sub(node.error)}}`);
        const cf = this.v('cf');
        this.out(`const ${cf}=defer({${opts.join(',')}},null,()=>{${body}});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    tryN(node: TryNode): void {
        this.imports.add('errorBoundary');
        const body = this.sub(node.body);
        const catchBody = this.sub(node.catchBody);
        const cf = this.v('cf');
        this.out(`const ${cf}=errorBoundary(()=>{${body}},(${node.errorVar},${node.retryVar})=>{${catchBody}});`);
        this.out(`${this.parent()}.appendChild(${cf});`);
    }

    awaitN(node: AwaitNode): void {
        this.imports.add('when');
        // See generateAwait in codegen-template.ts: a promise is waited for, not tested for truth.
        this.imports.add('awaitReady');
        const awaited = callSignals(prefixCtx(node.condition, this.ctx), this.ctx);
        const cond = `awaitReady(${awaited})`;
        const body = this.sub(node.body);
        const loading = node.loading ? `()=>{${this.sub(node.loading)}}` : 'null';
        let switchCall: string;
        if (node.minMs || node.maxMs) {
            this.imports.add('awaitTimed');
            const opts: string[] = [];
            if (node.minMs) opts.push(`minMs:${node.minMs}`);
            if (node.maxMs) opts.push(`maxMs:${node.maxMs}`);
            switchCall = `awaitTimed(()=>${cond},()=>{${body}},${loading},{${opts.join(',')}})`;
        } else {
            switchCall = `when(()=>${cond},()=>{${body}},${loading})`;
        }
        if (node.errorBody) {
            this.imports.add('errorBoundary');
            const errVar = node.errorVar || 'err';
            const errBody = this.sub(node.errorBody);
            const wrap = this.v('cf');
            // The switch is built INSIDE the content function: a boundary that renders its content
            // again (retry, or resetOn) needs a new one, not the fragment the first render emptied.
            // resetOn: a new promise in the awaited expression leaves @error.
            this.out(`const ${wrap}=errorBoundary(()=>{const f=document.createDocumentFragment();f.appendChild(${switchCall});return f;},(${errVar},${node.retryVar ?? 'retry'})=>{${errBody}},{resetOn:()=>${awaited}});`);
            this.out(`${this.parent()}.appendChild(${wrap});`);
        } else {
            const cf = this.v('cf');
            this.out(`const ${cf}=${switchCall};`);
            this.out(`${this.parent()}.appendChild(${cf});`);
        }
    }

    // ─── Custom Directives ──────────────────────────────────────

    customDirectiveN(node: CustomDirectiveNode): void {
        if (this.ctx.customDirectiveHandlers?.has(node.name)) {
            const handler = this.ctx.customDirectiveHandlers.get(node.name)!;
            const bodyCode = `(()=>{${this.sub(node.body)}})()`;
            const generated = handler.generate(node.expr, bodyCode, this.imports);
            const cf = this.v('cf');
            this.out(`const ${cf}=(()=>{${generated}})();`);
            this.out(`if(${cf} instanceof Node)${this.parent()}.appendChild(${cf});`);
        }
        // Unknown directives: silently skip (consistent with template codegen fallback comment)
    }

    // ─── Build Output ─────────────────────────────────────────

    build(): string {
        const body = this.lines.map(l => '    ' + l).join('\n');
        return `(() => {\n    const __frag = document.createDocumentFragment();\n${body}\n    return __frag;\n  })()`;
    }
}
