// Tagged template literal html`` → DOM with reactive bindings.
// Supports: text interpolation, @event(.mod), :prop, ::twoWay.
// Template caching: same template strings → reuse parsed HTMLTemplateElement.
// Importable without a DOM; calling html`` needs one (#93).

import { effect } from '../reactivity/signal';
import { setProp } from './dom';
import { placePartNode } from './part-nodes';
import { sanitizeBoundUrl } from '../security/sanitize-url';
import type { Signal } from '../utils/types';

// Properties whose value becomes a navigable/fetchable URL — a runtime-controlled value
// (API/user data) must never be assigned raw (`javascript:`, `//evil.com`). Lowercased.
// NOTE: `data` is intentionally EXCLUDED — it is an overloaded property name (grids, charts,
// lists pass arrays/objects via :data) and is only a URL on the native <object> element.
// Treating it as a URL stringifies the bound value (`[object Object],…`), breaking data binding.
const URL_PROPS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

const isBrowser = typeof document !== 'undefined';

// Placeholder must survive innerHTML parsing — no null bytes (browsers strip \u200B).
// Text placeholder for ATTRIBUTE values (comments aren't valid in attributes).
const PLACEHOLDER = '\u200BPDX';
// Comment placeholder for TEXT CONTENT — survives innerHTML in table context
// (text nodes inside <tbody> get moved by the parser, comment nodes don't).
const COMMENT_PH_PREFIX = 'pdx-';

type TemplateValue = unknown;

// Cache: TemplateStringsArray identity → parsed HTMLTemplateElement
const templateCache = new WeakMap<TemplateStringsArray, HTMLTemplateElement>();

// Pre-compiled regex (avoid re-creating per call)
const PH_REGEX = new RegExp(`(${escapeRegex(PLACEHOLDER)}\\d+\u200B)`, 'g');
const PH_EXTRACT = new RegExp(`${escapeRegex(PLACEHOLDER)}(\\d+)\u200B`);
const COMMENT_PH_RE = new RegExp(`^${COMMENT_PH_PREFIX}(\\d+)$`);

/**
 * Tagged template literal that produces reactive DOM. It needs a DOM: where there is none it throws,
 * naming the call, instead of returning something that is not a fragment. Module evaluation never
 * calls it, so a module that uses it still imports.
 */
export function html(strings: TemplateStringsArray, ...values: TemplateValue[]): DocumentFragment {
    if (!isBrowser) {
        throw new Error('html`` needs a DOM; it was called in an environment without one (Node, a build tool)');
    }

    let tpl = templateCache.get(strings);
    if (!tpl) {
        // Build raw HTML with context-aware placeholders:
        // - Inside tag (attribute context) → text placeholder (comments invalid in attrs)
        // - Outside tag (content) → comment placeholder (survives innerHTML table parsing)
        let raw = strings[0];
        let cumulative = strings[0];
        // An incremental scanner: the mini-parser's state advances chunk by chunk instead
        // of re-scanning the cumulative string from scratch for every interpolation
        // (re-scanning is O(n²) on the first parse of large templates).
        const tagState: TagScanState = { inTag: false, inQuote: false, quoteChar: '', pos: 0 };
        advanceTagState(cumulative, tagState);
        for (let i = 0; i < values.length; i++) {
            if (tagState.inTag) {
                raw += `${PLACEHOLDER}${i}\u200B`;
            } else {
                raw += `<!--${COMMENT_PH_PREFIX}${i}-->`;
            }
            raw += strings[i + 1];
            cumulative += strings[i + 1];
            advanceTagState(cumulative, tagState);
        }
        tpl = document.createElement('template');
        raw = expandSelfClosingTags(raw);

        // Table context fix: if the template starts with <tr, <td, <th, or <caption,
        // wrap in <table><tbody> so innerHTML parses table elements correctly.
        // The browser strips these elements when they're outside table context.
        const trimmed = raw.trimStart().toLowerCase();
        const needsTableContext = /^<(tr|td|th|caption|col|colgroup|thead|tbody|tfoot)[\s>]/.test(trimmed);
        if (needsTableContext) {
            // The host must be the element this fragment's own parent WOULD be. A <tbody> is the
            // right context for <tr> and for the section elements, but NOT for a bare cell: the
            // parser allows only <tr> inside <tbody> and drops a <td>/<th>, leaving its text
            // behind. A bare <col> is dropped anywhere but inside <colgroup>. Both are named in
            // the regex above as supported, so each gets the host that keeps it.
            const wrapper = document.createElement('table');
            let host: HTMLElement;
            if (/^<(td|th)[\s>]/.test(trimmed)) {
                const tbody = document.createElement('tbody');
                host = document.createElement('tr');
                tbody.appendChild(host);
                wrapper.appendChild(tbody);
            } else if (/^<col[\s>]/.test(trimmed)) {
                host = document.createElement('colgroup');
                wrapper.appendChild(host);
            } else {
                host = document.createElement('tbody');
                wrapper.appendChild(host);
            }
            host.innerHTML = raw;
            // Move children into template content
            while (host.firstChild) {
                tpl.content.appendChild(host.firstChild);
            }
        } else {
            tpl.innerHTML = raw;
        }
        templateCache.set(strings, tpl);
    }

    const frag = tpl.content.cloneNode(true) as DocumentFragment;

    // Hydrate attributes — scan all elements for placeholder values
    hydrateAttributes(frag, values);
    // Hydrate comment nodes — replace <!--pdx-N--> with reactive bindings
    hydrateComments(frag, values);
    // Hydrate text nodes — find and replace placeholder text (attribute fallback)
    hydrateText(frag, values);

    return frag;
}

