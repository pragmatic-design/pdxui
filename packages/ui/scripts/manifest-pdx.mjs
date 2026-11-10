// The manifest's reader of a component written in .pdx (#1003). The compiler describes the file —
// what its script declares, its template, its doc comments — and this turns that description into
// what assembleModule takes, as gen-manifest.mjs does from a TypeScript component(). A .pdx and its
// TypeScript version produce the same declaration (tests/unit/gen-manifest-pdx.test.ts).

import ts from 'typescript';
import { describeComponent } from '@pdxui/compiler';
import {
    normalizeEol, PROP_DESC, readDocComment, describeProp, scanRoles, withoutComments, scanSlots,
    scanExportedShapes, declaredFunction, functionParameters, assembleModule,
} from './manifest-shared.mjs';

/** The library's tag prefix: `select.pdx` and `pdx-select.pdx` register `<pdx-select>`. */
const PREFIX = 'pdx';

/**
 * A context token as the manifest names it (#498): an identifier that starts upper-case is a token;
 * a lower-case one named like a prop is the token that prop carries, `:prop`; anything else is left
 * out, as gen-manifest's scanContexts does.
 */
function contextToken(token, propNames) {
    return /^[A-Z]/.test(token) ? token : propNames.has(token) ? `:${token}` : null;
}

/**
 * A function that writes each type name the script imports from a package as `import('pkg').Name`.
 * The manifest is read outside the package — by an app's editor, by the compiler resolving a parent's
 * use — where the script's imports are not in scope: `DataSource<T>` alone names nothing there. The
 * TypeScript reader writes core's DataSource the same way. A name imported from a relative path is
 * the package's own, and is left as written; the manifest's shapes describe it.
 */
function packageTypes(script) {
    const sf = ts.createSourceFile('script.ts', script, ts.ScriptTarget.Latest, true);
    const names = new Map();
    for (const st of sf.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
        const from = st.moduleSpecifier.text;
        const bindings = st.importClause?.namedBindings;
        if (from.startsWith('.') || !bindings || !ts.isNamedImports(bindings)) continue;
        for (const el of bindings.elements) names.set(el.name.text, `import('${from}').${(el.propertyName ?? el.name).text}`);
    }
    if (names.size === 0) return (type) => type;
    // Match: an imported name as a whole identifier, not a member (`x.Name`) or part of a longer name.
    const re = new RegExp(`(?<![\\w$.'])(${[...names.keys()].join('|')})(?![\\w$])`, 'g');
    return (type) => type.replace(re, (name) => names.get(name));
}

/** The manifest module of the .pdx at `file`, whose source is `text`; one, as a .pdx is one component. */
export function analyzePdxFile(file, text, categories) {
    const d = describeComponent(normalizeEol(text), file, { prefix: PREFIX });
    const { analysis: a, tag } = d;
    const docs = new Map(d.docs.declarations.map(x => [`${x.kind}:${x.name}`, readDocComment(x.doc)]));
    const docOf = (kind, name) => docs.get(`${kind}:${name}`)?.description ?? '';
    const component = readDocComment(d.docs.component);
    // A slot's and a state's own doc comment describe it as a `@slot` / `@cssstate` tag on the component
    // does; a tag the component already writes for it wins.
    const tagged = (tag, name) => component.tags.some(t => t.tag === tag && t.text.split(/\s/, 1)[0] === name);
    const tags = [
        ...component.tags,
        ...a.slots.filter(s => docOf('slot', s.name) && !tagged('slot', s.name))
            .map(s => ({ tag: 'slot', text: `${s.name} - ${docOf('slot', s.name)}` })),
        ...a.states.filter(s => docOf('state', s.name) && !tagged('cssstate', s.name))
            .map(s => ({ tag: 'cssstate', text: `${s.name} - ${docOf('state', s.name)}` })),
    ];
    const qualify = packageTypes(d.script);

    const asProp = (p) => ({
        name: p.name, type: qualify(p.tsType), runtime: p.runtimeType.toLowerCase(),
        ...(p.default !== undefined ? { default: p.default } : {}), iconName: false,
        ...(p.required ? { required: true } : {}),
    });
    const plain = a.props.filter(p => !p.model && !p.variant).map(p => ({
        ...asProp(p), description: docOf('prop', p.name) || PROP_DESC[`${tag}:${p.name}`] || describeProp(p.name),
    }));
    // A variant axis is a String prop typed with its values (#512), as gen-manifest's.
    const variants = a.variants ?? [];
    const variantProps = variants.map(v => ({
        name: v.name, type: v.values.map(x => `'${x}'`).join(' | '), runtime: 'string', default: `'${v.default}'`,
        iconName: false, description: docOf('variant', v.name) || describeProp(v.name),
    }));
    const models = a.props.filter(p => p.model).map(p => ({
        ...asProp(p), model: true, description: docOf('model', p.name) || describeProp(p.name),
    }));
    const props = [...plain, ...variantProps, ...models];
    const propNames = new Set(props.map(p => p.name));

    // The script without its runes, as TypeScript: the functions an `@expose` names, the interfaces it exports.
    const body = ts.createSourceFile(`${file}.ts`, a.body, ts.ScriptTarget.Latest, true);
    const derived = new Set([...a.deriveds.map(x => x.name), ...a.signals.map(x => x.name)]);
    const methods = a.exposes.map(name => {
        const fn = derived.has(name) ? null : declaredFunction(name, body);
        return fn
            ? { name, kind: 'method', params: functionParameters(fn, body), description: docOf('declaration', name) }
            // An `@expose`d $derived, signal or part is read-only on the element (#752).
            : { name, kind: 'getter', description: docOf('declaration', name) };
    });

    const provides = [];
    for (const p of a.provides) {
        const token = contextToken(p.token, propNames);
        if (token && !provides.includes(token)) provides.push(token);
    }
    const injects = [];
    for (const i of a.injects) {
        const token = contextToken(i.token, propNames);
        if (token && !injects.some(x => x.token === token)) injects.push({ token, optional: i.fallback !== undefined });
    }

    // Match: an HTML comment.
    const template = d.template.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    return [assembleModule({
        file, tag, category: categories[tag] || { category: 'Other', order: 999 },
        tags, description: component.description, props,
        models: models.map(m => m.name),
        generics: a.generics,
        formAssociated: a.props.some(p => p.form),
        variants,
        declaredEvents: new Map(a.events.map(e => [e.name, {
            detail: e.payloadType && e.payloadType !== 'void' ? qualify(e.payloadType) : undefined,
            noBubble: false,
            description: docOf('event', e.name),
        }])),
        emitted: new Map(),
        emittedNames: [],
        roles: scanRoles([template, withoutComments(body)].join('\n')),
        renderedSlots: scanSlots(template),
        slotSignatures: new Map(a.slots.filter(s => s.signature !== undefined).map(s => [s.name, qualify(s.signature)])),
        parts: a.parts,
        states: a.states.map(s => s.name),
        methods,
        shapes: scanExportedShapes(body, file, text),
        contexts: { provides, injects },
    })];
}
