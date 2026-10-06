// __PDX_DEVTOOLS__ v1: what an agent driving a browser can ask a running app.
//
// A console inspector built for a person returns live DOM nodes from `componentTree()`, maps no
// component to its state, and only counts errors. This is the versioned, JSON-serialisable
// surface, available from page load in development with no level change.
import { describe, it, expect, afterEach } from 'vitest';
import { component, html, signal, computed, safeHandler } from '../src/index';

interface TreeNode { id: number; tag: string; file?: string; children: TreeNode[] }
interface Inspected {
    id: number; tag: string; file?: string;
    props: Record<string, unknown>; state: Record<string, unknown>; deriveds: Record<string, unknown>;
}
interface Api {
    v: number;
    tree(): TreeNode[];
    inspect(target: number | Element | string): Inspected | null;
    errors(): { time: number; tag?: string; file?: string; source: string; message: string; stack?: string }[];
    route(): unknown;
    navigations(): unknown[];
    stores(): unknown[];
    connect(hook: { emit(event: string, payload: unknown): void }): () => void;
}
const api = (): Api => (window as unknown as { __PDX_DEVTOOLS__: Api }).__PDX_DEVTOOLS__;

const TAG = 'pdx-807-counter';
// What the compiler emits for `@prop label`, `let count = $signal(0)` and a `$derived`, in dev.
component(TAG, {
    file: 'src/pages/counter.pdx',
    props: { label: { type: String, default: '' } },
    setup() {
        const __count = signal(0, { name: 'counter:count' });
        const doubled = computed(() => __count() * 2, { name: 'counter:doubled' });
        return { count: __count, doubled };
    },
    render: (ctx) => html`<p>${() => (ctx as unknown as { label: () => string }).label()}</p>`,
});

const mounted: Element[] = [];
function mount(label: string, parent: Element = document.body): HTMLElement {
    const el = document.createElement(TAG);
    el.setAttribute('label', label);
    parent.appendChild(el);
    mounted.push(el);
    return el;
}
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

function find(nodes: TreeNode[], tag: string): TreeNode[] {
    return nodes.flatMap((n) => [...(n.tag === tag ? [n] : []), ...find(n.children, tag)]);
}

describe('__PDX_DEVTOOLS__ v1', () => {
    it('says its version', () => {
        expect(api().v).toBe(1);
    });

    it('tree() lists each instance with its own id, its tag and its file', () => {
        mount('A');
        mount('B');
        const nodes = find(api().tree(), TAG);
        expect(nodes).toHaveLength(2);
        expect(nodes[0].id).not.toBe(nodes[1].id);
        expect(nodes[0].file).toBe('src/pages/counter.pdx');
    });

    it('tree() nests a component inside another, and is JSON', () => {
        const outer = mount('outer');
        const inner = document.createElement(TAG);
        outer.appendChild(inner);
        const tree = api().tree();
        expect(() => JSON.stringify(tree)).not.toThrow();
        expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
        const node = find(tree, TAG).find((n) => n.children.length > 0);
        expect(node?.children[0].tag).toBe(TAG);
    });

    it('inspect(id) gives the props, the setup signals and the deriveds of THAT instance', () => {
        mount('A');
        const b = mount('B');
        const idOfB = find(api().tree(), TAG)[1].id;
        (b as unknown as { label: string }).label = 'B2';
        const info = api().inspect(idOfB);
        expect(info).toMatchObject({ id: idOfB, tag: TAG, file: 'src/pages/counter.pdx' });
        expect(info?.props).toEqual({ label: 'B2' });
        expect(info?.state).toEqual({ count: 0 });
        expect(info?.deriveds).toEqual({ doubled: 0 });
    });

    it('inspect takes an element or a selector as well', () => {
        const el = mount('Z');
        expect(api().inspect(el)?.props).toEqual({ label: 'Z' });
        expect(api().inspect(TAG)?.tag).toBe(TAG);
        expect(api().inspect('#nothing-here')).toBeNull();
    });

    it('a value that is not JSON is described, within bounds', () => {
        const el = mount('X') as unknown as Record<string, unknown>;
        const cyclic: Record<string, unknown> = { name: 'loop' };
        cyclic.self = cyclic;
        const big = Array.from({ length: 80 }, (_v, i) => i);
        function onSave(): void {}
        el.label = { node: document.body, fn: onSave, big, cyclic };
        const info = api().inspect(el as unknown as Element);
        const label = info?.props.label as Record<string, unknown>;
        expect(label.node).toBe('<body>');
        expect(label.fn).toBe('[function onSave]');
        expect((label.big as unknown[]).length).toBe(51);
        expect((label.big as unknown[])[50]).toBe('…30 more');
        expect(() => JSON.stringify(info)).not.toThrow();
    });

    it('errors() records a handler that threw, with its component and file', () => {
        const handler = safeHandler(() => { throw new Error('save failed'); }, TAG, 'click');
        const quiet = console.error;
        console.error = () => {};
        try { handler(); } finally { console.error = quiet; }
        const last = api().errors().at(-1);
        expect(last).toMatchObject({ tag: TAG, file: 'src/pages/counter.pdx', source: 'handler', message: 'save failed' });
        expect(typeof last?.time).toBe('number');
    });

    it('errors() records an error nothing in the runtime caught, as global', () => {
        window.dispatchEvent(new ErrorEvent('error', { error: new Error('nobody caught me'), message: 'nobody caught me' }));
        expect(api().errors().at(-1)).toMatchObject({ source: 'global', message: 'nobody caught me' });
    });

    it('errors() records a setup that threw, as setup, once', () => {
        const tag = 'pdx-807-broken-setup';
        component(tag, { setup() { throw new Error('setup broke'); }, render: () => html`<p></p>` });
        const quiet = console.error;
        console.error = () => {};
        const broken = document.createElement(tag);
        mounted.push(broken);
        try { document.body.appendChild(broken); } finally { console.error = quiet; }
        const mine = api().errors().filter((e) => e.message === 'setup broke');
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ source: 'setup', tag });
    });

    it('errors() keeps the last 50', () => {
        const quiet = console.error;
        console.error = () => {};
        try {
            for (let i = 0; i < 60; i++) safeHandler(() => { throw new Error(`e${i}`); }, TAG, 'click')();
        } finally { console.error = quiet; }
        const errors = api().errors();
        expect(errors).toHaveLength(50);
        expect(errors.at(-1)?.message).toBe('e59');
    });

    it('connect() takes several listeners, and a mount names the instance', () => {
        const a: unknown[] = [];
        const b: unknown[] = [];
        const offA = api().connect({ emit: (event, payload) => { if (event === 'component:mount') a.push(payload); } });
        const offB = api().connect({ emit: (event, payload) => { if (event === 'component:mount') b.push(payload); } });
        const el = mount('C');
        offA();
        offB();
        const id = api().inspect(el)?.id;
        expect(a).toContainEqual({ tag: TAG, id });
        expect(b).toContainEqual({ tag: TAG, id });
    });

    it('stores() and navigations() are there, as JSON', () => {
        expect(Array.isArray(api().stores())).toBe(true);
        expect(Array.isArray(api().navigations())).toBe(true);
        expect(() => JSON.stringify(api().route())).not.toThrow();
    });
});