/** The HTML void elements: no content, no closing tag. `<x />` of any other is expanded. */
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * `<x … />` of a non-void element → `<x …></x>`, as the compiler does for .pdx templates. The HTML
 * parser does not honour `/>` there: it opens the element, and what follows becomes its child — a
 * component then renders its own content and the child is gone. Run once per template: the parsed
 * template is cached.
 *
 * One left-to-right scan, each character read once: quoted attribute values are skipped whole, so a
 * `/>` or `>` inside one is not the end of the tag. It was a regex whose attribute part and trailing
 * whitespace competed for the same characters, and which re-scanned to the end from every `<` after
 * an unclosed quote — seconds on a 100 KB template (#67).
 */
function expandSelfClosingTags(markup: string): string {
    let out = '';
    let copied = 0;
    let i = markup.indexOf('<');
    while (i !== -1) {
        let end = i + 1;
        if (!isAsciiLetter(markup.charCodeAt(end))) { i = markup.indexOf('<', end); continue; }
        while (end < markup.length && isTagNameChar(markup.charCodeAt(end))) end++;
        const name = markup.slice(i + 1, end);
        // To the `>` that closes the tag, a quoted value read as one unit.
        let quote = '';
        let close = end;
        for (; close < markup.length; close++) {
            const c = markup[close];
            if (quote) { if (c === quote) quote = ''; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
        }
        if (close >= markup.length) break; // an unterminated tag: the rest is left as it is
        if (markup[close - 1] === '/' && close - 1 >= end && !VOID_ELEMENTS.has(name.toLowerCase())) {
            out += markup.slice(copied, i) + `<${name}${markup.slice(end, close - 1).trimEnd()}></${name}>`;
            copied = close + 1;
        }
        i = markup.indexOf('<', close + 1);
    }
    return out + markup.slice(copied);
}

/** `[A-Za-z]`, by character code. */
function isAsciiLetter(c: number): boolean {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/** `[\w-]`, by character code: what may follow the first letter of a tag name. */
function isTagNameChar(c: number): boolean {
    return isAsciiLetter(c) || (c >= 48 && c <= 57) || c === 95 || c === 45;
}

/** Walk all elements, find attributes with placeholders, bind values. */
function hydrateAttributes(root: DocumentFragment, values: TemplateValue[]): void {
    const els = root.querySelectorAll('*');
    for (let e = 0; e < els.length; e++) {
        const el = els[e];
        for (const attr of Array.from(el.attributes)) {
            const firstMatch = attr.value.match(PH_EXTRACT);
            if (!firstMatch) continue;
            const key = attr.name;
            const attrValue = attr.value;
            el.removeAttribute(key);

            // Check if attribute is PURE placeholder (no static text around it)
            // Pure: exactly one placeholder, nothing else
            const purePh = attrValue.match(new RegExp(`^${escapeRegex(PLACEHOLDER)}(\\d+)\u200B$`));
            if (purePh) {
                // Single placeholder — bind directly (existing behavior)
                bindAttribute(el, key, values[parseInt(purePh[1])]);
            } else {
                // Mixed static + dynamic content — concatenate parts reactively
                // Split attribute value into static and placeholder segments
                const segments = attrValue.split(PH_REGEX);
                const hasFunctions = segments.some(seg => {
                    const m = seg.match(PH_EXTRACT);
                    return m && typeof values[parseInt(m[1])] === 'function';
                });

                if (hasFunctions) {
                    // At least one reactive value — create reactive concatenation
                    const buildString = () => {
                        return segments.map(seg => {
                            const m = seg.match(PH_EXTRACT);
                            if (m) {
                                const v = values[parseInt(m[1])];
                                return typeof v === 'function' ? String((v as () => unknown)() ?? '') : String(v ?? '');
                            }
                            return seg;
                        }).join('');
                    };
                    bindAttribute(el, key, buildString);
                } else {
                    // All static — just concatenate and set once
                    const str = segments.map(seg => {
                        const m = seg.match(PH_EXTRACT);
                        return m ? String(values[parseInt(m[1])] ?? '') : seg;
                    }).join('');
                    bindAttribute(el, key, str);
                }
            }
        }
    }
}

/** Walk text nodes, find placeholders, replace with reactive bindings. */
function hydrateText(root: DocumentFragment, values: TemplateValue[]): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toProcess: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        if (node.data.includes(PLACEHOLDER)) toProcess.push(node);
    }
    for (let i = 0; i < toProcess.length; i++) {
        replaceTextNode(toProcess[i], values);
    }
}

/** Walk comment nodes, find <!--pdx-N--> placeholders, replace with reactive bindings. */
function hydrateComments(root: DocumentFragment, values: TemplateValue[]): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const toProcess: Comment[] = [];
    let node: Comment | null;
    while ((node = walker.nextNode() as Comment | null)) {
        if (node.data.startsWith(COMMENT_PH_PREFIX)) toProcess.push(node);
    }
    for (const comment of toProcess) {
        const m = comment.data.match(COMMENT_PH_RE);
        if (!m) continue;
        const idx = parseInt(m[1]);
        replaceCommentNode(comment, values[idx]);
    }
}

