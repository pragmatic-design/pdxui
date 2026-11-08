// The server's DOM (#160): the few classes a component needs to be constructed and to run its setup and
// render in Node, where static generation renders a route. Ours, with no dependency, as small as it can
// be: an element's attributes, classList, dataset and inline style, inert event listeners, a
// customElements registry, a host's parent (the host it was rendered in, for provide/inject) and a
// frame that never comes. No `document`, no `window`, no tree of nodes: a component that reaches for
// them in setup or render fails there, and a static build stops on it — browser work belongs in
// onMount, which the server never runs.
//
// Installed as globals BEFORE the app's modules are imported, so `PdxElement` extends this HTMLElement
// and `component()` registers its class here. It imports nothing of core for that reason.

const tagOf = new WeakMap<object, string>();

class ServerEventTarget {
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean { return true; }
}

/** The fragment html`` hands back while rendering to a string: nothing is ever put in it. */
class ServerDocumentFragment extends ServerEventTarget {
    readonly childNodes: readonly unknown[] = [];
}

class ServerEvent {
    readonly type: string;
    readonly bubbles: boolean;
    readonly cancelable: boolean;
    readonly composed: boolean;
    defaultPrevented = false;
    constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean; composed?: boolean } = {}) {
        this.type = type;
        this.bubbles = init.bubbles ?? false;
        this.cancelable = init.cancelable ?? false;
        this.composed = init.composed ?? false;
    }
    preventDefault(): void { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation(): void {}
    stopImmediatePropagation(): void {}
}

class ServerCustomEvent<T = unknown> extends ServerEvent {
    readonly detail: T | null;
    constructor(type: string, init: { detail?: T; bubbles?: boolean; cancelable?: boolean; composed?: boolean } = {}) {
        super(type, init);
        this.detail = init.detail ?? null;
    }
}

/** An element's `class` attribute as a token list. */
class ServerTokenList {
    constructor(private readonly el: ServerHTMLElement) {}
    private read(): string[] { return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean); }
    private write(tokens: string[]): void { this.el.setAttribute('class', tokens.join(' ')); }
    get value(): string { return this.read().join(' '); }
    get length(): number { return this.read().length; }
    contains(token: string): boolean { return this.read().includes(token); }
    add(...tokens: string[]): void { const t = this.read(); for (const x of tokens) if (!t.includes(x)) t.push(x); this.write(t); }
    remove(...tokens: string[]): void { this.write(this.read().filter((x) => !tokens.includes(x))); }
    toggle(token: string, force?: boolean): boolean {
        const on = force ?? !this.contains(token);
        if (on) this.add(token); else this.remove(token);
        return on;
    }
}

/** An element's `style` attribute as declarations, in the order they were set. */
class ServerStyle {
    constructor(private readonly el: ServerHTMLElement) {}
    private read(): Map<string, string> { return parseStyle(this.el.getAttribute('style') ?? ''); }
    private write(decls: Map<string, string>): void {
        const text = [...decls].map(([k, v]) => `${k}: ${v};`).join(' ');
        if (text) this.el.setAttribute('style', text); else this.el.removeAttribute('style');
    }
    get cssText(): string { return this.el.getAttribute('style') ?? ''; }
    set cssText(text: string) { this.write(parseStyle(text)); }
    getPropertyValue(name: string): string { return this.read().get(name) ?? ''; }
    setProperty(name: string, value: string | null): void {
        const d = this.read();
        if (value === null || value === '') d.delete(name); else d.set(name, String(value));
        this.write(d);
    }
    removeProperty(name: string): string { const d = this.read(); const v = d.get(name) ?? ''; d.delete(name); this.write(d); return v; }
}

/**
 * An element: its attributes, and what is computed from them. Never in a document, never connected —
 * but a component host has a parent, the host whose content it was rendered in (`setServerParent`),
 * so a component finds what an ancestor provides (provide/inject) as it does in the browser.
 */
