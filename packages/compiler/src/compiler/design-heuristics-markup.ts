// The markup and style half of the heuristic component-design rules:
//
//   CD-B2  PDX_ROUTE_RENDERS   a route whose template stacks structural blocks, none a component
//   CD-C1  PDX_SHARED_STYLES   a <style scoped> whose selectors follow separate CD-B1 groups
//   CD-C3  PDX_COLOUR_LITERAL  a colour written as a value in a .pdx style
//
// The template parser keeps markup as raw HTML, so this file reads elements with a small scanner of
// its own: tags, their attributes and their nesting — enough to count siblings and to see which
// names an element's bindings mention.

import type { SFCDescriptor } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import type { SignalGroup } from './design-heuristics';

/** More sibling blocks than this in a route, none a component, and it renders instead of composing. */
const MAX_INLINE_BLOCKS = 3;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

interface Element {
    tag: string;
    attrs: string;
    /** Offset of the `<` in the template's content. */
    start: number;
    children: Element[];
}

/** The template's elements as a tree. Control-flow blocks (`@if {…}`) are transparent. */
function elementTree(template: string): Element[] {
    const text = template.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
    const root: Element = { tag: '#root', attrs: '', start: 0, children: [] };
    const stack: Element[] = [root];
    // Match: an opening or closing tag, attribute values quoted so a `>` inside one (`e => x`) is kept.
    // Groups: [1]=`/` of a closing tag [2]=tag name [3]=attributes [4]=`/` of a self-closing tag
    const tag = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(text)) !== null) {
        const name = m[2].toLowerCase();
        if (m[1]) {
            const at = stack.map(e => e.tag).lastIndexOf(name);
            if (at > 0) stack.length = at;
            continue;
        }
        const el: Element = { tag: name, attrs: m[3], start: m.index, children: [] };
        stack[stack.length - 1].children.push(el);
        if (!m[4] && !VOID_TAGS.has(name)) stack.push(el);
    }
    return root.children;
}

const isComponent = (el: Element): boolean => el.tag.includes('-');
const isStructural = (el: Element): boolean =>
    !isComponent(el) && (el.tag === 'fieldset' || el.tag === 'section' || /(^|\s)data-wizard-step\b/.test(el.attrs));

/**
 * CD-B2: the largest set of native structural blocks that belong together, when it is too large.
 * A fieldset or a section belongs with its siblings; a wizard step belongs to its wizard, which finds
 * its steps anywhere below it (querySelectorAll) — intake's four sit in two forms.
 */
function checkRouteRenders(tree: Element[], line: (offset: number) => number): ValidationWarning[] {
    const sets = new Map<Element | Element[], Element[]>();
    const visit = (siblings: Element[], wizard: Element | null): void => {
        for (const el of siblings) {
            if (isStructural(el)) {
                const key = wizard && /(^|\s)data-wizard-step\b/.test(el.attrs) ? wizard : siblings;
                sets.set(key, [...(sets.get(key) ?? []), el]);
            }
            visit(el.children, el.tag === 'pdx-wizard' ? el : wizard);
        }
    };
    visit(tree, null);
    let worst: Element[] = [];
    for (const blocks of sets.values()) if (blocks.length > worst.length) worst = blocks;
    if (worst.length <= MAX_INLINE_BLOCKS) return [];
    return [{
        code: 'PDX_ROUTE_RENDERS',
        severity: 'warn',
        message: `This route renders ${worst.length} ${/(^|\s)data-wizard-step\b/.test(worst[0].attrs) ? 'wizard steps' : `${worst[0].tag}s`} inline, none of them a component `
            + `(CD-B2, a heuristic): a route composes the pieces of its screen, it does not carry their markup.`,
        hint: `Move each block into a .pdx of its own (a form section calls tryUseForm()) and compose them here.`,
        line: line(worst[0].start),
    }];
}