/** Replace a comment placeholder with static or reactive content. */
function replaceCommentNode(comment: Comment, value: TemplateValue): void {
    const parent = comment.parentNode!;
    if (typeof value === 'function') {
        // Reactive binding — comment becomes anchor for dynamic content
        const anchor = document.createTextNode('');
        parent.insertBefore(anchor, comment);
        parent.removeChild(comment);
        let currentNodes: Node[] = [anchor];

        effect(() => {
            const result = (value as () => unknown)();
            // Remove all current nodes except the anchor (first)
            for (let i = 1; i < currentNodes.length; i++) {
                currentNodes[i].parentNode?.removeChild(currentNodes[i]);
            }
            const newNodes = toNodes(result);
            const ref = currentNodes[0];
            // Use ref.parentNode (live parent in DOM), NOT the captured `parent`
            // (which may be the original DocumentFragment, now empty after appendTo DOM)
            const liveParent = ref.parentNode;
            if (!liveParent) { currentNodes = [ref]; return; }
            if (newNodes.length === 0) {
                if (ref instanceof Text) ref.data = '';
                currentNodes = [ref];
            } else if (newNodes.length === 1 && newNodes[0] instanceof Text && ref instanceof Text) {
                ref.data = (newNodes[0] as Text).data;
                currentNodes = [ref];
            } else {
                const refNext = ref.nextSibling;
                liveParent.removeChild(ref);
                for (const n of newNodes) placePartNode(liveParent, n, refNext);
                currentNodes = newNodes;
            }
        });
    } else {
        // Static value — insert nodes and remove comment
        const nodes = toNodes(value);
        for (const n of nodes) parent.insertBefore(n, comment);
        parent.removeChild(comment);
    }
}

/** The tag/quote/comment mini-parser's state for the incremental scan. */
interface TagScanState {
    inTag: boolean;
    inQuote: boolean;
    quoteChar: string;
    /** The next index to scan in the cumulative string. */
    pos: number;
}

/**
 * Advances the parser's state from state.pos to the end of str. The same semantics as the
 * old isInsideTag (quote-aware, comment-skip), but incremental: every character
 * is visited once over the whole template. A comment not yet closed
 * leaves pos parked at its start: the next chunk tries again with more text.
 */
