// A block's static markup written as HTML (#369) parses, in Chromium, into exactly the tree its DOM
// calls build — node for node, so the walk that reaches the render's nodes by firstChild/nextSibling
// still reaches the same ones.
//
// Every .pdx of the compiler's demo corpus and of the showcase is compiled twice: as it ships, where a
// block the parser keeps is `staticBlock(staticMarkup('<…>'))`, and with `staticMarkup: false`, where
// every block is one DOM call per node. In the page, each builder of the second runs, core's real
// `staticMarkup` runs on the HTML of the first, and the two trees are compared: node types, names,
// namespaces, attributes with their namespaces, text and comment data, and the empty text nodes the
// render binds.
//
// And the rule's excluded cases (compiler/tests/fixtures/static-markup-cases.ts) marked 'differs' do
// parse into another tree: the rule is needed where it says so.
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../../compiler/src/plugin';
import { blockHtml, writeHtml, type MarkupNode } from '../../../../compiler/src/compiler/static-markup-html';
import { EXCLUDED_CASES, KEPT_TABLE_CASES } from '../../../../compiler/tests/fixtures/static-markup-cases';

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function collect(dir: string): string[] {
    const out: string[] = [];
    for (const item of readdirSync(dir)) {
        const full = join(dir, item);
        if (statSync(full).isDirectory()) out.push(...collect(full));
        else if (item.endsWith('.pdx')) out.push(full);
    }
    return out;
}

/** `__blkN` → its builder line, for one compiled module. */
function builders(code: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const line of code.split('\n')) {
        const m = /^const (__blk\d+)=staticBlock\((.*)\);$/.exec(line);
        if (m) out.set(m[1], m[2]);
    }
    return out;
}

interface Pair { where: string; html: string; dom: string }

/** Every block of the corpus that ships as HTML, with the DOM calls the same block compiles to. */
function corpusPairs(): { pairs: Pair[]; domOnly: number } {
    const pairs: Pair[] = [];
    let domOnly = 0;
    for (const root of [join(PACKAGES, 'compiler/demo'), join(PACKAGES, 'showcase/src')]) {
        for (const file of collect(root)) {
            const rel = relative(PACKAGES, file).replace(/\\/g, '/');
            const source = readFileSync(file, 'utf8');
            const shipped = builders(compile(source, rel).code);
            const calls = builders(compile(source, rel, undefined, undefined, { staticMarkup: false }).code);
            for (const [name, builder] of shipped) {
                const m = /^staticMarkup\(('(?:[^'\\]|\\.)*')\)$/.exec(builder);
                if (!m) { domOnly++; continue; }
                const dom = /^\(__frag,__d\)=>\{(.*)\}$/.exec(calls.get(name) ?? '');
                expect(dom, `${rel} ${name}: no DOM builder to compare with: ${(calls.get(name) ?? 'none').slice(0, 200)}`).toBeTruthy();
                pairs.push({ where: `${rel} ${name}`, html: new Function(`return ${m[1]};`)() as string, dom: dom![1] });
            }
        }
    }
    return { pairs, domOnly };
}

/** The model of a fixture, built with DOM calls in the page: what the HTML would have to give back. */
type Fixture = { name: string; tree: MarkupNode; html: string };

