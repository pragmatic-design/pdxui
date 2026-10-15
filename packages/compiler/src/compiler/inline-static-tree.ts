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
}

/** Where a module's builders and walks go, and the counter that names them. */
export interface TemplateHoists {
    /** Module-level declarations, one per line: `const __blkN=staticBlock(…);`, `const __walkN=…;`. */
    readonly lines: string[];
    count: number;
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
    text(data: string): void {
        if (this.discarding()) return;
        const parent = this.parent();
        const last = parent.kids[parent.kids.length - 1];
        if (last?.kind === 'text' && last.mk !== undefined) {
            last.data += data;
            this.mk[last.mk] = `${parent.v}.appendChild(__d.createTextNode(${jsString(last.data)}));`;
            return;
        }
        this.add({ kind: 'text', v: '', kids: [], target: false, data, mk: this.mk.length }, `__d.createTextNode(${jsString(data)})`);
    }

    /** A static comment. */
    comment(data: string): void {
        this.add({ kind: 'comment', v: '', kids: [], target: false, data }, `__d.createComment(${jsString(data)})`);
    }

    /** An empty text node named `v` that the render reaches: an interpolation's text, or a marker. */
    anchor(v: string): void {
        this.add({ kind: 'anchor', v, kids: [], target: false }, `__d.createTextNode('')`);
        this.target(v);
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
    prologue(hoists: TemplateHoists, imports: Set<string>, asHtml: boolean): string[] {
        if (this.root.kids.length === 0) return ['const __frag=document.createDocumentFragment();'];
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
        const lines = [`const __frag=__blk${n}();`];
        if (this.targets.length > 0) {
            hoists.lines.push(`const __walk${n}=${this.walk()};`);
            lines.push(`const [${this.targets.join(',')}]=__walk${n}(__frag);`);
        }
        return lines;
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