function advanceTagState(str: string, s: TagScanState): void {
    let j = s.pos;
    for (; j < str.length; j++) {
        const c = str[j];
        if (s.inQuote) {
            if (c === s.quoteChar) s.inQuote = false;
            continue;
        }
        if (c === '"' || c === "'") {
            if (s.inTag) { s.inQuote = true; s.quoteChar = c; }
            continue;
        }
        // Skip comment (if it closes within the available text; otherwise retry on the next chunk)
        if (c === '<' && str[j + 1] === '!' && str[j + 2] === '-' && str[j + 3] === '-') {
            const endIdx = str.indexOf('-->', j + 4);
            if (endIdx >= 0) { j = endIdx + 2; continue; }
            s.pos = j;
            return;
        }
        if (c === '<') s.inTag = true;
        if (c === '>') s.inTag = false;
    }
    s.pos = j;
}

// ─── Attribute Binding (shared by fast and fallback paths) ─────────

/** Bind a single attribute by prefix routing. */
function bindAttribute(el: Element, key: string, value: TemplateValue): void {
            if (key.startsWith('::')) {
                // Two-way binding: ::value=${signal}, ::value.trim.lazy=${signal}
                bindTwoWay(el, key.slice(2), value);
            } else if (key === ':ref') {
                // Element reference: :ref=${refSignal}
                bindRef(el, value);
            } else if (key === ':show') {
                // Show/hide: :show=${() => bool}
                bindShow(el as HTMLElement, value);
            } else if (key.startsWith(':class.')) {
                // Class toggle: :class.active=${() => bool}
                bindClassToggle(el, key.slice(7), value);
            } else if (key.startsWith(':style.')) {
                // Style property: :style.color=${() => value}
                bindStyleProp(el as HTMLElement, key.slice(7), value);
            } else if (key.startsWith(':')) {
                // Property binding: :disabled=${expr}
                bindProperty(el, key.slice(1), value);
            } else if (key.startsWith('@')) {
                // Event binding: @click.prevent=${handler}
                bindEvent(el, key.slice(1), value);
            } else if (typeof value === 'function') {
                // Reactive attribute (backward-compat)
                effect(() => {
                    setProp(el, key, (value as () => unknown)());
                });
            } else {
                setProp(el, key, value);
            }
}

// ─── Property Binding (:attr) ──────────────────────────────────────

