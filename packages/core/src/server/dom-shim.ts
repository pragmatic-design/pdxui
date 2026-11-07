// The server's DOM (#160): the few classes a component needs to be constructed and to run its setup and
// render in Node, where static generation renders a route. Ours, with no dependency, as small as it can
// be: an element's attributes, classList, dataset and inline style, inert event listeners, and a
// customElements registry. No `document`, no `window`, no tree: a component that reaches for them in
// setup or render fails there, and the server renders it as an empty host and reports it — browser
// work belongs in onMount, which the server never runs.
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

/** An element: its attributes, and what is computed from them. Never in a tree, never connected. */
class ServerHTMLElement extends ServerEventTarget {
    private readonly attrs = new Map<string, string>();
    readonly classList = new ServerTokenList(this);
    readonly style = new ServerStyle(this);
    readonly isConnected = false;
    readonly parentNode = null;
    readonly parentElement = null;
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
