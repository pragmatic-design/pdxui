// Every component page teaches its use, and its examples name only what the component has.
//
// A props table tells an agent what `pdx-form` accepts and never shows one used. Each component has a page,
// `pdxui-<area>/references/<tag>.md`, whose examples are the sections of the component's demo.
//
// Those examples are the demo's `Source` blocks, written by hand beside the live markup, and
// can drift from it: comp-select's block drops the live `label="Color"`. What makes a copied
// example fail is a prop or an event the component does not have, so that is what is checked, against
// custom-elements.json and the events the sources emit.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { discoverComponentPackages } from '../../compiler/src/discover-component-packages.mjs';

const REPO = join(__dirname, '..', '..', '..');
const SKILLS = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills');
const UI_SRC = join(REPO, 'packages', 'ui', 'src');
const AREAS = ['data', 'display', 'forms', 'infra', 'inputs', 'layout', 'navigation', 'overlay'];

interface Decl { tagName: string; attributes?: { name: string }[]; members?: { kind: string; name: string; attribute?: string }[]; events?: { name: string }[] }
// Every component package's manifest, as the catalogue reads them: the router's examples are checked
// against its manifest like the library's.
const decls = new Map<string, Decl>();
for (const p of discoverComponentPackages(undefined, REPO)) {
    const cem = JSON.parse(readFileSync(p.manifest, 'utf-8')) as { modules: { declarations?: Decl[] }[] };
    for (const m of cem.modules) for (const d of m.declarations ?? []) if (d.tagName) decls.set(d.tagName, d);
}

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/** Every spelling a binding of this component may take, and every event it dispatches. */
function surface(tag: string): { props: Set<string>; events: Set<string> } {
    const d = decls.get(tag)!;
    const props = new Set<string>();
    for (const a of d.attributes ?? []) props.add(a.name.toLowerCase());
    for (const m of d.members ?? []) {
        if (m.kind !== 'field') continue;
        props.add(m.name.toLowerCase()); props.add(kebab(m.name));
        if (m.attribute) props.add(m.attribute.toLowerCase());
    }
    const events = new Set((d.events ?? []).map(e => e.name));
    const dir = join(UI_SRC, tag.slice(4));
    if (existsSync(dir)) for (const f of readdirSync(dir).filter(n => n.endsWith('.ts'))) {
        for (const m of readFileSync(join(dir, f), 'utf-8').matchAll(/emit\(\s*'(pdx-[\w-]+)'/g)) events.add(m[1]);
    }
    return { props, events };
}

/** Attributes every element takes, and what the template language adds. */
const GLOBAL = /^(class|style|id|slot|key|ref|role|title|tabindex|hidden|part|lang|dir|name|value|disabled|placeholder|type|href|src|alt|for|autofocus|inert|draggable|data-[\w-]+|aria-[\w-]+|show|if|class\.[\w-]+|style\.[\w-]+)$/;
/** DOM events a listener on any element may take. */
const DOM_EVENT = /^(click|dblclick|input|change|submit|keydown|keyup|keypress|focus|blur|focusin|focusout|mouseenter|mouseleave|mouseover|mouseout|mousedown|mouseup|pointerdown|pointerup|pointermove|contextmenu|scroll|wheel|touchstart|touchend|dragstart|dragend|drop|dragover|load|error|toggle|close|cancel|resize)$/;

interface Finding { page: string; tag: string; attr: string }

/** The opening tags of pdx components in one ```html block, with their attribute names. */
function openingTags(code: string): { tag: string; attrs: string[] }[] {
    const out: { tag: string; attrs: string[] }[] = [];
    for (const m of code.matchAll(/<(pdx-[a-z0-9-]+)((?:\s+(?:"[^"]*"|'[^']*'|[^\s>"'/]|\/(?!>))+)*)\s*\/?>/g)) {
        const attrs = [...m[2].matchAll(/([:@.]{0,2}[A-Za-z_$][\w.:$-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g)].map(a => a[1]);
        out.push({ tag: m[1], attrs });
    }
    return out;
}

function findings(): { pages: number; blocks: number; tags: number; bad: Finding[] } {
    const bad: Finding[] = [];
    let pages = 0, blocks = 0, tags = 0;
    for (const area of AREAS) {
        const dir = join(SKILLS, `pdxui-${area}`, 'references');
        for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
            pages++;
            const text = readFileSync(join(dir, f), 'utf-8').replace(/\r\n/g, '\n');
            const examples = text.slice(text.indexOf('#### Examples'));
            for (const b of examples.matchAll(/^```html\n([\s\S]*?)^```$/gm)) {
                blocks++;
                for (const { tag, attrs } of openingTags(b[1])) {
                    // Not a library component: an example's own (`pdx-my-widget`), whose props are its own.
                    if (!decls.has(tag)) continue;
                    tags++;
                    const s = surface(tag);
                    for (const raw of attrs) {
                        const isEvent = raw.startsWith('@');
                        const name = raw.replace(/^[:@.]+/, '');
                        if (isEvent) {
                            // `@pdx-change.once`: the event is the part before any modifier.
                            const ev = name.split('.')[0];
                            if (!s.events.has(ev) && !DOM_EVENT.test(ev)) bad.push({ page: f, tag, attr: raw });
                            continue;
                        }
                        // `:class.active` and `:style.width` are template bindings; any other `.x` is a modifier.
                        if (GLOBAL.test(name.toLowerCase())) continue;
                        const base = name.split('.')[0];
                        if (s.props.has(base.toLowerCase()) || s.props.has(kebab(base))) continue;
                        bad.push({ page: f, tag, attr: raw });
                    }
                }
            }
        }
    }
    return { pages, blocks, tags, bad };
}

describe('the component pages', () => {
    const result = findings();

    it('found pages, examples and component tags — an extractor that reads nothing cannot pass', () => {
        expect(result.pages).toBeGreaterThanOrEqual(115);
        expect(result.blocks).toBeGreaterThan(500);
        expect(result.tags).toBeGreaterThan(500);
    });

    it('EVERY component page has at least one example', () => {
        const empty: string[] = [];
        for (const area of AREAS) {
            const dir = join(SKILLS, `pdxui-${area}`, 'references');
            for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
                const examples = readFileSync(join(dir, f), 'utf-8').split('#### Examples')[1] ?? '';
                if (!/^```(html|js)$/m.test(examples)) empty.push(f);
            }
        }
        expect(empty, 'these components have no example').toEqual([]);
    });

    it('NO example binds a prop or listens to an event its component does not have', () => {
        expect(result.bad.map(b => `${b.page}: <${b.tag} ${b.attr}>`)).toEqual([]);
    });

    it('an example reads as the reader writes it: no `@@` escape, no bare tag in a title', () => {
        // `@@try` is how a demo's template writes a literal `@try`; copied from the page it is not the
        // directive. And a title `**<pdx-error-boundary> — …**` loses its tag to the Markdown renderer.
        const wrong: string[] = [];
        for (const area of AREAS) {
            const dir = join(SKILLS, `pdxui-${area}`, 'references');
            for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
                const examples = readFileSync(join(dir, f), 'utf-8').replace(/\r\n/g, '\n').split('#### Examples')[1] ?? '';
                if (examples.includes('@@')) wrong.push(`${f}: @@`);
                for (const l of examples.split('\n').filter(x => x.startsWith('**'))) {
                    if (/<[a-z][\w-]*[\s>]/.test(l.replace(/`[^`]*`/g, ''))) wrong.push(`${f}: ${l.slice(0, 60)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('no element hides in a script fence, where its props go unchecked', () => {
        // `import …; const ds = …;` then `<pdx-select :source="ds" …>` was one ```js fence: the check
        // above reads ```html only, so the element's props were never compared.
        const hidden: string[] = [];
        for (const area of AREAS) {
            const dir = join(SKILLS, `pdxui-${area}`, 'references');
            for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
                const examples = readFileSync(join(dir, f), 'utf-8').replace(/\r\n/g, '\n').split('#### Examples')[1] ?? '';
                for (const b of examples.matchAll(/^```js\n([\s\S]*?)^```$/gm)) {
                    const el = /^<pdx-[a-z0-9-]+/m.exec(b[1]);
                    if (el) hidden.push(`${f}: ${el[0]}`);
                }
            }
        }
        expect(hidden).toEqual([]);
    });

    it('the reader can fail', () => {
        const [t] = openingTags('<pdx-select :options="x" nosuchprop @pdx-nope="f" label="L" />');
        expect(t.tag).toBe('pdx-select');
        expect(t.attrs).toEqual([':options', 'nosuchprop', '@pdx-nope', 'label']);
        const s = surface('pdx-select');
        expect(s.props.has('options')).toBe(true);
        expect(s.props.has('nosuchprop')).toBe(false);
        expect(s.events.has('pdx-change')).toBe(true);
    });
});
