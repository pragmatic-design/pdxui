// DTS Generator — produces .pdx.d.ts files for IntelliSense.
// Generates: Props, Events, Slots, Fetches, Forms, Stores, SearchParams, Exposed, HTMLElementTagNameMap.

import ts from 'typescript';
import type { PropInfo, EventInfo, SlotInfo, FetchDecl, StoreDecl } from './script-analyzer';
import type { SearchParamDecl, ScriptAnalysis } from './script-analyzer-types';

/** A name an `@expose` puts on the element: an accessor (#752), or a method (#1004). */
export interface ExposedMember {
    name: string;
    /**
     * The type written for it, or `unknown`: the compiler has no type checker to infer one. For a
     * method, its return type.
     */
    type: string;
    /** A $derived or a part: a getter alone. A $signal is written through its setter. */
    readonly: boolean;
    /** A function: its parameters as the declaration lists them, `index: number, smooth?: boolean`. */
    params?: string;
}

/**
 * What each `@expose`d name is on the element, with the types written for it:
 *
 * - a $signal, a writable accessor; a $derived, a read-only one (#752);
 * - a part (#134), its element or, when `partCounts` says the template renders more than one, the
 *   array of them (#988) — read-only, the template sets it;
 * - a function, a method with the parameters and the return type its declaration writes (#1004);
 * - a function written `@expose get name`, a read-only member of its return type (#1423).
 *
 * A constant is exposed as it is, and the .d.ts says nothing of it.
 */
export function exposedMembers(
    analysis: Pick<ScriptAnalysis, 'exposes' | 'signals' | 'deriveds'> & Partial<Pick<ScriptAnalysis, 'body' | 'exposeGetters'>>,
    partCounts: ReadonlyMap<string, number> = new Map(),
): ExposedMember[] {
    const out: ExposedMember[] = [];
    let body: ts.SourceFile | undefined;
    const getters = new Set(analysis.exposeGetters ?? []);
    for (const name of analysis.exposes) {
        if (getters.has(name)) {
            // `@expose get name` (#1423): a read-only property of the function's return type.
            body ??= ts.createSourceFile('script.ts', analysis.body ?? '', ts.ScriptTarget.Latest, true);
            const method = declaredMethod(name, body);
            if (method) out.push({ name, type: method.type, readonly: true });
            continue;
        }
        const signal = analysis.signals.find(s => s.name === name);
        if (signal?.part) {
            out.push({ name, type: (partCounts.get(name) ?? 0) > 1 ? 'HTMLElement[]' : 'HTMLElement | null', readonly: true });
            continue;
        }
        const derived = signal ? undefined : analysis.deriveds.find(d => d.name === name);
        const decl = signal ?? derived;
        if (decl) { out.push({ name, type: decl.type ?? 'unknown', readonly: derived !== undefined }); continue; }
        body ??= ts.createSourceFile('script.ts', analysis.body ?? '', ts.ScriptTarget.Latest, true);
        const method = declaredMethod(name, body);
        if (method) out.push({ name, ...method, readonly: true });
    }
    return out;
}

/**
 * The function the script declares as `name` at its top level — `function name(…)`, or
 * `const name = (…) => …` / `function (…)` — or null when `name` is not one.
 */
export function declaredFunction(name: string, body: ts.SourceFile): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null {
    let fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null;
    for (const st of body.statements) {
        if (ts.isFunctionDeclaration(st) && st.name?.text === name) fn = st;
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer
                    && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) fn = d.initializer;
            }
        }
    }
    return fn;
}

/**
 * The function `name` declares in the script — `function name(…)`, or `const name = (…) => …` — as a
 * method: its parameters, a default making one optional, and its return type as written (`unknown`
 * when none is, a `Promise` of it for an async one). Null when `name` is not a function.
 */
function declaredMethod(name: string, body: ts.SourceFile): { params: string; type: string } | null {
    const fn = declaredFunction(name, body);
    if (!fn) return null;
    const params = fn.parameters.map((p) => {
        const optional = p.questionToken || p.initializer ? '?' : '';
        return `${p.name.getText(body)}${optional}: ${p.type ? p.type.getText(body) : 'unknown'}`;
    }).join(', ');
    const async = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    const type = fn.type ? fn.type.getText(body) : async ? 'Promise<unknown>' : 'unknown';
    return { params, type };
}

export interface DtsInput {
    tag: string;
    props: PropInfo[];
    events: EventInfo[];
    slots: SlotInfo[];
    /** @fetch declarations — generates typed resource accessors. */
    fetches?: FetchDecl[];
    /** @store declaration — generates useXxx() hook type. */
    store?: StoreDecl;
    /** @search params — generates SearchParams interface. */
    searchParams?: SearchParamDecl[];
    /** @form declarations — generates form value types. */
    forms?: { name: string; schemaType?: string }[];
    /** The reactive names `@expose` puts on the element (#752) — `exposedMembers(analysis)`. */
    exposed?: ExposedMember[];
    /**
     * The script's import statements (`analysis.userImports`): the types the declaration names are
     * imported from where the script imports them (#1335).
     */
    imports?: string[];
    /** The script's `@generic`s as written, `T extends { id: string }` (`analysis.generics`). */
    generics?: string[];
}

