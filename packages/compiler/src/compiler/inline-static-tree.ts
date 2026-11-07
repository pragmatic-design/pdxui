// The static DOM of one block on the inline render path, built once and cloned (#109).
//
// A block — the component's root, an @if branch, an @for row, a @switch case … — is split in two:
//   - its STATIC markup (elements, static attributes and classes, text, and an empty text node where
//     each dynamic thing goes) is built by a module-level builder handed to core's `staticBlock`,
//     which runs it on first use into a <template>'s content: that document has no custom-element
//     registry and loads nothing, so no component constructor runs and no <img> fetches then;
//   - every render imports a copy into the document (`importNode`, which upgrades the components in
//     it) and reaches the nodes the render binds through a WALK, a module-level function of its own
//     that follows `firstChild`/`nextSibling` paths computed here. It is the same walk a future
//     adoption of server markup can run on nodes it did not create.
// The render is left with the dynamic work only: bindings, listeners, and control flow put in place.
//
// The builder is an HTML string parsed once (`staticMarkup`, #369) when the parser keeps the block
// exactly as this tree (static-markup-html.ts says when); one DOM call per node otherwise.

import { blockHtml, htmlLiteral, type MarkupNode } from './static-markup-html';
import { serverTemplate } from './server-template';
import { jsString } from './js-literal';

/** One node of a block's static markup: what the walk needs, and what the HTML form needs. */
interface StaticNode extends MarkupNode {
    /** The variable naming it in the builder, the walk and the render; '' for a node nothing reaches. */
    v: string;
    kids: StaticNode[];
    /** The render binds it: the walk returns it. */
    target: boolean;
    /** Content written between `<component :is>` and its closing tag, which nothing renders (#358). */
    sink?: boolean;
    /** A static text's statement in the builder, rewritten when more text joins it. */
    mk?: number;
    /** Text from `@raw`: kept exactly as written, edges included. */
    verbatim?: boolean;
    /** A hole's value, the expression the server's html`` puts in its place (#160). */
    expr?: string;
    /** An element's bindings on the server, `[name, expression]`: html`` attributes with a value (#160). */
    bound?: Array<[string, string]>;
    /** An anchor an interpolation binds as its text, not one a block takes the place of. */
    text?: boolean;
}

/** The whitespace HTML collapses — not U+00A0, which `&nbsp;` writes to be kept. */
const LEADING_SPACE = /^[ \t\n\r\f]+/;
const TRAILING_SPACE = /[ \t\n\r\f]+$/;
/** Elements whose content is laid out or read as written: their text keeps its edges. */
const VERBATIM_ELEMENTS = new Set(['pre', 'listing', 'textarea', 'plaintext', 'script', 'style']);

/** Where a module's builders and walks go, and the counter that names them. */
export interface TemplateHoists {
    /** Module-level declarations, one per line: `const __blkN=staticBlock(…);`, `const __walkN=…;`. */
    readonly lines: string[];
    count: number;
    /** The `@defer` code loaders hoisted so far, `const __codeN=deferCode(…);` (#685). */
    codes?: number;
}

/** The static markup of one block, as the generator walks it. */
export class StaticTree {
    private readonly root: StaticNode = { kind: 'root', v: '__frag', kids: [], target: false };
    private readonly open: StaticNode[] = [];
    private readonly byVar = new Map<string, StaticNode>();
    /** The builder's statements, in document order. */
    private readonly mk: string[] = [];
    /** The variables the walk returns, in the order the render declared them. */
    private readonly targets: string[] = [];

    /** Inside `<component :is>…</component>`: nothing written here is rendered. */
    discarding(): boolean { return this.open.some((n) => n.sink === true); }

    /** How many elements are open. */
    depth(): number { return this.open.length; }

    private parent(): StaticNode { return this.open[this.open.length - 1] ?? this.root; }

    /** The element the generator is inside, its variable and tag as written; null at the block's top. */
    openElement(): { v: string; tag: string } | null {
        const node = this.open[this.open.length - 1];
        return node?.kind === 'element' && node.tag ? { v: node.v, tag: node.tag } : null;
    }

    private add(node: StaticNode, create: string): void {
        if (this.discarding()) return;
        this.parent().kids.push(node);
        if (node.v) this.byVar.set(node.v, node);
        this.mk.push(node.v
            ? `const ${node.v}=${create};${this.parent().v}.appendChild(${node.v});`
            : `${this.parent().v}.appendChild(${create});`);
    }

    /**
     * A static element named `v`, created by `create` (`__d.createElement('p')`): `tag` as written, in
     * the SVG namespace when `svg`. Opened unless `isVoid`.
     */
    element(v: string, create: string, isVoid: boolean, tag: string, svg: boolean): void {
        const node: StaticNode = { kind: 'element', v, kids: [], target: false, tag, svg, isVoid, attrs: [] };
        this.add(node, create);
        if (!isVoid) this.open.push(node);
    }

    /** The element `v` closes. */
    close(): void { this.open.pop(); }

    /** The content of a dynamic component, until its closing tag: dropped. */
    openSink(): void { this.open.push({ kind: 'sink', v: '', kids: [], target: false, sink: true }); }