/** The classes an element writes statically: `class="a b"`. */
function classesOf(el: Element): string[] {
    const m = el.attrs.match(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    return (m?.[1] ?? m?.[2] ?? '').split(/\s+/).filter(Boolean);
}

/** CD-C1: which group each class's elements bind to, and the scoped selectors that follow two or more. */
function checkSharedStyles(descriptor: SFCDescriptor, tree: Element[], groups: SignalGroup[], line: (offset: number) => number): ValidationWarning[] {
    const owner = new Map<string, number>();
    groups.forEach((g, i) => { for (const n of g.names) owner.set(n, i); });
    const classGroups = new Map<string, Set<number>>();
    const visit = (el: Element, inherited: Set<number>): void => {
        const own = new Set<number>();
        for (const id of el.attrs.match(/[A-Za-z_$][\w$]*/g) ?? []) if (owner.has(id)) own.add(owner.get(id)!);
        const mine = own.size > 0 ? own : inherited;
        for (const c of classesOf(el)) {
            const set = classGroups.get(c) ?? new Set<number>();
            for (const g of mine) set.add(g);
            classGroups.set(c, set);
        }
        for (const child of el.children) visit(child, mine);
    };
    for (const el of tree) visit(el, new Set());

    const style = descriptor.styles.find(s => s.scoped);
    if (!style) return [];
    const css = style.content.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const byGroup = new Map<number, Set<string>>();
    // Match: a rule's selector — the text after a `{`, `}` or the start, up to its `{`, not an at-rule.
    for (const m of css.matchAll(/(?:^|[{}])\s*([^{}@;][^{};]*?)\s*\{/g)) {
        for (const c of m[1].matchAll(/\.([\w-]+)/g)) {
            const set = classGroups.get(c[1]);
            if (!set || set.size !== 1) continue;
            const g = [...set][0];
            byGroup.set(g, (byGroup.get(g) ?? new Set()).add(`.${c[1]}`));
        }
    }
    if (byGroup.size < 2) return [];
    const listed = [...byGroup].map(([g, cs]) => `${[...cs].join(', ')} → (${groups[g].signals.join(', ')})`).join(' · ');
    return [{
        code: 'PDX_SHARED_STYLES',
        severity: 'warn',
        message: `This stylesheet serves ${byGroup.size} of the pieces CD-B1 finds (CD-C1, a heuristic): ${listed}.`,
        hint: `When the pieces become components, each takes its own <style scoped>; what stays here styles the layout that joins them.`,
        line: line(0),
    }];
}

/** CD-C3: a hex, `rgb(`/`hsl(`, `white` or `black` in a declaration's value. */
function checkColourLiterals(descriptor: SFCDescriptor, source: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    for (const style of descriptor.styles) {
        const css = style.content.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
        // Match: the body of an innermost rule — declarations, no nested block.
        for (const body of css.matchAll(/\{([^{}]*)\}/g)) {
            const bodyStart = body.index! + 1;
            // Match: one declaration's value. Groups: [1]=value
            for (const decl of body[1].matchAll(/[\w-]+\s*:\s*([^;]+)/g)) {
                // Match: a colour literal in a value. Groups: [0]=the literal
                const lit = decl[1].match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|(?<![\w-])(?:white|black)(?![\w-])/);
                if (!lit) continue;
                const offset = style.start + bodyStart + decl.index! + decl[0].indexOf(decl[1]) + lit.index!;
                warnings.push({
                    code: 'PDX_COLOUR_LITERAL',
                    severity: 'warn',
                    message: `'${decl[0].trim()}' writes a colour as a value (CD-C3): '${lit[0].replace(/\($/, '(…)')}' is right in one theme and wrong in twelve.`,
                    hint: `Use a token: var(--pdx-color-*), the *-ink colours for text, *-soft for tints.`,
                    line: source.slice(0, offset).split('\n').length,
                });
            }
        }
    }
    return warnings;
}

/** CD-B2 (routes only), CD-C1 (when CD-B1 found more than one group) and CD-C3, for one file. */
export function checkMarkup(descriptor: SFCDescriptor, source: string, isRoute: boolean, groups: SignalGroup[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const template = descriptor.template;
    if (template) {
        const tree = elementTree(template.content);
        const line = (offset: number): number => source.slice(0, template.start + offset).split('\n').length;
        if (isRoute) warnings.push(...checkRouteRenders(tree, line));
        if (groups.length > 1) {
            const style = descriptor.styles.find(s => s.scoped);
            const styleLine = (): number => (style ? source.slice(0, style.start).split('\n').length : 1);
            warnings.push(...checkSharedStyles(descriptor, tree, groups, styleLine));
        }
    }
    warnings.push(...checkColourLiterals(descriptor, source));
    return warnings;
}