/**
 * The script's import statements, each as written, for `DtsInput.imports` (#1335). Read a line at a
 * time, as the analyser reads imports: `@pdxui/core`'s too, whose type-only names the analysis keeps
 * nowhere (`Form`, `DataSource`), since the compiled module imports only core's values.
 */
export function scriptImportStatements(script: string): string[] {
    // Match: a one-line `import … from '…';`, or a re-export `export { X } from '…';` / `export * from '…';`
    // (#1352), which the declaration re-exports as the module does. Groups: none
    return script.split('\n').map((l) => l.trim()).filter((l) => /^(?:import|export)\s.+\sfrom\s+(['"])[^'"]+\1;?$/.test(l));
}

/** A name a script import binds, as a type: `{ A as B }`, a default, or a namespace. */
interface ImportedName { local: string; imported?: string; kind: 'named' | 'default' | 'namespace'; from: string }

/** Every name the script's import statements bind, with the module each comes from. */
function importedNames(statements: readonly string[]): ImportedName[] {
    const out: ImportedName[] = [];
    for (const statement of statements) {
        const sf = ts.createSourceFile('import.ts', statement, ts.ScriptTarget.Latest, false);
        for (const st of sf.statements) {
            if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue;
            const from = st.moduleSpecifier.text;
            const clause = st.importClause;
            if (clause.name) out.push({ local: clause.name.text, kind: 'default', from });
            const bindings = clause.namedBindings;
            if (bindings && ts.isNamespaceImport(bindings)) out.push({ local: bindings.name.text, kind: 'namespace', from });
            if (bindings && ts.isNamedImports(bindings)) {
                for (const el of bindings.elements) out.push({ local: el.name.text, imported: el.propertyName?.text, kind: 'named', from });
            }
        }
    }
    return out;
}

/** The identifiers `text` holds, as TypeScript's scanner reads them. */
function identifiersIn(text: string): Set<string> {
    const found = new Set<string>();
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
        if (t === ts.SyntaxKind.Identifier) found.add(scanner.getTokenText());
    }
    return found;
}

/**
 * The lines that declare what a declaration's types name (#1335): each `@generic` it names, as its
 * constraint — inside the component a type parameter reads as what it promises, as the editor reads it
 * (#490) — and each imported name it names, imported as a type from the module the script names. A name
 * from one of the component's own modules (a relative path) is exported again, so the component's entry
 * gives the types its interface mentions, as a TypeScript module exporting them did; one from a package
 * is the package's to export.
 */
function declaredNames(body: string, imports: readonly string[], generics: readonly string[],
    reExported: ReadonlySet<string> = new Set()): string[] {
    // Match: `T` or `T extends X`. Groups: [1]=the name [2]=the constraint
    const params = generics.map((g) => /^([A-Za-z_$][\w$]*)(?:\s+extends\s([\s\S]+))?$/.exec(g.trim()))
        .filter((m): m is RegExpExecArray => m !== null);
    const named = identifiersIn(body);
    const aliases = params.filter((m) => named.has(m[1])).map((m) => `type ${m[1]} = ${m[2]?.trim() || 'unknown'};`);
    // An imported name a constraint uses is named too.
    const used = identifiersIn(`${body}\n${aliases.join('\n')}`);
    const generic = new Set(params.map((m) => m[1]));
    const wanted = importedNames(imports).filter((n) => used.has(n.local) && !generic.has(n.local));
    const lines: string[] = [];
    const byModule = new Map<string, ImportedName[]>();
    for (const n of wanted) {
        if (n.kind === 'default') lines.push(`import type ${n.local} from '${n.from}';`);
        else if (n.kind === 'namespace') lines.push(`import type * as ${n.local} from '${n.from}';`);
        else byModule.set(n.from, [...(byModule.get(n.from) ?? []), n]);
    }
    for (const [from, names] of byModule) {
        lines.push(`import type { ${names.map((n) => (n.imported ? `${n.imported} as ${n.local}` : n.local)).join(', ')} } from '${from}';`);
    }
    // A name the script re-exports itself is exported by that line (#1414): exported here too, the
    // declaration would hold it twice.
    const own = wanted.filter((n) => n.kind !== 'namespace' && n.from.startsWith('.') && !reExported.has(n.local)).map((n) => n.local);
    if (own.length > 0) lines.push(`export type { ${own.join(', ')} };`);
    if (lines.length > 0 || aliases.length > 0) return [...lines, ...aliases, ''];
    return [];
}

/**
 * The names a script's re-exports export (#1414): `export { a, b as c } from …` exports `a` and `c`.
 * `export * from …` names none it can be checked against, so it adds none.
 */
function reExportedNames(statements: readonly string[]): Set<string> {
    const names = new Set<string>();
    const sf = ts.createSourceFile('re-exports.ts', statements.join('\n'), ts.ScriptTarget.Latest, false);
    for (const st of sf.statements) {
        if (!ts.isExportDeclaration(st) || !st.exportClause || !ts.isNamedExports(st.exportClause)) continue;
        for (const el of st.exportClause.elements) names.add(el.name.text);
    }
    return names;
}

/**
 * Generate a .d.ts file content for a .pdx component.
 */
export function generateDts(input: DtsInput): string {
    const pascalTag = toPascalCase(input.tag);
    const lines: string[] = [];

    lines.push('// Auto-generated by @pdxui/compiler — do not edit');
    lines.push('');

    // Props interface
    lines.push(`export interface ${pascalTag}Props {`);
    for (const p of input.props) {
        // A required prop (#130) is a required member: a parent that omits it does not type-check.
        // The public name (#1239): `for`, a parent's attribute and the element's property.
        lines.push(`  ${p.publicName ?? p.name}${p.required ? '' : '?'}: ${p.tsType};`);
    }
    lines.push('}');
    lines.push('');

    // Events interface: the declared ones, and each model's `<name>-change` (#124)
    const models = input.props.filter(p => p.model);
    if (input.events.length > 0 || models.length > 0) {
        lines.push(`export interface ${pascalTag}Events {`);
        for (const e of input.events) {
            // A quoted name (#749) is not an identifier: it is a quoted key, as the model events are.
            lines.push(`  ${/^[A-Za-z_$][\w$]*$/.test(e.name) ? e.name : `'${e.name}'`}: ${e.payloadType};`);
        }
        for (const m of models) {
            lines.push(`  '${modelEventName(m.name)}': { value: ${m.tsType} };`);
        }
        lines.push('}');
        lines.push('');
    }

    // Slots interface (with scope type if declared)
    if (input.slots.length > 0) {
        lines.push(`export interface ${pascalTag}Slots {`);
        for (const s of input.slots) {
            // A typed snippet (#489) is the function the parent provides; `?` when it is optional.
            if (s.signature !== undefined) lines.push(`  ${s.name}${s.required ? '' : '?'}: ${s.signature} => Node;`);
            else lines.push(`  ${s.name}: ${s.scopeType ?? '{}'};`);
        }
        lines.push('}');
        lines.push('');
    }

    // Fetch resource types
    if (input.fetches?.length) {
        for (const f of input.fetches) {
            const typeName = f.type ?? 'unknown';
            lines.push(`export type ${capitalize(f.name)}Resource = ${typeName};`);
        }
        lines.push('');
    }

    // Search params interface
    if (input.searchParams?.length) {
        lines.push(`export interface ${pascalTag}SearchParams {`);
        for (const p of input.searchParams) {
            const opt = p.optional ? '?' : '';
            lines.push(`  ${p.name}${opt}: ${p.type};`);
        }
        lines.push('}');
        lines.push('');
    }

    // Store hook type
    if (input.store) {
        const hookName = `use${capitalize(input.store.name)}`;
        lines.push(`export declare function ${hookName}(): Record<string, unknown>;`);
        lines.push('');
    }

    // Form value types
    if (input.forms?.length) {
        for (const f of input.forms) {
            if (f.schemaType) {
                lines.push(`export type ${capitalize(f.name)}FormValues = ${f.schemaType};`);
            }
        }
        if (input.forms.some(f => f.schemaType)) lines.push('');
    }

    // Exposed reactive names (#752): a $derived is read-only on the element, a $signal is written.
    const exposed = input.exposed ?? [];
    if (exposed.length > 0) {
        lines.push(`export interface ${pascalTag}Exposed {`);
        for (const m of exposed) {
            lines.push(m.params !== undefined ? `  ${m.name}(${m.params}): ${m.type};` : `  ${m.readonly ? 'readonly ' : ''}${m.name}: ${m.type};`);
        }
        lines.push('}');
        lines.push('');
    }

    // HTMLElementTagNameMap augmentation
    lines.push('declare global {');
    lines.push('  interface HTMLElementTagNameMap {');
    lines.push(`    '${input.tag}': HTMLElement & ${pascalTag}Props${exposed.length > 0 ? ` & ${pascalTag}Exposed` : ''};`);
    lines.push('  }');
    lines.push('}');
    lines.push('');

    // The script's re-exports (#1352): the module re-exports them, and so does its declaration.
    const reExports = (input.imports ?? []).filter((s) => s.startsWith('export '));
    // What the types above name, declared after the header (#1335), less what a re-export exports.
    const declared = declaredNames(lines.slice(2).join('\n'), input.imports ?? [], input.generics ?? [], reExportedNames(reExports));
    lines.splice(2, 0, ...declared, ...(reExports.length > 0 ? [...reExports, ''] : []));

    return lines.join('\n');
}

/** The event a model dispatches, as core names it: `selectedId` → `selected-id-change`. */
export function modelEventName(name: string): string {
    return `${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}-change`;
}

function toPascalCase(kebab: string): string {
    return kebab.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
