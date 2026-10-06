// Component auto-resolution — detects custom element tags in templates
// and generates import statements for corresponding .pdx files.

import type { TemplateNode } from '../parser/template';

/** Optional child-bearing fields across template node variants (structural view
 *  for the generic walker, instead of `any` per access). */
type NodeChildren = {
    body?: TemplateNode[];
    elseBody?: TemplateNode[];
    cases?: { body?: TemplateNode[] }[];
    defaultBody?: TemplateNode[];
    placeholder?: TemplateNode[];
    loading?: TemplateNode[];
    /** DeferNode's error branch. */
    error?: TemplateNode[];
    /** AwaitNode's — named differently from DeferNode's. */
    errorBody?: TemplateNode[];
    /** TryNode's @catch branch. */
    catchBody?: TemplateNode[];
};

/**
 * Scan template AST for custom element tags (containing a hyphen)
 * and return a list of tags that should be auto-imported.
 *
 * @param ast - Template AST nodes
 * @param knownTags - Tags already imported or defined (skip these)
 * @returns Array of tag names to auto-import
 */
export function findComponentTags(ast: TemplateNode[], knownTags: Set<string> = new Set()): string[] {
    const found = new Set<string>();
    walkNodes(ast, found);
    // Filter out known tags and non-custom elements
    return Array.from(found).filter(tag => !knownTags.has(tag));
}

/**
 * The custom-element tags a script registers itself: the string literal passed first to
 * `customElements.define(`, `defineComponent(` or `component(`. A name held in a
 * variable, or built at runtime, is not guessed.
 */
export function selfDefinedTags(script: string): Set<string> {
    // Match: customElements.define('x-y'  |  defineComponent("x-y"  |  component(`x-y`
    // Groups: [2]=the tag. The quote is matched back, so 'a" does not pass.
    const re = /(?:customElements\.define|\bdefineComponent|(?<![\w$.])component)\s*\(\s*(['"`])([a-z][\w]*-[\w-]+)\1/g;
    return new Set([...script.matchAll(re)].map((m) => m[2].toLowerCase()));
}

function walkNodes(nodes: TemplateNode[], found: Set<string>): void {
    for (const node of nodes) {
        if (node.type === 'html') {
            // Extract custom element tags from HTML content
            const tagRegex = /<([a-z][\w]*-[\w-]+)/gi;
            let match;
            while ((match = tagRegex.exec(node.content)) !== null) {
                found.add(match[1].toLowerCase());
            }
        }
        // Recurse into child blocks
        const n = node as NodeChildren;
        if (Array.isArray(n.body)) walkNodes(n.body, found);
        if (Array.isArray(n.elseBody)) walkNodes(n.elseBody, found);
        if (n.cases) {
            for (const c of n.cases) {
                if (c.body) walkNodes(c.body, found);
            }
        }
        if (n.defaultBody) walkNodes(n.defaultBody, found);
        if (n.placeholder) walkNodes(n.placeholder, found);
        if (n.loading) walkNodes(n.loading, found);
        // Three different names for "the branch shown when it went wrong": DeferNode calls it
        // `error`, AwaitNode `errorBody`, TryNode `catchBody`. All three are walked: otherwise a
        // component used ONLY inside @await's @error or @try's @catch would never be auto-imported
        // — and that is the branch a developer is least likely to open while testing.
        if (n.error) walkNodes(n.error, found);
        if (n.errorBody) walkNodes(n.errorBody, found);
        if (n.catchBody) walkNodes(n.catchBody, found);
    }
}

/**
 * Generate import statements for discovered component tags.
 * Maps tag to file path: 'pdx-header' → './header.pdx'
 *
 * @param tags - Tags to import
 * @param componentDirs - Directories to search (relative to .pdx file)
 * @returns Array of import statements
 */
export function generateComponentImports(
    tags: string[],
    componentDirs: string[] = ['./']
): string[] {
    return tags.map(tag => {
        // pdx-header → header, pdx-user-card → user-card
        const name = tag.replace(/^pdx-/, '');
        const dir = componentDirs[0] ?? './';
        const dirPrefix = dir.endsWith('/') ? dir : dir + '/';
        return `import '${dirPrefix}${name}.pdx';`;
    });
}
