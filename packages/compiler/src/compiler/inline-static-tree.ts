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

/** One node of a block's static markup, as far as the walk needs to know it. */
interface StaticNode {
    /** The variable naming it in the builder, the walk and the render; '' for a node nothing reaches. */
    v: string;
    kids: StaticNode[];
    /** The render binds it: the walk returns it. */
    target: boolean;
    /** Content written between `<component :is>` and its closing tag, which nothing renders (#358). */
    sink?: boolean;
}

/** Where a module's builders and walks go, and the counter that names them. */
export interface TemplateHoists {
    /** Module-level declarations, one per line: `const __blkN=staticBlock(…);`, `const __walkN=…;`. */
    readonly lines: string[];
    count: number;
}

/** The static markup of one block, as the generator walks it. */
export class StaticTree {
    private readonly root: StaticNode = { v: '__frag', kids: [], target: false };
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

    /** A static element named `v`, created by `create` (`__d.createElement('p')`). Opened unless `isVoid`. */
    element(v: string, create: string, isVoid: boolean): void {
        const node: StaticNode = { v, kids: [], target: false };
        this.add(node, create);
        if (!isVoid) this.open.push(node);
    }

    /** The element `v` closes. */
    close(): void { this.open.pop(); }

    /** The content of a dynamic component, until its closing tag: dropped. */
    openSink(): void { this.open.push({ v: '', kids: [], target: false, sink: true }); }

    /** A static statement on an element already added — a static attribute. */
    statement(line: string): void { if (!this.discarding()) this.mk.push(line); }

    /** Static text. */
    text(literal: string): void { this.add({ v: '', kids: [], target: false }, `__d.createTextNode(${literal})`); }

    /** A static comment. */
    comment(literal: string): void { this.add({ v: '', kids: [], target: false }, `__d.createComment(${literal})`); }

    /** An empty text node named `v` that the render reaches: an interpolation's text, or a marker. */
    anchor(v: string): void {
        this.add({ v, kids: [], target: false }, `__d.createTextNode('')`);
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
    prologue(hoists: TemplateHoists, imports: Set<string>): string[] {
        if (this.root.kids.length === 0) return ['const __frag=document.createDocumentFragment();'];
        const n = hoists.count++;
        // core's staticBlock: built on first use in an inert document, imported per render.
        imports.add('staticBlock');
        hoists.lines.push(`const __blk${n}=staticBlock((__frag,__d)=>{${this.mk.join('')}});`);
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