class ServerHTMLElement extends ServerEventTarget {
    private readonly attrs = new Map<string, string>();
    readonly classList = new ServerTokenList(this);
    readonly style = new ServerStyle(this);
    readonly isConnected = false;
    /** @internal the host this one was rendered in; set by `setServerParent`. */
    _serverParent: ServerHTMLElement | null = null;
    get parentNode(): ServerHTMLElement | null { return this._serverParent; }
    get parentElement(): ServerHTMLElement | null { return this._serverParent; }
    /** It holds no nodes: what its render writes is a string, not children. A query finds nothing. */
    querySelector(): null { return null; }
    querySelectorAll(): readonly never[] { return []; }
    /** Itself or the nearest host it was rendered in that matches `selector` — a compound one only. */
    closest(selector: string): ServerHTMLElement | null {
        return closestFrom(this, compoundMatcher(selector));
    }
    /** Itself, or a host rendered inside it. */
    contains(other: unknown): boolean {
        for (let el = other instanceof ServerHTMLElement ? other : null; el; el = el._serverParent) if (el === this) return true;
        return false;
    }
    /** The top of its chain of parents: itself, for an element with none. */
    getRootNode(): ServerHTMLElement {
        return this._serverParent ? this._serverParent.getRootNode() : this;
    }
    readonly childNodes: readonly unknown[] = [];
    readonly firstChild = null;
    readonly namespaceURI = 'http://www.w3.org/1999/xhtml';
    get localName(): string { return tagOf.get(this.constructor) ?? 'div'; }
    get tagName(): string { return this.localName.toUpperCase(); }
    get nodeName(): string { return this.tagName; }
    get dataset(): Record<string, string | undefined> {
        return new Proxy({}, {
            get: (_, key) => (typeof key === 'string' ? this.getAttribute(`data-${toKebab(key)}`) ?? undefined : undefined),
            set: (_, key, value) => { if (typeof key === 'string') this.setAttribute(`data-${toKebab(key)}`, String(value)); return true; },
        });
    }
    getAttribute(name: string): string | null { return this.attrs.get(name.toLowerCase()) ?? null; }
    hasAttribute(name: string): boolean { return this.attrs.has(name.toLowerCase()); }
    setAttribute(name: string, value: unknown): void { this.attrs.set(name.toLowerCase(), String(value)); }
    removeAttribute(name: string): void { this.attrs.delete(name.toLowerCase()); }
    toggleAttribute(name: string, force?: boolean): boolean {
        const on = force ?? !this.hasAttribute(name);
        if (on) this.setAttribute(name, this.getAttribute(name) ?? ''); else this.removeAttribute(name);
        return on;
    }
    getAttributeNames(): string[] { return [...this.attrs.keys()]; }
    get attributes(): Array<{ name: string; value: string }> { return [...this.attrs].map(([name, value]) => ({ name, value })); }
}

type ElementTest = (el: ServerHTMLElement) => boolean;

/** `el` or the nearest of its parents that `matches`. */
function closestFrom(el: ServerHTMLElement | null, matches: ElementTest): ServerHTMLElement | null {
    for (let at = el; at; at = at._serverParent) if (matches(at)) return at;
    return null;
}

/**
 * A matcher for one compound selector — a tag, `[attr]`, `[attr="value"]`, `:not(…)` of those —
 * which is what a component asks `closest()` on its way up (`[lang]:not([lang=""])`). Anything else
 * throws, naming the selector: a query the server cannot answer is reported, never a silent miss.
 */
