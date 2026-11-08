// The render-parity table (#92, #237): each row a .pdx template, what it puts in the page when mounted,
// and what is done to it. Shared by the suites that read it — the client's mount, the server's string
// and the hydration (#160) — with what they need to read it the same way: the normalisation, the
// lazy-load recorder, the plain custom elements some rows bind to.

/** The module a lazily loaded component resolves to here: a name, not a file. */
export const DEFERRED_MODULE = 'virtual:deferred-probe';

/** Every lazy load a compiled module asked for, by specifier — each names the mount that asked. */
export const lazyLoads: string[] = [];

/**
 * What a compiled module's `import()` calls here. The specifier is recorded and the component it
 * stands for is defined: what a row measures is whether its path asks for the load, not whether a
 * bundler can find a file.
 */
export function lazyImport(specifier: string): Promise<unknown> {
    lazyLoads.push(specifier);
    if (!customElements.get('pdx-deferred-probe')) customElements.define('pdx-deferred-probe', class extends HTMLElement {});
    return Promise.resolve({});
}

export interface Row {
    name: string;
    /** The normalised markup the row renders, as the template path rendered it (#237). */
    expected: string;
    /** What `read` returns, as the template path returned it. */
    expectedRead?: unknown;
    template: string;
    script?: string;
    /** Done to the mount before it is compared: a click, an input, a property set. */
    act?: (host: HTMLElement) => void | Promise<void>;
    /** A value read from the mount and compared too — a property the markup does not show. */
    read?: (host: HTMLElement) => unknown;
    /** The issue that owns a known difference from the expectation. */
    owner?: number;
    /**
     * Why the server's string is not the row's expectation (#160): what the client does only after it
     * has mounted — a promise resolved, an enter transition started — or what does not exist on the
     * server. The rule is `owner`'s: a row that comes to match fails, and its reason is removed.
     */
    serverDiffers?: string;
    /**
     * Why the row hydrated (#160) is not its expectation: what a hydration does not do as a mount does.
     * The rule is `owner's`: a row that comes to match fails, and its reason is removed.
     */
    hydrateDiffers?: string;
}

/** The mount a host belongs to: its tag less the `pdx-` prefix, which names the deferred load it asked for. */
export const mountName = (host: HTMLElement) => host.localName.slice(4);

/** Microtasks, then two frames: what a binding, an effect and a deferred render need. */
export async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
}

/**
 * A node's markup with what may vary taken out: comments (a render path places its own markers),
 * whitespace-only text, the `data-pdx-*` scope attribute. Attributes sorted; text with its runs of
 * whitespace collapsed.
 */
export function normal(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ');
        return text.trim() === '' ? '' : text;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const attrs = [...el.attributes]
        .filter((a) => !a.name.startsWith('data-pdx-'))
        .map((a) => (a.name === 'class' ? `class="${a.value.split(/\s+/).filter(Boolean).sort().join(' ')}"` : `${a.name}="${a.value}"`))
        .sort()
        .join(' ');
    const inner = [...el.childNodes].map(normal).join('');
    const tag = el.tagName.toLowerCase();
    return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
}

export const content = (host: HTMLElement) => [...host.childNodes].map(normal).join('').trim();

export const click = (sel: string) => (host: HTMLElement) => { (host.querySelector(sel) as HTMLElement).click(); };

// A plain custom element: what a binding to a component's property and a component's event reach.
export function definePlainElements(): void {
    if (!customElements.get('x-probe')) {
        customElements.define('x-probe', class extends HTMLElement { value: unknown = undefined; });
    }
    if (!customElements.get('x-field')) {
        // A component with no native input: ::value has to listen for its model's event (#124).
        customElements.define('x-field', class extends HTMLElement {
            static models = new Set(['value']);
            private v = '';
            get value() { return this.v; }
            set value(next: string) { this.v = next; this.setAttribute('data-value', String(next)); }
            change(next: string) { this.value = next; this.dispatchEvent(new CustomEvent('value-change', { detail: { value: next } })); }
        });
    }
    if (!customElements.get('x-snip')) {
        // A component that renders the snippet it is given, as `@render row('a', 0)` would (#489).
        customElements.define('x-snip', class extends HTMLElement {
            set row(fn: (v: string, i: number) => Node) { this.replaceChildren(fn('a', 0)); }
        });
    }
}