    /** A static attribute of the element named `el`, already added. */
    attribute(el: string, name: string, value: string): void {
        if (this.discarding()) return;
        this.byVar.get(el)?.attrs?.push([name, value]);
        this.mk.push(`${el}.setAttribute(${jsString(name)}, ${value === '' ? "''" : jsString(value)});`);
    }

    /**
     * Static text. Text written right after static text joins it: two text nodes side by side are one
     * in a parse, as in dev where the browser parses the markup (#369). The markup splits text where a
     * comment was dropped, or where two fragments meet.
     */
    text(data: string, verbatim = false): void {
        if (this.discarding()) return;
        const parent = this.parent();
        const last = parent.kids[parent.kids.length - 1];
        if (last?.kind === 'text' && last.mk !== undefined) {
            last.data += data;
            if (verbatim) last.verbatim = true;
            this.mk[last.mk] = `${parent.v}.appendChild(__d.createTextNode(${jsString(last.data)}));`;
            return;
        }
        this.add({ kind: 'text', v: '', kids: [], target: false, data, mk: this.mk.length, verbatim }, `__d.createTextNode(${jsString(data)})`);
    }

    /**
     * Whitespace at the start and end of an element's content, and of the block's, is not content
     * (#907, the rule of Svelte 5): the space a source puts between `{` and the markup, or between a
     * tag and its first child, is dropped. Between two nodes it stays, one space. `<pre>`, `<textarea>`
     * and the like keep theirs, and so does `@raw` text; U+00A0 is never whitespace here.
     */
    private trimEdges(node: StaticNode): void {
        if (node.kind === 'element' && node.tag && VERBATIM_ELEMENTS.has(node.tag.toLowerCase())) return;
        const trim = (at: number, re: RegExp): void => {
            const kid = node.kids[at];
            if (kid?.kind !== 'text' || kid.verbatim || kid.mk === undefined) return;
            const data = (kid.data ?? '').replace(re, '');
            if (data === '') {
                node.kids.splice(at, 1);
                this.mk[kid.mk] = '';
                return;
            }
            kid.data = data;
            this.mk[kid.mk] = `${node.v}.appendChild(__d.createTextNode(${jsString(data)}));`;
        };
        trim(0, LEADING_SPACE);
        trim(node.kids.length - 1, TRAILING_SPACE);
        for (const kid of node.kids) if (kid.kind === 'element') this.trimEdges(kid);
    }

    /** A static comment. */
    comment(data: string): void {
        this.add({ kind: 'comment', v: '', kids: [], target: false, data }, `__d.createComment(${jsString(data)})`);
    }

    /**
     * An empty text node named `v` that the render reaches: an interpolation's text (`text`), or the
     * marker a block takes the place of.
     */
    anchor(v: string, text = false): void {
        this.add({ kind: 'anchor', v, kids: [], target: false, text }, `__d.createTextNode('')`);
        this.target(v);
    }

    /**
     * On the server (#160), the place a value goes in content — an interpolation, a block a helper
     * renders — written as a hole of the block's html``, `${expr}`.
     */
    hole(expr: string): void {
        if (this.discarding()) return;
        // No builder statement: the server's html`` is all a hole is written into.
        this.parent().kids.push({ kind: 'hole', v: '', kids: [], target: false, expr });
    }

    /** On the server (#160), a binding of the element named `el`: written `name=${expr}` in its tag. */
    bound(el: string, name: string, expr: string): void {
        if (this.discarding()) return;
        const node = this.byVar.get(el);
        if (node) (node.bound ??= []).push([name, expr]);
    }

    /** The block's markup as an html`` literal, for the server's render (#160). */
    serverLiteral(imports: Set<string>): string {
        this.trimEdges(this.root);
        imports.add('html');
        return serverTemplate(this.root);
    }

    /** The render binds the node named `v`: the walk returns it. */
    target(v: string): void {
        const node = this.byVar.get(v);
        if (!node || node.target) return;
        node.target = true;
        this.targets.push(v);
    }