// Map HTML attribute names to DOM property names where they differ
const ATTR_TO_PROP: Record<string, string> = {
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

/** What a reactive property binding has written before its first write: nothing, not `undefined`. */
const UNWRITTEN = Symbol('unwritten');

/** Convert kebab-case to camelCase: item-template → itemTemplate */
function kebabToCamel(s: string): string {
    return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** One-way property binding. Sets JS property on element. */
/**
 * Can this property be ASSIGNED, or is it a bare getter?
 *
 * Consulted when a binding clears to null/undefined on a custom element: a component
 * installs its prop setters in `connectedCallback`, so before the upgrade the same name is a getter
 * with no setter and assigning throws. And once per binding on an SVG element, whose
 * SVGAnimated* properties are getters only. Both run when a binding is set up or a value goes away,
 * not on every render, so walking the prototype chain is cheap.
 */
function hasSetter(el: Element, prop: string): boolean {
    for (let o: object | null = el; o; o = Object.getPrototypeOf(o)) {
        const d = Object.getOwnPropertyDescriptor(o, prop);
        if (d) return typeof d.set === 'function' || d.writable === true;
    }
    return false;
}

/**
 * Assign a bound value to a property.
 *
 * A component installs its prop accessors when it connects, and a template binds while it builds the
 * fragment, before that. Most names are then simply absent, and assigning leaves an own data
 * property that the component takes over as a pre-upgrade value. A name the DOM also has as a bare
 * getter — `offsetTop` on pdx-affix, `prefix` on pdx-input — is not absent: assigning reaches the
 * native getter and throws "which has only a getter". On a custom element that value is defined as
 * the element's own data property instead, the same thing the plain assignment leaves for any other
 * name.
 *
 * The prototype walk runs only while the element has no own property of that name, which after the
 * component's setup it always has. The inline build calls this too, for a component's props.
 */
export function assignBoundProperty(el: Element, prop: string, value: unknown): void {
    if (el.tagName.includes('-') && !Object.prototype.hasOwnProperty.call(el, prop) && !hasSetter(el, prop)) {
        Object.defineProperty(el, prop, { value, writable: true, configurable: true, enumerable: true });
        return;
    }
    (el as unknown as Record<string, unknown>)[prop] = value;
}

/**
 * A bound value went to null or undefined on a PLAIN element's property `prop`, bound as `attr`.
 * What "no value" means follows the type the property holds, as Vue's `patchDOMProp` does:
 *
 * - boolean (`checked`, `disabled`) → false;
 * - string (`value`, `textContent`, `title`) → '' and the attribute goes. Removing the attribute
 *   alone leaves live state on screen: a field's `value` and a node's text are not their attribute;
 * - anything else — a number (`maxLength`, `tabIndex`), an object (`style`) → the attribute goes, and
 *   nothing is assigned: `maxLength = null` coerces to 0, a field that takes no characters, and
 *   `style = null` does not clear the inline style everywhere (happy-dom keeps it).
 *
 * The inline build calls this too, so both builds clear a property the same way.
 */
export function clearBoundProperty(el: Element, attr: string, prop: string): void {
    const target = el as unknown as Record<string, unknown>;
    const type = typeof target[prop];
    if (type === 'boolean') target[prop] = false;
    else if (type === 'string') { target[prop] = ''; el.removeAttribute(attr); }
    else el.removeAttribute(attr);
}

function bindProperty(el: Element, prop: string, value: TemplateValue): void {
    // Attribute or property?
    //
    // aria-* and data-* are always attributes. Beyond those, "everything else is a camelCase prop
    // the compiler normalized" is only true of a CUSTOM ELEMENT, which declares such props. On a
    // plain element a hyphenated name can ONLY be an attribute — a hyphen cannot appear in a
    // JavaScript identifier — so `:pdx-theme="t"` on a <div> set as `el.pdxTheme` would vanish:
    // invisible in the DOM, matched by no selector, logged nowhere.
    //
    // The discriminator is the ELEMENT, not the name, and deliberately not `camel in el`: bindings
    // run when the template is instantiated, which can precede the auto-import that upgrades a
    // component, so asking whether the property exists would answer "no" for a component that does
    // declare it and stringify an object into an attribute. A tag containing `-` is a custom
    // element by definition, and that fact does not depend on timing.
    // Convert kebab-case to camelCase for JS property access (compiler emits kebab for HTML safety)
    const camel = ATTR_TO_PROP[prop] ?? kebabToCamel(prop);
    const isCustomElement = el.tagName.includes('-');
    // An SVG element keeps its state in attributes. Its DOM properties of the same names — `width`,
    // `x`, `href`, `className` — are read-only SVGAnimated* views, and `camel in el` is true for them,
    // so the property path would assign and throw "which has only a getter" in every browser.
    // happy-dom does not model them, so no core test can see it; the Chromium check is
    // svg-bound-attributes.spec.ts. A property SVG CAN assign — `textContent`, `style` — keeps the
    // property path.
    const svgReadOnly = el.namespaceURI === SVG_NS && !hasSetter(el, camel);
    // On a PLAIN element the property set is fixed at parse time, so asking is safe and catches the
    // no-hyphen cases too: `itemprop` is not a DOM property either, and would disappear the same
    // way `pdx-theme` would.
    const useAttr = svgReadOnly || prop.startsWith('aria-') || prop.startsWith('data-')
        || (!isCustomElement && !(camel in el));
    const resolved = useAttr ? prop : camel;

    // Special case: :class must MERGE with static class="..." from HTML, not replace it. Written
    // through classList, not `className`: on SVG that is an SVGAnimatedString, not a string.
    //
    // The binding owns only the classes it wrote: on each value it removes the previous value's and
    // adds the new one's. Rewriting the whole attribute as static + dynamic would drop a class that
    // `:class.x` had turned on, on the next `:class` change, with its condition still true.
    // A dynamic class that is also in the static class is never removed.
    if (camel === 'className') {
        const staticTokens = new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
        let written: string[] = [];
        const writeClass = (raw: unknown) => {
            const next = String(raw ?? '').split(/\s+/).filter(Boolean);
            for (const t of written) if (!next.includes(t) && !staticTokens.has(t)) el.classList.remove(t);
            for (const t of next) el.classList.add(t);
            written = next;
        };
        if (typeof value === 'function') effect(() => writeClass((value as () => unknown)()));
        else writeClass(value);
        return;
    }

    if (typeof value === 'function') {
        // The value this binding wrote last. The effect re-runs when anything it READ changes — the
        // row object a field comes from, replaced after another field's save — and writing the prop
        // again with the value it had already written is wrong. The component may have moved its own
        // prop on since (an input being typed in), and the re-run would put the stale value back over
        // it: a name being typed would go back to the saved one, and its rename would be lost.
        // A binding writes when ITS value changes.
        let written: unknown = UNWRITTEN;
        effect(() => {
            const v = (value as () => unknown)();
            if (Object.is(v, written)) return;
            written = v;
            if (useAttr) {
                if (v == null || v === false) el.removeAttribute(prop);
                else if (URL_PROPS.has(prop.toLowerCase())) setUrlAttribute(el, prop, v);
                else el.setAttribute(prop, v === true ? '' : String(v));
            } else if (v == null) {
                if (isCustomElement && hasSetter(el, resolved)) {
                    // A component's props are signal-backed, and the branches above wrote this one as
                    // a PROPERTY. Removing the attribute leaves that property — and the signal behind
                    // it — holding the previous value, so "the value went away" would be the one
                    // transition that never propagates: a `:error` binding could raise a message and
                    // never take it back. Assign, so the signal sees the change.
                    (el as unknown as Record<string, unknown>)[resolved] = v;
                } else if (!isCustomElement) {
                    // Plain element: cleared by the property's type. Assigning null coerces —
                    // `maxLength = null` becomes 0 — and removing the attribute alone leaves a
                    // field's `value` on screen.
                    clearBoundProperty(el, prop, resolved);
                } else {
                    // A component with no setter YET, and that is not a fallback that hides anything:
                    // prop setters are installed in `connectedCallback`, so before the upgrade the
                    // property is a bare getter and assigning throws ("Cannot set property form ...
                    // which has only a getter"). The value it would have carried is null, and the
                    // upgrade reads the attributes anyway.
                    el.removeAttribute(prop);
                }
            } else if (URL_PROPS.has(resolved.toLowerCase())) {
                const safe = sanitizeBoundUrl(el, resolved, v);
                if (safe == null) el.removeAttribute(prop);
                else assignBoundProperty(el, resolved, safe);
            } else if (resolved === 'style') {
                setInlineStyle(el, v);
            } else {
                assignBoundProperty(el, resolved, v);
            }
        });
    } else {
        if (useAttr) {
            if (value == null || value === false) el.removeAttribute(prop);
            else if (URL_PROPS.has(prop.toLowerCase())) setUrlAttribute(el, prop, value);
            else el.setAttribute(prop, value === true ? '' : String(value));
        } else if (value == null) {
            el.removeAttribute(prop);
        } else if (URL_PROPS.has(resolved.toLowerCase())) {
            const safe = sanitizeBoundUrl(el, resolved, value);
            if (safe == null) el.removeAttribute(prop);
            else assignBoundProperty(el, resolved, safe);
        } else if (resolved === 'style') {
            setInlineStyle(el, value);
        } else {
            assignBoundProperty(el, resolved, value);
        }
    }
}

/**
 * A URL name that lands as an attribute — `xlink:href`, which no element has as a property, or a
 * URL name on an element that lacks it — gets the same sanitising as the property side. The
 * attribute branch runs first, and writing the raw value there would let `:xlink:href="javascript:…"`
 * on an SVG link reach the DOM.
 */
function setUrlAttribute(el: Element, prop: string, value: unknown): void {
    const safe = sanitizeBoundUrl(el, prop, value);
    if (safe == null) el.removeAttribute(prop);
    else el.setAttribute(prop, safe);
}

/**
 * `:style="…"` writes `style.cssText`, which is what a browser does with `el.style = "…"`
 * ([PutForwards=cssText], HTML and SVG alike). Assigning the property would rely on that forwarding,
 * and throw in an environment where `style` is a bare getter — happy-dom, for SVG.
 */
function setInlineStyle(el: Element, value: unknown): void {
    (el as HTMLElement).style.cssText = String(value);
}

// ─── Element Reference (:ref) ──────────────────────────────────────

/** Bind a ref signal to an element — sets signal value to the element. */
function bindRef(el: Element, value: TemplateValue): void {
    const sig = value as Signal<unknown>;
    if (typeof sig === 'function' && typeof sig.set === 'function') {
        sig.set(el);
    }
}

// ─── Show/Hide (:show) ────────────────────────────────────────────

/** Toggle display:none based on reactive condition. Preserves DOM (unlike when/if). */
function bindShow(el: HTMLElement, value: TemplateValue): void {
    if (typeof value === 'function') {
        effect(() => {
            el.style.display = (value as () => unknown)() ? '' : 'none';
        });
    } else {
        el.style.display = value ? '' : 'none';
    }
}

// ─── Class Toggle (:class.name) ───────────────────────────────────

/** Toggle a single CSS class reactively. */
function bindClassToggle(el: Element, className: string, value: TemplateValue): void {
    if (typeof value === 'function') {
        effect(() => {
            el.classList.toggle(className, !!(value as () => unknown)());
        });
    } else {
        el.classList.toggle(className, !!value);
    }
}

// ─── Style Property (:style.prop) ─────────────────────────────────

/** Set a single CSS property reactively. */
function bindStyleProp(el: HTMLElement, prop: string, value: TemplateValue): void {
    if (typeof value === 'function') {
        effect(() => {
            el.style.setProperty(prop, String((value as () => unknown)() ?? ''));
        });
    } else {
        el.style.setProperty(prop, String(value ?? ''));
    }
}

// ─── Two-Way Binding (::attr) ──────────────────────────────────────

/** Two-way binding with optional modifiers (.trim, .number, .lazy). */
function bindTwoWay(el: Element, descriptor: string, value: TemplateValue): void {
    const sig = value as Signal<unknown>;
    if (typeof sig !== 'function' || typeof sig.set !== 'function') {
        bindProperty(el, descriptor.split('.')[0], value);
        return;
    }

    // Parse modifiers: "value.trim.lazy" → prop="value", mods={trim, lazy}
    const parts = descriptor.split('.');
    // Convert kebab-case prop to camelCase for JS property access
    const prop = kebabToCamel(parts[0]);
    const mods = new Set(parts.slice(1));

    // Forward: signal → DOM property
    effect(() => {
        (el as unknown as Record<string, unknown>)[prop] = sig();
    });

    const applyValue = (raw: unknown): void => {
        let val = raw;
        if (mods.has('trim') && typeof val === 'string') val = val.trim();
        if (mods.has('number')) val = Number(val) || 0;
        sig.set(val);
    };

    // Custom elements (pdx-*) don't emit `pdx-<prop>` and may not write the property back;
    // they emit `pdx-input` (live) / `pdx-change` (committed) carrying the value in
    // e.detail. Listen to those and read the payload — a `pdx-<prop>` listener never
    // fires, and ::value/::checked would be silently one-way on every component.
    if (el.tagName.includes('-')) {
        const onEvt = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            let raw: unknown;
            if (detail && typeof detail === 'object' && prop in (detail as object)) {
                raw = (detail as Record<string, unknown>)[prop];
            } else if (detail && typeof detail === 'object' && 'value' in (detail as object)) {
                raw = (detail as Record<string, unknown>).value;
            } else {
                raw = (el as unknown as Record<string, unknown>)[prop];
            }
            applyValue(raw);
        };
        const events = mods.has('lazy') ? ['pdx-change'] : ['pdx-input', 'pdx-change'];
        for (const ev of events) el.addEventListener(ev, onEvt);
        return;
    }

    // Native elements: read the property on the appropriate DOM event.
    const eventName = mods.has('lazy') ? 'change' : resolveTwoWayEvent(el, prop);
    el.addEventListener(eventName, () => {
        applyValue((el as unknown as Record<string, unknown>)[prop]);
    });
}

/** Determine the appropriate event for two-way sync on native elements. */
function resolveTwoWayEvent(el: Element, prop: string): string {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
        return prop === 'checked' ? 'change' : 'input';
    }
    if (tag === 'select') return 'change';
    return `pdx-${prop}`;
}

