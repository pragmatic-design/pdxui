// The icons a template names, as imports (#47).
//
// An icon of the «pragmatic» set is its own module, `@pdxui/ui/icons/<name>`, whose default export is
// its SVG. A page imports the ones it draws instead of the whole set, and the compiler writes those
// imports, with the `defineIcons` call that puts them on the page, for every icon it can see in the
// markup: a literal `<pdx-icon name="check">`, and the literal value of a component prop
// the manifest marks as an icon name (`<pdx-fab icon="edit">`). A bound name (`:name="x"`) is not
// one: it arrives at run time, and the icon loads on demand then. A name no package publishes — a
// typo, an icon of another set — imports nothing, so the build does not fail on it.

import ts from 'typescript';
import type { ComponentResolver } from './component-resolver';

/**
 * The literal values of an `icon` property in the script — `actions([{ icon: 'eye', … }])`, a menu's
 * items: icons named in data the same file writes, on the first screen as much as the markup's. Loaded
 * on demand they arrive a round trip late (owner decision, #47). Read from the TypeScript tree, so a
 * comment or a computed value is not one.
 */
export function scriptIconNames(script: string): string[] {
    if (!/\bicon\b/.test(script)) return [];
    const sf = ts.createSourceFile('__pdx_icons.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const names: string[] = [];
    const visit = (n: ts.Node): void => {
        if (ts.isPropertyAssignment(n)
            && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && n.name.text === 'icon'
            && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))
            && !names.includes(n.initializer.text)) names.push(n.initializer.text);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return names;
}

type IconResolver = Pick<ComponentResolver, 'iconImport' | 'iconPropsOf' | 'resolve'>;

/**
 * The lines that put on the page the icons `markup` names: each icon's module imported (it is data,
 * its SVG as the default export) and handed to `defineIcons`, which pdx-icon's module exports.
 * Nothing when the markup names no icon of a published set, or when no package provides pdx-icon.
 *
 *     import { defineIcons as __pdxDefineIcons } from '@pdxui/ui/icon/pdx-icon';
 *     import __pdxIcon0 from '@pdxui/ui/icons/check';
 *     __pdxDefineIcons({ "check": __pdxIcon0 });
 */
export function iconImportLines(markup: string, resolver: IconResolver, script = ''): string[] {
    const icons = namedIcons(markup, resolver);
    // And the icons the script names in data, after the markup's, each once.
    for (const name of scriptIconNames(script)) {
        const path = resolver.iconImport(name);
        if (path && !icons.some(i => i.name === name)) icons.push({ name, path });
    }
    const definer = resolver.resolve('pdx-icon')?.importPath;
    if (icons.length === 0 || !definer) return [];
    return [
        `import { defineIcons as __pdxDefineIcons } from ${JSON.stringify(definer)};`,
        ...icons.map((icon, i) => `import __pdxIcon${i} from ${JSON.stringify(icon.path)};`),
        `__pdxDefineIcons({ ${icons.map((icon, i) => `${JSON.stringify(icon.name)}: __pdxIcon${i}`).join(', ')} });`,
    ];
}

/**
 * The icons `markup` names, once each, in order, with the import of each. `markup` is template text
 * with its comments and `@defer` blocks already taken out: an icon only a defer renders loads with it.
 */
export function namedIcons(markup: string, resolver: Pick<ComponentResolver, 'iconImport' | 'iconPropsOf'>): { name: string; path: string }[] {
    const out = new Map<string, string>();
    // Match: an opening custom-element tag and its attributes, quotes kept whole so a `>` inside a
    // value does not end it. Groups: [1]=tag [2]=attributes
    for (const tm of markup.matchAll(/<([a-z][\w]*-[\w-]+)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
        const tag = tm[1].toLowerCase();
        const attrs = new Map<string, string>();
        // Match: a static attribute with a quoted value. The lookbehind rejects `:name`, `::name`,
        // `@name` and `x-name`. Groups: [1]=name [2]/[3]=value
        for (const am of tm[2].matchAll(/(?<![:@.\w-])([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
            attrs.set(am[1].toLowerCase(), (am[2] ?? am[3]).trim());
        }
        const names: string[] = [];
        if (tag === 'pdx-icon') {
            // An icon of another set (`set="lucide"`), or a set bound at run time, is not this set's.
            const set = attrs.get('set');
            const boundSet = /(?:^|\s):set\s*=/.test(tm[2]);
            if ((set === undefined || set === '' || set === 'pragmatic') && !boundSet && attrs.has('name')) names.push(attrs.get('name')!);
        }
        const props = resolver.iconPropsOf(tag);
        if (props) {
            // `fallback-icon` and `fallbackIcon` (which HTML lowercases) both name `fallbackIcon`.
            const byAttribute = new Set([...props].map(p => p.toLowerCase()));
            for (const [attr, value] of attrs) if (byAttribute.has(attr.replace(/-/g, ''))) names.push(value);
        }
        for (const name of names) {
            const path = resolver.iconImport(name);
            if (path && !out.has(name)) out.set(name, path);
        }
    }
    return [...out].map(([name, path]) => ({ name, path }));
}