function compoundMatcher(selector: string): ElementTest {
    const tests: ElementTest[] = [];
    let rest = selector.trim();
    const fail = (): never => {
        throw new Error(`the server DOM cannot match the selector "${selector}": it reads a tag, [attr], [attr="value"] and :not(…) of those`);
    };
    // Match: a tag name at the start. Groups: [1]=the name
    const tag = /^([a-zA-Z][\w-]*)/.exec(rest);
    if (tag) {
        const name = tag[1].toLowerCase();
        tests.push((el) => el.localName === name);
        rest = rest.slice(tag[0].length);
    }
    while (rest) {
        // Match: [name], [name=value], [name="value"], [name='value']. Groups: [1]=name [2]/[3]/[4]=value
        const attr = /^\[\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]/.exec(rest);
        if (attr) {
            const name = attr[1];
            const value = attr[2] ?? attr[3] ?? attr[4];
            tests.push(value === undefined ? (el) => el.hasAttribute(name) : (el) => el.getAttribute(name) === value);
            rest = rest.slice(attr[0].length);
            continue;
        }
        if (rest.startsWith(':not(')) {
            let depth = 0;
            let end = -1;
            for (let i = 4; i < rest.length; i++) {
                if (rest[i] === '(') depth++;
                else if (rest[i] === ')' && --depth === 0) { end = i; break; }
            }
            if (end === -1) fail();
            const inner = compoundMatcher(rest.slice(5, end));
            tests.push((el) => !inner(el));
            rest = rest.slice(end + 1);
            continue;
        }
        fail();
    }
    if (tests.length === 0) fail();
    return (el) => tests.every((t) => t(el));
}

/**
 * An observer whose callback never runs: on the server nothing mutates, resizes or comes into view —
 * a page is written once — so a component that watches its host renders, and watches in the browser.
 */
class ServerObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): never[] { return []; }
}

/** No element is ever in one on the server: `root instanceof ShadowRoot` is false there. */
class ServerShadowRoot {}

/**
 * Make `parent` the parent of `el`, both server elements: the host whose content `el` was rendered
 * in. Elements of another DOM — a test's happy-dom — are left as they are.
 */
export function setServerParent(el: object, parent: object | null): void {
    if (el instanceof ServerHTMLElement) el._serverParent = parent instanceof ServerHTMLElement ? parent : null;
}

/** The registry: a defined class knows its tag, so an element constructed from it does. */
const registry = new Map<string, CustomElementConstructor>();
const serverCustomElements = {
    define(tag: string, ctor: CustomElementConstructor): void {
        if (registry.has(tag)) throw new Error(`the name "${tag}" has already been used with this registry`);
        registry.set(tag, ctor);
        tagOf.set(ctor, tag);
    },
    get(tag: string): CustomElementConstructor | undefined { return registry.get(tag); },
    whenDefined(tag: string): Promise<CustomElementConstructor> {
        const ctor = registry.get(tag);
        return ctor ? Promise.resolve(ctor) : new Promise(() => {});
    },
};

/** `a: 1; b: 2` → its declarations, by property. */
function parseStyle(text: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const decl of text.split(';')) {
        const i = decl.indexOf(':');
        if (i > 0) out.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    }
    return out;
}

function toKebab(s: string): string {
    return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** The globals the server DOM provides, by the name the platform gives them. */
const GLOBALS: Record<string, unknown> = {
    EventTarget: ServerEventTarget,
    HTMLElement: ServerHTMLElement,
    DocumentFragment: ServerDocumentFragment,
    ShadowRoot: ServerShadowRoot,
    MutationObserver: ServerObserver,
    ResizeObserver: ServerObserver,
    IntersectionObserver: ServerObserver,
    // The server paints no frame: work put off to one — the DOM a component touches after its render
    // has landed, the pattern core teaches — does not run here, and runs in the browser, after the
    // page is taken over, as after a mount.
    requestAnimationFrame: (): number => 0,
    cancelAnimationFrame: (): void => {},
    Event: ServerEvent,
    CustomEvent: ServerCustomEvent,
    customElements: serverCustomElements,
};

/**
 * Install the server DOM as globals, each only where the environment has none: Node's own `Event`,
 * `EventTarget` and `CustomEvent` are kept. Call it before importing the app's modules. Idempotent.
 */
export function installServerDom(): void {
    for (const [name, value] of Object.entries(GLOBALS)) {
        if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
}