// ─── Event Binding (@event.modifier) ───────────────────────────────

/** Key modifier → keyboard key mapping. */
const keyMap: Record<string, string | string[]> = {
    enter:  'Enter',
    escape: 'Escape',
    space:  ' ',
    tab:    'Tab',
    delete: ['Delete', 'Backspace'],
    up:     'ArrowUp',
    down:   'ArrowDown',
    left:   'ArrowLeft',
    right:  'ArrowRight',
};

/** Event binding with modifier support (.prevent, .stop, .once, .self, key filters). */
function bindEvent(el: Element, descriptor: string, handler: TemplateValue): void {
    const parts = descriptor.split('.');
    const eventName = parts[0];
    const modifiers = new Set(parts.slice(1));

    // addEventListener options
    const options: AddEventListenerOptions = {};
    if (modifiers.has('once')) options.once = true;
    if (modifiers.has('capture')) options.capture = true;
    if (modifiers.has('passive')) options.passive = true;

    // Fast path: no runtime modifiers needed
    const runtimeMods = new Set(modifiers);
    runtimeMods.delete('once');
    runtimeMods.delete('capture');
    runtimeMods.delete('passive');

    if (runtimeMods.size === 0) {
        el.addEventListener(eventName, handler as EventListener, options);
        return;
    }

    // Wrapped handler with runtime modifiers
    const wrapped = (e: Event) => {
        // .self — only fire if target === currentTarget
        if (runtimeMods.has('self') && e.target !== e.currentTarget) return;

        // Key filters (only for KeyboardEvent)
        if (e instanceof KeyboardEvent) {
            for (const [mod, keys] of Object.entries(keyMap)) {
                if (runtimeMods.has(mod)) {
                    const allowed = Array.isArray(keys) ? keys : [keys];
                    if (!allowed.includes(e.key)) return;
                }
            }
        }

        if (runtimeMods.has('prevent')) e.preventDefault();
        if (runtimeMods.has('stop')) e.stopPropagation();

        (handler as EventListener)(e);
    };

    el.addEventListener(eventName, wrapped, options);
}