export const ROWS: Row[] = [
    { name: 'static markup', expected: '<section class="a"><h2 id="t">Title</h2><p>text <b>bold</b></p></section>', template: '<section class="a"><h2 id="t">Title</h2><p>text <b>bold</b></p></section>' },
    { name: '{{ }} text', expected: '<p>3 items</p>', template: '<p>{{ n }} items</p>', script: 'let n = $signal(3);' },
    { name: '{{ }} text after a change', expected: '<p>2</p><button>+</button>', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(1);', act: click('button') },
    { name: ':attr', expected: '<a href="/a" title="T">x</a>', template: '<a :href="url" :title="t">x</a>', script: "let url = $signal('/a'); let t = $signal('T');" },
    { name: ':prop on a custom element', expected: '<x-probe></x-probe>', expectedRead: '{"a":1}', template: '<x-probe :value="v"></x-probe>', script: 'let v = $signal({ a: 1 });', read: (h) => JSON.stringify((h.querySelector('x-probe') as unknown as { value: unknown }).value) },
    { name: ':class with a string', expected: '<p class="yes">x</p>', template: "<p :class=\"on ? 'yes' : 'no'\">x</p>", script: 'let on = $signal(true);' },
    // The inline path wrote class="[object Object]" (#96).
    { name: ':class with an object', expected: '<p class="active">x</p>', template: '<p :class="{ active: on, off: !on }">x</p>', script: 'let on = $signal(true);' },
    { name: ':class with an object beside a static class', expected: '<p class="active base">x</p>', template: '<p class="base" :class="{ active: on }">x</p>', script: 'let on = $signal(true);' },
    // The specialised forms (#112), each after a change, so the update is measured, not the first write.
    { name: ':class conditional, after a change', expected: '<p class="no">x</p><button>t</button>', template: "<p :class=\"on ? 'yes' : 'no'\">x</p><button @click=\"on = !on\">t</button>", script: 'let on = $signal(true);', act: click('button') },
    { name: ':class with &&, after a change', expected: '<p class="">x</p><button>t</button>', template: "<p :class=\"on && 'danger'\">x</p><button @click=\"on = !on\">t</button>", script: 'let on = $signal(true);', act: click('button') },
    { name: ':class with a plain value, after a change', expected: '<p class="b c">x</p><button>t</button>', template: "<p :class=\"name\">x</p><button @click=\"name = 'b c'\">t</button>", script: "let name = $signal('a');", act: click('button') },
    // `false` is no class, in every form (#112): the generic routine wrote class="false".
    { name: ':class with && on a value, after a change', expected: '<p class="base">x</p><button>t</button>', template: "<p class=\"base\" :class=\"on && name\">x</p><button @click=\"on = !on\">t</button>", script: "let on = $signal(true); let name = $signal('a');", act: click('button') },
    { name: ':class beside a static class, after a change', expected: '<p class="b base">x</p><button>t</button>', template: "<p class=\"base\" :class=\"name\">x</p><button @click=\"name = 'b'\">t</button>", script: "let name = $signal('a');", act: click('button') },
    // The inline path assigned the object to el.style, which keeps no colour (#96).
    { name: ':style with an object', expected: '<p style="color: red;">x</p>', template: "<p :style=\"{ color: 'red' }\">x</p>" },
    { name: ':style with an object over a signal', expected: '<p style="color: blue;">x</p>', template: '<p :style="{ color: c }">x</p>', script: "let c = $signal('blue');" },
    { name: '@show over an element', expected: '<p>x</p><p style="display: none;">y</p>', template: '@show (on) { <p>x</p> }@show (!on) { <p>y</p> }', script: 'let on = $signal(true);' },
    { name: '@click', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.once', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click.once="n++">+</button>', script: 'let n = $signal(0);', act: (h) => { click('button')(h); click('button')(h); } },
    { name: '@click.self', expected: '<p>0</p><div><button>in</button></div>', template: '<p>{{ n }}</p><div @click.self="n++"><button>in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.stop', expected: '<p>10</p><div><button>in</button></div>', template: '<p>{{ n }}</p><div @click="n++"><button @click.stop="n = n + 10">in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.prevent', expected: '<a href="#x">a</a><p>true</p>', template: '<a href="#x" @click.prevent="seen = true">a</a><p>{{ seen }}</p>', script: 'let seen = $signal(false);', act: click('a') },
    {
        name: '::value on an <input>', hydrateDiffers: 'the server writes a field\'s value as its attribute, which a mount holds as a property', expected: '<input></input><p>typed</p>', expectedRead: 'typed',
        template: '<input ::value="q"><p>{{ q }}</p>',
        script: "let q = $signal('a');",
        act: (h) => { const i = h.querySelector('input')!; i.value = 'typed'; i.dispatchEvent(new Event('input', { bubbles: true })); },
        read: (h) => h.querySelector('input')!.value,
    },
    {
        name: '::value on a <select>', hydrateDiffers: 'the server writes a field\'s value as its attribute, which a mount holds as a property, and on a <select> it is no attribute (#934)', expected: '<select><option value="a">A</option><option value="b">B</option></select><p>b</p>', expectedRead: 'b',
        template: '<select ::value="s"><option value="a">A</option><option value="b">B</option></select><p>{{ s }}</p>',
        script: "let s = $signal('a');",
        act: (h) => { const s = h.querySelector('select')!; s.value = 'b'; s.dispatchEvent(new Event('change', { bubbles: true })); },
        read: (h) => h.querySelector('select')!.value,
    },
    {
        name: '::value on a component\'s model', expected: '<x-field data-value="b"></x-field><p>b</p>',
        template: '<x-field ::value="v"></x-field><p>{{ v }}</p>',
        script: "let v = $signal('a');",
        act: (h) => { (h.querySelector('x-field') as unknown as { change(v: string): void }).change('b'); },
    },
    { name: '@if / @else', expected: '<p>no</p><button>t</button>', template: '@if (on) { <p>yes</p> } @else { <p>no</p> }<button @click="on = !on">t</button>', script: 'let on = $signal(true);', act: click('button') },
    { name: '@for with track', expected: '<ul><li>a</li><li>b</li></ul>', template: '<ul>@for (items as it; track it.id) { <li>{{ it.label }}</li> }</ul>', script: "let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);" },
    { name: '@for with @empty', expected: '<ul><li>none</li></ul>', template: '<ul>@for (items as it; track it) { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: 'let items = $signal([]);' },
    // The rows' branch again after the empty one: the list is the same block, shown a second time.
    {
        name: '@for with @empty, emptied and filled again', expected: '<ul><li>b</li></ul><button>a</button><button>z</button><button>b</button>',
        template: "<ul>@for (items as it; track it) { <li>{{ it }}</li> } @empty { <li>none</li> }</ul><button @click=\"items = ['a']\">a</button><button @click=\"items = []\">z</button><button @click=\"items = ['b']\">b</button>",
        script: 'let items = $signal([]);',
        act: async (h) => {
            for (const n of [1, 2, 3]) { click(`button:nth-of-type(${n})`)(h); await settle(); }
        },
    },
    // With rows, as the server renders it (#160): the rows' branch is what a build writes.
    { name: '@for with @empty, with rows', expected: '<ul><li>a</li></ul>', template: '<ul>@for (items as it; track it) { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: "let items = $signal(['a']);" },
    // #283: no template-path recording exists — it landed after #238. happy-dom lays nothing out, so
    // the window is the overscan, three rows: all of these. A `ul` is a list: each row says the set's
    // size and its place (#284).
    { name: '@for … @virtual', serverDiffers: 'a virtual list has no server mode yet (#930)', expected: '<ul><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li aria-posinset="1" aria-setsize="3" data-virtual-index="0">a</li><li aria-posinset="2" aria-setsize="3" data-virtual-index="1">b</li><li aria-posinset="3" aria-setsize="3" data-virtual-index="2">c</li><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li></ul>', template: '<ul>@for (items as it; track it) @virtual(20) { <li>{{ it }}</li> }</ul>', script: "let items = $signal(['a', 'b', 'c']);" },
    { name: '@for … @virtual with @empty', serverDiffers: 'a virtual list has no server mode yet (#930)', expected: '<ul><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li>none</li></ul>', template: '<ul>@for (items as it; track it) @virtual { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: 'let items = $signal([]);' },
    // Whitespace between table-internal elements renders nothing and is not emitted (#111): the read
    // counts the text nodes inside the table that are not in a cell.
    {
        name: '@for rows in a table, spaced', expected: '<table><tbody><tr><td>1</td><td>a</td></tr><tr><td>2</td><td>b</td></tr></tbody></table>', expectedRead: 0,
        template: '<table>\n  <tbody>\n    @for (items as it; track it.id) {\n      <tr> <td>{{ it.id }}</td> <td>{{ it.label }}</td> </tr>\n    }\n  </tbody>\n</table>',
        script: "let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);",
        read: (h) => [...h.querySelectorAll('table, tbody, tr')].reduce((n, el) => n + [...el.childNodes].filter(c => c.nodeType === 3 && c.textContent !== '').length, 0),
    },
    // Events inside a @for are delegated to one listener per type (#113): a row's click, a row's .stop
    // under a handler of the same type, and $event.currentTarget, which is the row, not the component.
    { name: '@for row @click (delegated)', expected: '<p>2</p><ul><li>1</li><li>2</li></ul>', template: '<p>{{ n }}</p><ul>@for (items as it; track it) {<li @click="n = n + it">{{ it }}</li>}</ul>', script: 'let n = $signal(0); let items = $signal([1, 2]);', act: click('li:last-child') },
    { name: '@for row @click.stop under a @click', expected: '<p>1</p><ul><li>1</li></ul>', template: '<p>{{ n }}</p><ul @click="n = n + 10">@for (items as it; track it) {<li @click.stop="n = n + 1">{{ it }}</li>}</ul>', script: 'let n = $signal(0); let items = $signal([1]);', act: click('li') },
    { name: '@for row $event.currentTarget', expected: '<p>LI</p><ul><li><b>1</b></li></ul>', template: '<p>{{ tag }}</p><ul>@for (items as it; track it) {<li @click="tag = $event.currentTarget.tagName"><b>{{ it }}</b></li>}</ul>', script: "let tag = $signal(''); let items = $signal([1]);", act: click('b') },
    // A row's handler is declared once per @for and reads the row from the scope it stores (#375): an
    // inner row's handler still reaches the outer row and the index, a destructured row its names, and
    // a row whose item was replaced reads the new item, as its own closure did.
    {
        name: '@for nested row @click reads the outer row and the index', expected: '<p>b:y:1</p><div><ul><li>x</li></ul></div><div><ul><li>x</li><li>y</li></ul></div>',
        template: "<p>{{ out }}</p>@for (groups as g; track g.id) {<div><ul>@for (g.kids as k, i; track k) {<li @click=\"out = g.id + ':' + k + ':' + i\">{{ k }}</li>}</ul></div>}",
        script: "let out = $signal(''); let groups = $signal([{ id: 'a', kids: ['x'] }, { id: 'b', kids: ['x', 'y'] }]);",
        act: click('div:last-of-type li:last-child'),
    },
    { name: '@for destructured row @click', expected: '<p>2</p><ul><li>a</li><li>b</li></ul>', template: '<p>{{ out }}</p><ul>@for (items as { id, label }; track id) {<li @click="out = id">{{ label }}</li>}</ul>', script: "let out = $signal(0); let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);", act: click('li:last-child') },
    {
        name: '@for row @click after its item is replaced', expected: '<p>new</p><ul><li>new</li></ul><button>replace</button>',
        template: "<p>{{ out }}</p><ul>@for (items as it; track it.id) {<li @click=\"out = it.label\">{{ it.label }}</li>}</ul><button @click=\"items = [{ id: 1, label: 'new' }]\">replace</button>",
        script: "let out = $signal(''); let items = $signal([{ id: 1, label: 'old' }]);",
        act: (h) => { click('button')(h); click('li')(h); },
    },
    // `key === sig` in a @for reads a keyed selector (#117): the selection moves, the rows follow.
    { name: '@for row selected by a keyed selector, after a change', expected: '<ul><li class="">1</li><li class="">2</li><li class="on">3</li></ul>', template: "<ul>@for (items as it; track it) {<li :class=\"it === sel ? 'on' : ''\" @click=\"sel = it\">{{ it }}</li>}</ul>", script: 'let sel = $signal(1); let items = $signal([1, 2, 3]);', act: click('li:last-child') },
    { name: '@switch', expected: '<p>B</p>', template: "@switch (mode) { @case ('a') { <p>A</p> } @case ('b') { <p>B</p> } @default { <p>?</p> } }", script: "let mode = $signal('b');" },
    {
        name: '::checked on a checkbox', expected: '<input type="checkbox"></input><p>true</p>', expectedRead: true,
        template: '<input type="checkbox" ::checked="on"><p>{{ on }}</p>',
        script: 'let on = $signal(false);',
        act: click('input'),
        read: (h) => h.querySelector('input')!.checked,
    },
    // A key filter applies to keyboard events: a click passes it. The inline path applied it to the
    // click too, which never fired (#100).
    { name: '@click.enter', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click.enter="n++">+</button>', script: 'let n = $signal(0);', act: click('button') },
    // The body, once the promise has settled. (The body reads the promise itself, not its value, on
    // both paths: binding the value is #145.)
    { name: '@await', hydrateDiffers: 'the promise resolves after hydrating: the @loading the server wrote gives way to the body', serverDiffers: 'the server writes @loading, the promise not resolved yet', expected: '<p>ready</p>', template: '@await (data) { <p>ready</p> } @loading { <p>…</p> }', script: "let data = $signal(Promise.resolve('done'));" },
    // Two phases (#281): the render waits for `when ( … )`, whatever the prefetch phase does.
    {
        name: '@defer (when (…); prefetch idle), after the condition turns true', expected: '<p>in</p><button>go</button>',
        template: '@defer (when (on); prefetch idle) { <p>in</p> } @placeholder { <p>wait</p> }<button @click="on = true">go</button>',
        script: 'let on = $signal(false);', act: click('button'),
    },
    {
        name: '@defer loads a component used only inside it', expected: '<pdx-deferred-probe></pdx-deferred-probe>', expectedRead: true,
        template: '@defer (immediate) { <pdx-deferred-probe></pdx-deferred-probe> }',
        read: (h) => lazyLoads.some((u) => u.endsWith(`?for=${mountName(h)}`)),
    },
    // A bound value that starts with an object literal (#160): on the server it was written as the body
    // of an arrow, `()=>{ a: 'x' }['a']`, which reads as a block and does not parse.
    { name: ':attr with an object literal first', expected: '<p title="x">t</p>', template: "<p :title=\"{ a: 'x' }['a']\">t</p>" },
    { name: '{{ }} with an object literal first', expected: '<p>x</p>', template: "<p>{{ { a: 'x' }['a'] }}</p>" },
    // @hydrate (#160, part 4d): mounted, the part is live at once. Hydrated, it waits for its trigger;
    // its first event takes it over and runs again, and a value changed meanwhile is the one it shows.
    { name: '@hydrate (idle)', expected: '<p>5</p>', template: '@hydrate (idle) { <p>{{ n }}</p> }', script: 'let n = $signal(5);' },
    {
        name: '@hydrate (interaction), clicked before it is live', expected: '<button>1</button>',
        template: '@hydrate (interaction) { <button @click="n++">{{ n }}</button> }', script: 'let n = $signal(0);', act: click('button'),
    },
    {
        name: '@hydrate (when (…)), taken over after the value changed', expected: '<p>1</p><button>go</button>',
        template: '@hydrate (when (on)) { <p>{{ n }}</p> }<button @click="n++; on = true">go</button>',
        script: 'let on = $signal(false);\nlet n = $signal(0);', act: click('button'),
    },
    {
        name: '@hydrate (timer(…)), before its trigger',
        hydrateDiffers: 'a part not taken over yet stands as the server wrote it: the value changed since does not reach it until its trigger fires',
        expected: '<p>1</p><button>+</button>',
        template: '@hydrate (timer(100000)) { <p>{{ n }}</p> }<button @click="n++">+</button>', script: 'let n = $signal(0);', act: click('button'),
    },
    {
        // A row replaced by a new object whose field kept its value — another field's save landing.
        // The binding writes when ITS value changes, so what the component holds since (a field being
        // typed in) stays. Inline wrote again on every re-run: the showcase's category labels took
        // back the saved name over the one being typed (#44).
        name: ':prop is not written again with the value it already wrote', expected: '<x-probe></x-probe><button>save</button>', expectedRead: 'typed',
        template: '@for (rows as r; track r.id) { <x-probe :value="r.v"></x-probe> }<button @click="rows = [{ id: 1, v: \'saved\', other: 2 }]">save</button>',
        script: "let rows = $signal([{ id: 1, v: 'saved', other: 1 }]);",
        act: (h) => {
            (h.querySelector('x-probe') as unknown as { value: unknown }).value = 'typed';
            click('button')(h);
        },
        read: (h) => (h.querySelector('x-probe') as unknown as { value: unknown }).value,
    },
    { name: '@try / @catch', expected: '<p>caught</p>', template: '@try { <p>{{ boom() }}</p> } @catch (e) { <p>caught</p> }', script: "function boom() { throw new Error('x'); }" },
    // Both paths pass the transition options to when()/each() since #85: the enter classes match.
    { name: '@if with @transition', hydrateDiffers: 'the element the server wrote stays where it is: it does not enter', serverDiffers: 'the client starts an enter transition at mount; the server writes the element as it stays', expected: '<p class="pdx-enter-active pdx-fade">x</p>', template: "@if (on) @transition('fade') { <p>x</p> }", script: 'let on = $signal(true);' },
    { name: '@for with @transition', hydrateDiffers: 'the element the server wrote stays where it is: it does not enter', serverDiffers: 'the client starts an enter transition at mount; the server writes the element as it stays', expected: '<ul><li class="pdx-enter-active pdx-fade">a</li></ul>', template: "<ul>@for (items as it; track it) @transition('fade') { <li>{{ it }}</li> }</ul>", script: "let items = $signal(['a']);" },
    // The inline path read the @let name as a signal and threw at mount (#162).
    { name: '@let', expected: '<p>3</p>', template: '@let total = a + b; <p>{{ total }}</p>', script: 'let a = $signal(1); let b = $signal(2);' },
    { name: 'an interpolated Node', serverDiffers: 'a DOM node the script builds exists on the client only', expected: '<div><em>n</em></div>', template: '<div>{{ node }}</div>', script: "const node = document.createElement('em'); node.textContent = 'n';" },
    { name: 'an interpolated Node in a signal', serverDiffers: 'a DOM node the script builds exists on the client only', expected: '<div><em>n</em></div>', template: '<div>{{ node }}</div>', script: "const el = document.createElement('em'); el.textContent = 'n'; let node = $signal(el);" },
    // The inline path wrote the array as its string, "a,b" (#100).
    { name: 'an interpolated array', expected: '<div>ab</div>', template: '<div>{{ list }}</div>', script: "const list = ['a', 'b'];" },
    { name: 'content inside a component tag', expected: '<x-probe><span>child</span></x-probe>', template: '<x-probe><span>child</span></x-probe>' },
    // The inline path emitted `batchHandler(() => )` for @keepAlive: a module that does not parse (#200).
    // The instance switched away is frozen in a fragment, not hidden in the page (#269).
    {
        name: '<component :is> with @keepAlive', expected: '<x-field></x-field><button>swap</button>',
        template: '<component :is="tag" @keepAlive></component><button @click="tag = tag === \'x-probe\' ? \'x-field\' : \'x-probe\'">swap</button>',
        script: "let tag = $signal('x-probe');",
        act: click('button'),
    },
    // A template literal's `${…}` read a bare name the render does not have: `ReferenceError` at mount (#371).
    {
        name: 'a template literal with a signal in ${…}, after a change', expected: '<p lang="it">x-it</p><button>it</button>',
        template: '<p :lang="`${label}`">{{ `x-${label}` }}</p><button @click="label = `i${\'t\'}`">it</button>',
        script: "let label = $signal('en');", act: click('button'),
    },
    // What `<component :is>` encloses is not rendered, and what follows its closing tag is (#358): the
    // template path put the content beside the component, the inline path dropped it. Recorded as decided.
    {
        name: 'content inside <component :is>', expected: '<x-probe></x-probe><p>after</p>',
        template: '<component :is="tag"><b>inside</b></component><p>after</p>', script: "let tag = $signal('x-probe');",
    },
    // The inline path emitted `const __b = ;` for a binding with no value (#200).
    { name: ':name shorthand', hydrateDiffers: 'the server writes a field\'s value as its attribute, which a mount holds as a property', expected: '<input></input>', expectedRead: 'a', template: '<input :value>', script: "let value = $signal('a');", read: (h) => h.querySelector('input')!.value },
    // The alpha outlet was a literal <slot> element on the inline path, around its default (#200); its
    // beta form is an optional snippet's fallback (#492).
    { name: 'an optional snippet with its fallback', expected: '<em>none</em>', template: '@render cell?.(r) @else { <em>none</em> }', script: '@slot cell?: (row: number);\nlet r = $signal(1);' },
    // A row that is one @if chain returns the chain, with no marker block of its own (#685): the
    // three branches render where the rows are, in their order.
    {
        name: 'an @if chain as a @for row', expected: '<ul><li>a</li><li>b</li><li>c</li></ul>',
        template: "<ul>@for (rows as r; track r.k) { @if (r.t === 'a') { <li>a</li> } @else if (r.t === 'b') { <li>b</li> } @else { <li>c</li> } }</ul>",
        script: "let rows = $signal([{ k: 1, t: 'a' }, { k: 2, t: 'b' }, { k: 3, t: 'c' }]);",
    },
    // A chain is one branch, whenChain (#685): stepped from its first branch through its second to its
    // else, it shows one branch at a time, the current one.
    {
        name: 'an @if chain that switches', expected: '<u>c</u><button>+</button>',
        template: '@if (n === 0) { <b>a</b> } @else if (n === 1) { <i>b</i> } @else { <u>c</u> }<button @click="n++">+</button>',
        script: 'let n = $signal(0);',
        act: async (h) => {
            click('button')(h);
            await new Promise((r) => setTimeout(r, 0));
            click('button')(h);
        },
    },
    // Neither path wired the gesture: on the template path the handler ran once at render and the count
    // read NaN, on the inline path `.left` was a key filter (#99). Swiped left, both count 1.
    {
        name: '@swipe.left', expected: '<div>s</div><p>1</p>',
        template: '<div @swipe.left="n++">s</div><p>{{ n }}</p>',
        script: 'let n = $signal(0);',
        act: (h) => {
            const pad = h.querySelector('div')!;
            pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 10, bubbles: true }));
            pad.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 10, bubbles: true }));
        },
    },
    // A fallback with an interpolation or a block was emitted BESIDE the alpha outlet (#276); the
    // optional snippet's fallback renders it inside, once, on both paths (#492).
    { name: 'an optional snippet whose fallback interpolates', expected: '<div>none Ada</div>', template: '<div>@render row?.(who) @else {none {{ who }}}</div>', script: "@slot row?: (item: string);\nlet who = $signal('Ada');" },
    { name: 'an optional snippet whose fallback is a block', expected: '<div><b>x Ada</b></div>', template: '<div>@render row?.(who) @else { @if (who) { <b>x {{ who }}</b> } }</div>', script: "@slot row?: (item: string);\nlet who = $signal('Ada');" },
    // @show false left a root text node on the page on both paths (#265); both now take it out, and
    // put it back current: hidden, renamed, shown.
    {
        name: '@show false over a root text node', expected: 'Details: Bob<b>x</b><button class="t">t</button><button class="r">r</button>',
        template: "@show (open) { Details: {{ who }} <b>x</b> }<button class=\"t\" @click=\"open = !open\">t</button><button class=\"r\" @click=\"who = 'Bob'\">r</button>",
        script: "let open = $signal(true); let who = $signal('Ann');",
        act: async (h) => {
            click('.t')(h);
            await new Promise((r) => setTimeout(r, 0));
            click('.r')(h);
            await new Promise((r) => setTimeout(r, 0));
            click('.t')(h);
        },
    },
    // Both paths kept the removed element in the ref (#262); both now reset it to null.
    {
        name: ':ref after its @if turns false', expected: '<p>none</p><button>x</button>',
        template: "@if (on) { <input class=\"f\" :ref=\"field\"> }<p>{{ field ? field.className : 'none' }}</p><button @click=\"on = false\">x</button>",
        script: 'let on = $signal(true); let field = $signal(null);',
        act: click('button'),
    },
    // An @name the parser does not know is text on both paths. The divergence #100 names needs a
    // directive a plugin registers; this row keeps the plain case honest.
    { name: 'an unknown @name is text', expected: '<p>a</p>@frobnicate { <p>b</p> }', template: '<p>a</p>@frobnicate { <p>b</p> }' },
    // Typed snippets (#489) came after the template path: these rows record what the one path renders,
    // so a dev server and a build keep rendering the same for them.
    {
        name: '@render of a script @snippet with a template body', expected: '<p><em>hi x</em></p>',
        template: "<p>@render greet('x')</p>", script: '@snippet greet(name) {\n  <em>hi {{ name }}</em>\n}',
    },
    {
        name: '@render row?.(…) @else, with nothing given', expected: '<p><i>none</i></p>',
        template: "<p>@render row?.('x') @else { <i>none</i> }</p>", script: '@slot row?: (v: string);',
    },
    {
        name: '@snippet in a component tag, called by the component', expected: '<x-snip><b>a0</b></x-snip>',
        template: '<x-snip>@snippet row(v, i) { <b>{{ v }}{{ i }}</b> }</x-snip>',
    },
];