    /**
     * The lines that start the block's render — a copy of the static markup, and the walk to the
     * nodes it binds — after declaring the builder and the walk in `hoists`.
     */
    prologue(hoists: TemplateHoists, imports: Set<string>, asHtml: boolean, hydrate = false): string[] {
        this.trimEdges(this.root);
        if (this.root.kids.length === 0) {
            if (!hydrate) return ['const __frag=document.createDocumentFragment();'];
            imports.add('hydrationRange');
            return ['const __h=hydrationRange();if(__h)__h.next=__h.at;', 'const __frag=__h?null:document.createDocumentFragment();'];
        }
        const n = hoists.count++;
        // core's staticBlock: built on first use in an inert document, imported per render. The
        // builder is the markup as HTML where the parser keeps it exactly, DOM calls otherwise.
        imports.add('staticBlock');
        const html = asHtml ? blockHtml(this.root) : null;
        if (html !== null) {
            imports.add('staticMarkup');
            hoists.lines.push(`const __blk${n}=staticBlock(staticMarkup(${htmlLiteral(html)}));`);
        } else {
            hoists.lines.push(`const __blk${n}=staticBlock((__frag,__d)=>{${this.mk.join('')}});`);
        }
        if (!hydrate) {
            const lines = [`const __frag=__blk${n}();`];
            if (this.targets.length > 0) {
                hoists.lines.push(`const __walk${n}=${this.walk()};`);
                lines.push(`const [${this.targets.join(',')}]=__walk${n}(__frag);`);
            }
            return lines;
        }
        // Hydrating (#160): the block takes over the range it is handed instead of cloning, when it is
        // handed one, and walks it with the same paths (`hydrationWalk`).
        imports.add('hydrationRange');
        hoists.lines.push(`const __hwalk${n}=${this.hydrationWalk(imports)};`);
        const lines = ['const __h=hydrationRange();', `const __frag=__h?null:__blk${n}();`];
        if (this.targets.length > 0) {
            hoists.lines.push(`const __walk${n}=${this.walk()};`);
            lines.push(`const [${this.targets.join(',')}]=__h?__hwalk${n}(__h):__walk${n}(__frag);`);
        } else {
            lines.push(`if(__h)__hwalk${n}(__h);`);
        }
        return lines;
    }

    /**
     * `(r)=>{…}`, the walk of the server's markup for this block (#160): from `r.at`, the first node of
     * the range it is handed, to every node the render binds — the paths of `walk`, with a value's place
     * the server bracketed counting as one node (core's `skipNode`). Each element it reaches must be the
     * one the template has (`checkNode`); an interpolation's anchor is the text the server wrote
     * (`partText`). It sets `r.next`, the node after the block, before it changes anything.
     */
    private hydrationWalk(imports: Set<string>): string {
        imports.add('skipNode');
        const step = (from: string, count: number): string => {
            let out = from;
            for (let k = 0; k < count; k++) out = `skipNode(${out})`;
            return out;
        };
        const decls: string[] = [`r.next=${step('r.at', this.root.kids.length)};`];
        const reaches = (n: StaticNode): boolean => n.target || n.kids.some(reaches);
        // A component's children are where its slots put them in the server's markup: each reached from
        // the region of its slot (core's `projectedNode`), grouped by `slot` as the server groups them.
        const slotOf = (kid: StaticNode): string => (kid.kind === 'element' ? kid.attrs?.find(([name]) => name === 'slot')?.[1] ?? '' : '');
        const visit = (n: StaticNode, expr: string, top: boolean): void => {
            const projected = n.kind === 'element' && !n.svg && (n.tag ?? '').includes('-');
            let prev: string | null = null;
            let prevAt = -1;
            // In a component: the last child reached in each slot's group, and the counts so far.
            const lastIn = new Map<string, { v: string; at: number }>();
            const countIn = new Map<string, number>();
            n.kids.forEach((kid, i) => {
                const group = projected ? slotOf(kid) : '';
                const inGroup = countIn.get(group) ?? 0;
                countIn.set(group, inGroup + 1);
                if (!reaches(kid)) return;
                let from: string;
                if (projected) {
                    const last = lastIn.get(group);
                    if (last) from = step(last.v, inGroup - last.at);
                    else {
                        imports.add('projectedNode');
                        from = `projectedNode(${expr},${jsString(group)},${inGroup},${i})`;
                    }
                    lastIn.set(group, { v: kid.v, at: inGroup });
                } else {
                    from = prev === null ? step(top ? 'r.at' : `${expr}.firstChild`, i) : step(prev, i - prevAt);
                }
                let value = from;
                if (kid.kind === 'element') {
                    imports.add('checkNode');
                    value = `checkNode(${from},${jsString(kid.svg ? kid.tag! : kid.tag!.toLowerCase())})`;
                } else if (kid.kind === 'anchor' && kid.text) {
                    imports.add('partText');
                    value = `partText(${from})`;
                }
                decls.push(`const ${kid.v}=${value};`);
                prev = kid.v;
                prevAt = i;
                visit(kid, kid.v, false);
            });
        };
        visit(this.root, 'r', true);
        return `(r)=>{${decls.join('')}return [${this.targets.join(',')}];}`;
    }

    /** `(r)=>{…; return [targets]}`: from the block's root to every node the render binds. */
    private walk(): string {
        const decls: string[] = [];
        const reaches = (n: StaticNode): boolean => n.target || n.kids.some(reaches);
        const visit = (n: StaticNode, expr: string): void => {
            let prev: string | null = null;
            let prevAt = -1;
            n.kids.forEach((kid, i) => {
                if (!reaches(kid)) return;
                const from = prev === null
                    ? `${expr}.firstChild${'.nextSibling'.repeat(i)}`
                    : `${prev}${'.nextSibling'.repeat(i - prevAt)}`;
                decls.push(`const ${kid.v}=${from};`);
                prev = kid.v;
                prevAt = i;
                visit(kid, kid.v);
            });
        };
        visit(this.root, 'r');
        return `(r)=>{${decls.join('')}return [${this.targets.join(',')}];}`;
    }
}