// ─── Text Hydration ────────────────────────────────────────────────


/** Split a text node at placeholder boundaries and bind reactive values. */
function replaceTextNode(textNode: Text, values: TemplateValue[]): void {
    const parent = textNode.parentNode!;
    const content = textNode.data;

    const parts = content.split(PH_REGEX);

    for (const part of parts) {
        // Check if this part is a placeholder: extract index
        const phMatch = part.match(new RegExp(`${escapeRegex(PLACEHOLDER)}(\\d+)\u200B`));
        const value = phMatch ? values[parseInt(phMatch[1])] : undefined;

        if (value !== undefined) {
            if (typeof value === 'function') {
                // Reactive text binding
                const anchor = document.createTextNode('');
                parent.insertBefore(anchor, textNode);
                let currentNodes: Node[] = [anchor];

                effect(() => {
                    const result = (value as () => unknown)();

                    // Remove old nodes (except anchor)
                    for (let i = 1; i < currentNodes.length; i++) {
                        currentNodes[i].parentNode?.removeChild(currentNodes[i]);
                    }

                    const newNodes = toNodes(result);
                    const ref = currentNodes[0];

                    if (newNodes.length === 0) {
                        if (ref instanceof Text) ref.data = '';
                        currentNodes = [ref];
                    } else if (newNodes.length === 1 && newNodes[0] instanceof Text && ref instanceof Text) {
                        // Optimize: update text in-place
                        ref.data = (newNodes[0] as Text).data;
                        currentNodes = [ref];
                    } else {
                        // Use the LIVE parent, not the one captured at hydration: after
                        // the append to the DOM the original parent may be the dead fragment
                        // (the same as replaceCommentNode).
                        const refNext = ref.nextSibling;
                        const liveParent = ref.parentNode ?? parent;
                        liveParent.removeChild(ref);
                        for (const n of newNodes) {
                            placePartNode(liveParent, n, refNext);
                        }
                        currentNodes = newNodes;
                    }
                });
            } else {
                // Static value
                const nodes = toNodes(value);
                for (const n of nodes) {
                    parent.insertBefore(n, textNode);
                }
            }
        } else if (part) {
            parent.insertBefore(document.createTextNode(part), textNode);
        }
    }

    parent.removeChild(textNode);
}

