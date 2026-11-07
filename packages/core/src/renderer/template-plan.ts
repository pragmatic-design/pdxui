// Where an html`` template's bindings are, found once per template instead of once per instance.
//
// A parsed template is cloned for every call of the same literal. The places its values go — the
// attributes, comments and text nodes carrying a placeholder — are the same in every clone, so they
// are found once on the template's content and kept as paths of child indices. Each clone then
// reaches those nodes directly, instead of scanning all its elements, attributes, comments and text.

/** The text placeholder put in an attribute value: `\u200BPDX<n>\u200B`. */
export const PLACEHOLDER = '\u200BPDX';
/** The comment placeholder put in content: `<!--pdx-<n>-->`. */
export const COMMENT_PH_PREFIX = 'pdx-';

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits a string at its placeholders, keeping them. */
export const PH_REGEX = new RegExp(`(${escapeRegex(PLACEHOLDER)}\\d+\u200B)`, 'g');
/** The index of the first placeholder in a string. */
export const PH_EXTRACT = new RegExp(`${escapeRegex(PLACEHOLDER)}(\\d+)\u200B`);
const PH_PURE = new RegExp(`^${escapeRegex(PLACEHOLDER)}(\\d+)\u200B$`);
const COMMENT_PH_RE = new RegExp(`^${COMMENT_PH_PREFIX}(\\d+)$`);

/**
 * An attribute that carries one or more placeholders. `pure` is the value index when the attribute is
 * one placeholder and nothing else; otherwise `segments` is the value split at its placeholders, and
 * `slots[i]` is the value index of `segments[i]`, or -1 for static text.
 */
export interface AttributeBinding {
    path: number[];
    name: string;
    pure: number;
    segments: string[];
    slots: number[];
}

/** A `<!--pdx-<n>-->` comment, replaced by value `index`. */
export interface CommentBinding {
    path: number[];
    index: number;
}

export interface BindingPlan {
    /** In document order, and in attribute order within an element: the order they were bound in. */
    attributes: AttributeBinding[];
    /** In document order. */
    comments: CommentBinding[];
    /** Text nodes that carry a placeholder, in document order: the fallback for an attribute context the scanner missed. */
    texts: number[][];
}

/** Find a template's bindings, on its content, before any clone is bound. */
export function buildBindingPlan(content: DocumentFragment): BindingPlan {
    const plan: BindingPlan = { attributes: [], comments: [], texts: [] };
    const path: number[] = [];
    const visit = (parent: Node): void => {
        const children = parent.childNodes;
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            path.push(i);
            if (node.nodeType === 1) {
                const el = node as Element;
                const attrs = el.attributes;
                for (let a = 0; a < attrs.length; a++) {
                    const attr = attrs[a];
                    if (!PH_EXTRACT.test(attr.value)) continue;
                    plan.attributes.push(attributeBinding(path.slice(), attr.name, attr.value));
                }
                visit(el);
            } else if (node.nodeType === 8) {
                const m = (node as Comment).data.match(COMMENT_PH_RE);
                if (m) plan.comments.push({ path: path.slice(), index: parseInt(m[1]) });
            } else if (node.nodeType === 3) {
                if ((node as Text).data.includes(PLACEHOLDER)) plan.texts.push(path.slice());
            }
            path.pop();
        }
    };
    visit(content);
    return plan;
}

/** The binding of attribute `name` with `value`, a value that carries placeholders. */
export function attributeBinding(path: number[], name: string, value: string): AttributeBinding {
    const pure = value.match(PH_PURE);
    if (pure) return { path, name, pure: parseInt(pure[1]), segments: [], slots: [] };
    const segments = value.split(PH_REGEX);
    const slots = segments.map(seg => {
        const m = seg.match(PH_EXTRACT);
        return m ? parseInt(m[1]) : -1;
    });
    return { path, name, pure: -1, segments, slots };
}

/** The node at `path` under `root`. */
export function nodeAt(root: Node, path: number[]): Node {
    let node = root;
    for (let i = 0; i < path.length; i++) node = node.childNodes[path[i]];
    return node;
}