test.describe('static markup written as HTML', () => {
    test('parses into the tree its DOM calls build, for every block of the corpus', async ({ page }) => {
        const { pairs, domOnly } = corpusPairs();
        expect(pairs.length, 'no block of the corpus is written as HTML: nothing is compared').toBeGreaterThan(500);
        await goToScenario(page, 'button-variants', 'neutral', { page: scenarioPage['button-variants'] });
        const domModule = `/@fs/${join(PACKAGES, 'core/src/renderer/dom.ts').replace(/\\/g, '/')}`;
        const mismatches = await page.evaluate(async ({ pairs, domModule }) => {
            const { staticMarkup } = await import(/* @vite-ignore */ domModule);
            const shape = (n: Node): unknown => {
                if (n.nodeType === 3 || n.nodeType === 8) return [n.nodeType, (n as CharacterData).data];
                const e = n as Element;
                const attrs = e.attributes
                    ? Array.from(e.attributes).map((a) => [a.namespaceURI, a.name, a.value]).sort((x, y) => String(x[1]).localeCompare(String(y[1])))
                    : [];
                return [n.nodeType, n.nodeName, e.namespaceURI ?? null, attrs, Array.from(n.childNodes).map(shape)];
            };
            const out: string[] = [];
            for (const p of pairs) {
                const a = document.createElement('template');
                new Function('__frag', '__d', p.dom)(a.content, a.content.ownerDocument);
                const b = document.createElement('template');
                staticMarkup(p.html)(b.content, b.content.ownerDocument);
                const sa = JSON.stringify(shape(a.content));
                const sb = JSON.stringify(shape(b.content));
                if (sa !== sb) out.push(`${p.where}\n  DOM : ${sa.slice(0, 400)}\n  HTML: ${sb.slice(0, 400)}`);
            }
            return out;
        }, { pairs, domModule });
        expect(mismatches, `blocks whose HTML parses into another tree (${pairs.length} compared, ${domOnly} kept their DOM calls)`).toEqual([]);
    });

    test('the excluded cases marked "differs" do parse into another tree', async ({ page }) => {
        await goToScenario(page, 'button-variants', 'neutral', { page: scenarioPage['button-variants'] });
        const fixtures: Fixture[] = EXCLUDED_CASES.filter((c) => c.parses === 'differs')
            .map((c) => ({ name: c.name, tree: c.tree, html: writeHtml(c.tree) }));
        const same = await page.evaluate((fixtures) => {
            const SVG = 'http://www.w3.org/2000/svg';
            const build = (n: MarkupNode, parent: Node, d: Document): void => {
                if (n.kind === 'text') { parent.appendChild(d.createTextNode(n.data ?? '')); return; }
                if (n.kind === 'anchor') { parent.appendChild(d.createTextNode('')); return; }
                if (n.kind === 'comment') { parent.appendChild(d.createComment(n.data ?? '')); return; }
                if (n.kind !== 'element') { for (const k of n.kids) build(k, parent, d); return; }
                const e = n.svg ? d.createElementNS(SVG, n.tag!) : d.createElement(n.tag!);
                for (const [name, value] of n.attrs ?? []) e.setAttribute(name, value);
                parent.appendChild(e);
                for (const k of n.kids) build(k, e, d);
            };
            const shape = (n: Node): unknown => {
                if (n.nodeType === 3 || n.nodeType === 8) return [n.nodeType, (n as CharacterData).data];
                const e = n as Element;
                const attrs = e.attributes ? Array.from(e.attributes).map((a) => [a.namespaceURI, a.name, a.value]) : [];
                return [n.nodeType, n.nodeName, e.namespaceURI ?? null, attrs, Array.from(n.childNodes).map(shape)];
            };
            const out: string[] = [];
            for (const f of fixtures) {
                const a = document.createElement('template');
                build(f.tree, a.content, a.content.ownerDocument);
                const b = document.createElement('template');
                b.innerHTML = f.html;
                if (JSON.stringify(shape(a.content)) === JSON.stringify(shape(b.content))) out.push(f.name);
            }
            return out;
        }, fixtures);
        expect(same, 'excluded as "differs", yet the parse gives the same tree').toEqual([]);
    });

    // Table content written as HTML (#435), in the shapes the corpus may not have: each parsed by core's
    // staticMarkup gives back the tree its DOM calls build.
    test('the table shapes the rule keeps parse into the tree their DOM calls build', async ({ page }) => {
        await goToScenario(page, 'button-variants', 'neutral', { page: scenarioPage['button-variants'] });
        const kept = KEPT_TABLE_CASES.map((c) => ({ name: c.name, tree: c.tree, html: blockHtml(c.tree) }));
        expect(kept.filter((c) => c.html === null).map((c) => c.name), 'the rule no longer keeps these').toEqual([]);
        const domModule = `/@fs/${join(PACKAGES, 'core/src/renderer/dom.ts').replace(/\\/g, '/')}`;
        const differ = await page.evaluate(async ({ kept, domModule }) => {
            const { staticMarkup } = await import(/* @vite-ignore */ domModule);
            const build = (n: MarkupNode, parent: Node, d: Document): void => {
                if (n.kind === 'text') { parent.appendChild(d.createTextNode(n.data ?? '')); return; }
                if (n.kind === 'anchor') { parent.appendChild(d.createTextNode('')); return; }
                if (n.kind === 'comment') { parent.appendChild(d.createComment(n.data ?? '')); return; }
                if (n.kind !== 'element') { for (const k of n.kids) build(k, parent, d); return; }
                const e = d.createElement(n.tag!);
                for (const [name, value] of n.attrs ?? []) e.setAttribute(name, value);
                parent.appendChild(e);
                for (const k of n.kids) build(k, e, d);
            };
            const shape = (n: Node): unknown => {
                if (n.nodeType === 3 || n.nodeType === 8) return [n.nodeType, (n as CharacterData).data];
                const e = n as Element;
                const attrs = e.attributes ? Array.from(e.attributes).map((a) => [a.namespaceURI, a.name, a.value]) : [];
                return [n.nodeType, n.nodeName, e.namespaceURI ?? null, attrs, Array.from(n.childNodes).map(shape)];
            };
            const out: string[] = [];
            for (const c of kept) {
                const a = document.createElement('template');
                build(c.tree, a.content, a.content.ownerDocument);
                const b = document.createElement('template');
                staticMarkup(c.html!)(b.content, b.content.ownerDocument);
                const sa = JSON.stringify(shape(a.content));
                const sb = JSON.stringify(shape(b.content));
                if (sa !== sb) out.push(`${c.name}\n  DOM : ${sa}\n  HTML: ${sb}`);
            }
            return out;
        }, { kept, domModule });
        expect(differ, 'kept as HTML, yet the parse gives another tree').toEqual([]);
    });
});