// ─── Utilities ─────────────────────────────────────────────────────

/**
 * The text a value renders as when it is interpolated: `null`, `undefined` and `false` are empty text,
 * so `{{ user?.name }}` and `{{ busy && 'Saving…' }}` print nothing rather than a word; anything else
 * is `String(value)`, `0` included.
 *
 * The inline build writes its text nodes through this too, so a page reads the same in dev and in a
 * production build: a plain `String(value)` would show `null` and `false`.
 */
export function interpolationText(value: unknown): string {
    return value == null || value === false ? '' : String(value);
}

function toNodes(value: unknown): Node[] {
    if (value instanceof DocumentFragment) return nonEmpty(Array.from(value.childNodes));
    if (value instanceof Node) return [value];
    if (Array.isArray(value)) return nonEmpty(value.flatMap(toNodes));
    return [document.createTextNode(interpolationText(value))];
}

/**
 * At least one node: an empty text node stands in for nothing. A reactive block keeps its first
 * node as the anchor of the next render, so an empty array or fragment — no nodes — would leave the
 * anchor in place, and after a render of elements the anchor is the first element: `[a]` then `[]`
 * would keep `a` on the page.
 */
function nonEmpty(nodes: Node[]): Node[] {
    return nodes.length ? nodes : [document.createTextNode('')];
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
