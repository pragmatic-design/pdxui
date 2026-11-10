// PDX → Custom Elements Manifest generator.
//
// The UI components are authored with the `component('pdx-x', { props, setup, render })`
// factory from @pdxui/core — NOT as `class extends HTMLElement` — so the stock
// @custom-elements-manifest/analyzer can't see them. This PDX-aware extractor reads each
// pdx-*.ts via the TypeScript AST and emits a standard CEM 1.0.0 `custom-elements.json`,
// which downstream tooling (api-viewer, VS Code custom-data, framework wrappers, the docs
// site API tables, the MCP server) all consume.
//
// Data sources per component:
//   - properties/attributes ← the `props: { name: { type, default } }` config object
//   - events                ← JSDoc `@fires`  + heuristic scan of emit()/new CustomEvent()
//   - slots                 ← JSDoc `@slot name - desc`
//   - css parts             ← JSDoc `@csspart name - desc`
//   - css custom properties ← JSDoc `@cssprop --name - desc`
//   - css states            ← the descriptor's `states: [...]`, described by JSDoc `@cssstate name - desc`
//   - summary/description   ← JSDoc on the component() statement
//
// A component written in .pdx, pdx-*.pdx, is read from the compiler's description of it
// (manifest-pdx.mjs, #1003): the same fields, from its declarations and the JSDoc of its script.
// Both readers hand what they extract to one assembly, manifest-shared.mjs.
//
// Usage: node scripts/gen-manifest.mjs   (writes packages/ui/custom-elements.json)

import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { pathToFileURL } from 'url';
import { componentTokens } from '../../design/scripts/component-tokens.mjs';
import {
    UI_ROOT, normalizeEol, PROP_DESC, jsdocDescription, jsdocTags, splitNameDesc, scanRoles, withoutComments,
    scanSlots, scanExportedShapes, declaredFunction, functionParameters, describeProp, assembleModule,
} from './manifest-shared.mjs';
import { analyzePdxFile } from './manifest-pdx.mjs';

const SRC = join(UI_ROOT, 'src');

export { normalizeEol };

// ─── Categories + order (from the section comments of src/index.ts) ──────

/** Parse src/index.ts: maps tag → { category, order } from the barrel's sections. */
export function parseCategories() {
    const map = {};
    let category = 'Other';
    let order = 0;
    let text = '';
    try { text = readFileSync(join(SRC, 'index.ts'), 'utf-8'); } catch { return map; }
    for (const line of text.split(/\r?\n/)) {
        const tier = /^\/\/\s*Tier\s*[^:]*:\s*(.+?)\s*$/.exec(line);
        if (tier) { category = tier[1]; continue; }
        if (/^\/\/\s*Infrastructure/.test(line)) { category = 'Infrastructure'; continue; }
        // Match: import './select/pdx-select';  or a .pdx component's  import './select/pdx-select.pdx';
        // Groups: [1]=the tag
        const imp = /^import\s+'\.\/[^/]+\/(pdx-[\w-]+)(?:\.pdx)?'/.exec(line);
        if (imp) map[imp[1]] = { category, order: order++ };
    }
    return map;
}

// ─── File discovery ─────────────────────────────────────────────────

/** Recursively collect every pdx-*.ts and pdx-*.pdx under src/ (#1003). */
const SKIP_DIRS = new Set();

function collectComponentFiles(dir) {
    const out = [];
    for (const item of readdirSync(dir)) {
        if (SKIP_DIRS.has(item)) continue;
        const full = join(dir, item);
        if (statSync(full).isDirectory()) out.push(...collectComponentFiles(full));
        else if (/^pdx-.*\.(ts|pdx)$/.test(item)) out.push(full);
    }
    return out;
}

// ─── AST helpers ────────────────────────────────────────────────────

const TYPE_MAP = { String: 'string', Number: 'number', Boolean: 'boolean', Array: 'array', Object: 'object' };

/**
 * The type a prop DECLARES for itself: `@type number | 'auto'` above it, or '' when it says nothing.
 *
 * Read from the tag's typeExpression, not from its comment: TypeScript parses `@type` into a
 * JSDocTypeTag and puts everything after the tag name in the type, where `tag.comment` is empty.
 * Braces are accepted (`@type {number}`) and stripped.
 */
function jsdocDeclaredType(node, sourceFile) {
    for (const tag of ts.getJSDocCommentsAndTags(node)) {
        if (!ts.isJSDoc(tag) || !tag.tags) continue;
        for (const t of tag.tags) {
            if (t.tagName.text !== 'type' || !t.typeExpression) continue;
            return t.typeExpression.getText(sourceFile).replace(/^\{|\}$/g, '').trim();
        }
    }
    return '';
}

/** Find the `component('tag', {...})` ExpressionStatement; returns { statement, tag, optionsObj } or null. */
function findComponentCalls(sourceFile) {
    const found = [];
    for (const stmt of sourceFile.statements) {
        if (!ts.isExpressionStatement(stmt)) continue;
        const call = stmt.expression;
        if (!ts.isCallExpression(call)) continue;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== 'component') continue;
        const [arg0, arg1] = call.arguments;
        if (!arg0 || !ts.isStringLiteralLike(arg0)) continue;
        if (!arg1 || !ts.isObjectLiteralExpression(arg1)) continue;
        found.push({ statement: stmt, tag: arg0.text, optionsObj: arg1 });
    }
    return found;
}

/** Extract props from the options object literal → array of { name, type, default, description }. */
function extractProps(optionsObj, sourceFile, tag) {
    const propsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'props');
    if (!propsProp || !ts.isObjectLiteralExpression(propsProp.initializer)) return [];

    const props = [];
    for (const decl of propsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl)) continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        // A prop is a descriptor (#300): `prop<T>(…)`, `prop.required<T>()`, `prop.optional<T>()`.
        const built = builtProp(decl.initializer, sourceFile);
        if (!built) continue;
        // `@type number | 'auto'` on the prop's JSDoc wins over the type the builder says. A prop that
        // accepts two shapes has to be DECLARED as one of them — `columns` is String so the word
        // survives the attribute — and without this the catalogue would say `string` beside prose
        // promising a number, leaving an agent no way to know which one the code believes.
        const declared = jsdocDeclaredType(decl, sourceFile);
        props.push({ name, ...built, ...(declared ? { type: declared } : {}), description: jsdocDescription(decl) || PROP_DESC[`${tag}:${name}`] || describeProp(name) });
    }
    return props;
}

/**
 * The models a typed descriptor declares, `models: { value: model<T>(default, options?) }` (#124) →
 * the same shape as a prop, plus `model: true`. `model()` takes `prop()`'s arguments.
 */
function extractModels(optionsObj, sourceFile) {
    const modelsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'models');
    if (!modelsProp || !ts.isObjectLiteralExpression(modelsProp.initializer)) return [];
    const models = [];
    for (const decl of modelsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl)) continue;
        const built = builtProp(decl.initializer, sourceFile);
        if (!built) continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        models.push({ name, ...built, iconName: false, model: true, description: jsdocDescription(decl) || describeProp(name) });
    }
    return models;
}

/**
 * Whether a model is declared `{ form: true }` (#135): `model(default, { form: true })` makes the
 * component form-associated, its model the form's value. The manifest records it, so a reader — the
 * value-input family's test (#286), an agent's page card — need not run the component to know.
 */
function hasFormModel(optionsObj, sourceFile) {
    const modelsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'models');
    if (!modelsProp || !ts.isObjectLiteralExpression(modelsProp.initializer)) return false;
    return modelsProp.initializer.properties.some((decl) => {
        if (!ts.isPropertyAssignment(decl) || !ts.isCallExpression(decl.initializer)) return false;
        const options = decl.initializer.arguments[1];
        return !!options && ts.isObjectLiteralExpression(options) && options.properties.some((p) =>
            ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'form' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
    });
}

/**
 * The slots a typed descriptor declares, `slots: { item: slot<(item: T, index: number) => Node>() }`
 * (#491) → name → signature, the parameter list the editor types a parent's `@snippet` from. A
 * `slot()` with no type argument takes no arguments, `()`.
 */
function extractSlotSignatures(optionsObj, sourceFile) {
    const slotsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'slots');
    const signatures = new Map();
    if (!slotsProp || !ts.isObjectLiteralExpression(slotsProp.initializer)) return signatures;
    for (const decl of slotsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl) || !ts.isCallExpression(decl.initializer)) continue;
        const call = decl.initializer;
        if (call.expression.getText(sourceFile) !== 'slot') continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        const fn = call.typeArguments?.[0];
        const params = fn && ts.isFunctionTypeNode(fn) ? fn.parameters.map(p => p.getText(sourceFile)) : [];
        signatures.set(name, `(${params.join(', ')})`);
    }
    return signatures;
}

/**
 * `prop(…)`, `prop.required(…)`, `prop.optional(…)` or `model(…)`: the builders a typed descriptor
 * declares a prop with (#123, #124, #130). `noDefault`: the call takes its options first.
 */
function propBuilderCall(node) {
    if (!ts.isCallExpression(node)) return null;
    const callee = node.expression;
    if (ts.isIdentifier(callee) && (callee.text === 'prop' || callee.text === 'model')) return { call: node, required: false, noDefault: false };
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'prop') {
        if (callee.name.text === 'required') return { call: node, required: true, noDefault: true };
        if (callee.name.text === 'optional') return { call: node, required: false, noDefault: true };
    }
    return null;
}

/** The runtime kind a default implies, as `prop()` infers it: string, number, boolean, else array or object. */
function inferredRuntime(arg) {
    if (!arg) return 'object';
    if (ts.isStringLiteralLike(arg)) return 'string';
    if (ts.isNumericLiteral(arg) || (ts.isPrefixUnaryExpression(arg) && ts.isNumericLiteral(arg.operand))) return 'number';
    if (arg.kind === ts.SyntaxKind.TrueKeyword || arg.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
    if (ts.isArrayLiteralExpression(arg)) return 'array';
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        const body = ts.isArrowFunction(arg) && !ts.isBlock(arg.body) ? arg.body : null;
        const value = body && ts.isParenthesizedExpression(body) ? body.expression : body;
        return value && ts.isArrayLiteralExpression(value) ? 'array' : 'object';
    }
    return 'object';
}

/** The `type` field of a builder's options argument (`{ type: Number }`), as a runtime kind, or null. */
function optionsRuntime(arg, sourceFile) {
    if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
    const field = arg.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'type');
    if (!field) return null;
    const t = field.initializer.getText(sourceFile);
    return TYPE_MAP[t] ?? t.toLowerCase();
}

/**
 * A prop declared with the typed builder → { type, runtime, default, required }, or null when the
 * initializer is not one. The TYPE is the type argument as written (`prop<'sm' | 'md'>('md')` is
 * `'sm' | 'md'`), else the runtime kind; the RUNTIME kind — what decides whether the prop is also an
 * attribute — is the options' `type`, else the one the default implies, exactly as `prop()` decides it.
 */
function builtProp(initializer, sourceFile) {
    const found = propBuilderCall(initializer);
    if (!found) return null;
    const { call, required, noDefault } = found;
    const typeArg = call.typeArguments?.[0]?.getText(sourceFile);
    const [first, second] = call.arguments;
    const runtime = noDefault
        ? (optionsRuntime(first, sourceFile) ?? 'object')
        : (optionsRuntime(second, sourceFile) ?? inferredRuntime(first));
    const def = noDefault || !first ? undefined : defaultText(first, runtime, sourceFile);
    const iconName = optionsFlag(noDefault ? first : second, sourceFile, 'iconName');
    return { type: typeArg || runtime, runtime, default: def, iconName, ...(required ? { required: true } : {}) };
}

/**
 * A prop's default as the manifest shows it: the value it starts with. An Array or Object prop's
 * factory, `() => []`, is called by core once per instance (resolveDefault), so the value is `[]`; a
 * .pdx's `= []` compiles to that factory (#677) and reads `[]` too (#1003). A factory with a block
 * body, and any other default, is shown as written.
 */
function defaultText(arg, runtime, sourceFile) {
    if ((runtime === 'array' || runtime === 'object') && ts.isArrowFunction(arg) && arg.parameters.length === 0 && !ts.isBlock(arg.body)) {
        const value = ts.isParenthesizedExpression(arg.body) ? arg.body.expression : arg.body;
        return value.getText(sourceFile);
    }
    return arg.getText(sourceFile);
}

/** A boolean field of a builder's options argument (`{ iconName: true }`): true only when written `true`. */
function optionsFlag(arg, sourceFile, name) {
    if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
    const field = arg.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === name);
    return !!field && field.initializer.kind === ts.SyntaxKind.TrueKeyword;
}

/** The string literals of a descriptor's array field, `parts: ['trigger', 'popup']` → their values. */
function stringArrayField(optionsObj, sourceFile, field) {
    const prop = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === field);
    if (!prop || !ts.isArrayLiteralExpression(prop.initializer)) return [];
    return prop.initializer.elements.filter(e => ts.isStringLiteralLike(e)).map(e => e.text);
}

/**
 * The variant axes a descriptor declares (#512): `size: ['md', 'sm']` or
 * `variant: { primary: '.pdx-primary', ghost: '.pdx-ghost' }` → { name, values, default, native? }.
 * The first value is the default; `native` maps each value of a record to the selector that draws it
 * on plain HTML (#626). `descriptions` maps an axis to its JSDoc, for its prop.
 */
function extractVariants(optionsObj, sourceFile) {
    const descriptions = new Map();
    const variantsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'variants');
    if (!variantsProp || !ts.isObjectLiteralExpression(variantsProp.initializer)) return { axes: [], descriptions };
    const axes = [];
    for (const decl of variantsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl)) continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        const init = decl.initializer;
        // The axis's own JSDoc describes its prop, as a prop's does.
        const description = jsdocDescription(decl);
        if (description) descriptions.set(name, description);
        if (ts.isArrayLiteralExpression(init)) {
            const values = init.elements.filter(e => ts.isStringLiteralLike(e)).map(e => e.text);
            if (values.length) axes.push({ name, values, default: values[0] });
        } else if (ts.isObjectLiteralExpression(init)) {
            const native = {};
            for (const entry of init.properties) {
                if (!ts.isPropertyAssignment(entry) || !ts.isStringLiteralLike(entry.initializer)) continue;
                native[entry.name.getText(sourceFile).replace(/^['"]|['"]$/g, '')] = entry.initializer.text;
            }
            const values = Object.keys(native);
            if (values.length) axes.push({ name, values, default: values[0], native });
        }
    }
    return { axes, descriptions };
}

/**
 * The type parameters a descriptor declares (#651), metadata for the editor only:
 * `generics: { T: { extends: '{ key: string }', from: 'items', source: 'source' } }` → { name,
 * extends?, from?, source? }. `from` names the array prop the parameter is inferred from, which the
 * manifest then types `T[]`; `source` (#853) the DataSource prop it is inferred from as well, typed
 * `DataSource<T> | null`.
 */
function extractGenerics(optionsObj, sourceFile) {
    const genericsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'generics');
    if (!genericsProp || !ts.isObjectLiteralExpression(genericsProp.initializer)) return [];
    const out = [];
    for (const decl of genericsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl) || !ts.isObjectLiteralExpression(decl.initializer)) continue;
        const field = (key) => {
            const p = decl.initializer.properties.find(e => ts.isPropertyAssignment(e) && e.name.getText(sourceFile) === key);
            return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : undefined;
        };
        out.push({ name: decl.name.getText(sourceFile), extends: field('extends'), from: field('from'), source: field('source') });
    }
    return out;
}

/**
 * The events a typed descriptor declares, `events: { name: event<D>(options?) }` → name →
 * { detail, noBubble, description }. `detail` is the type argument as written, absent for `void` or
 * when none is given; `noBubble` is `{ bubbles: false }` in the options.
 */
function extractDescriptorEvents(optionsObj, sourceFile) {
    const out = new Map();
    const eventsProp = optionsObj.properties.find(
        p => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'events');
    if (!eventsProp || !ts.isObjectLiteralExpression(eventsProp.initializer)) return out;
    for (const decl of eventsProp.initializer.properties) {
        if (!ts.isPropertyAssignment(decl)) continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        const init = decl.initializer;
        const isEvent = ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'event';
        const typeArg = isEvent ? init.typeArguments?.[0]?.getText(sourceFile) : undefined;
        out.set(name, {
            detail: typeArg && typeArg !== 'void' ? typeArg : undefined,
            noBubble: isEvent && passesNoBubble(init.arguments[0]),
            description: jsdocDescription(decl),
        });
    }
    return out;
}

/** Heuristic event names from emit('x') and new CustomEvent('x') in the source text. */
function scanEmittedEvents(text) {
    const names = new Set();
    const re = /(?:\.emit|new\s+CustomEvent)\s*\(\s*(['"`])([\w-]+)\1/g;
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[2]);
    return names;
}

/**
 * What an event's `detail` holds, read from the emit call itself: `{ tags, value }` for an object
 * literal (its keys; a spread shows as `...expr`), both shapes for a ternary between two literals,
 * `null` for anything else — a value, a call — which the component has to declare with a typed
 * `@fires`.
 *
 * "`pdx-change` — Fired when the value changes." alone leaves a reader guessing the payload, and a
 * guess goes wrong: pdx-tag-input's list is `detail.tags`, not `detail.value`. Nearly every emit that
 * passes a detail passes an object literal, so reading them here costs nothing and cannot drift.
 */
function detailShape(arg, sourceFile) {
    if (ts.isParenthesizedExpression(arg)) return detailShape(arg.expression, sourceFile);
    if (ts.isObjectLiteralExpression(arg)) {
        const keys = arg.properties.map(p => ts.isSpreadAssignment(p)
            ? `...${p.expression.getText(sourceFile)}`
            : (p.name ? p.name.getText(sourceFile).replace(/^['"]|['"]$/g, '') : '?'));
        return keys.length ? `{ ${keys.join(', ')} }` : '{}';
    }
    if (ts.isConditionalExpression(arg)) {
        const a = detailShape(arg.whenTrue, sourceFile);
        const b = detailShape(arg.whenFalse, sourceFile);
        if (a && b) return a === b ? a : `${a} | ${b}`;
    }
    return null;
}

/** `emit('x', undefined, …)`: a placeholder for the options argument, not a detail. */
function isNoDetail(arg) {
    return !arg || (ts.isIdentifier(arg) && arg.text === 'undefined');
}

/** `{ bubbles: false }` as the options argument of an emit call. */
function passesNoBubble(arg) {
    return !!arg && ts.isObjectLiteralExpression(arg) && arg.properties.some(p =>
        ts.isPropertyAssignment(p) && p.name.getText() === 'bubbles' && p.initializer.kind === ts.SyntaxKind.FalseKeyword);
}

/**
 * Every public `.emit('name', …)` under `node` (a `__`-prefixed name is internal plumbing), as
 * name → { shapes, opaque, noBubble }: `shapes` the distinct detail shapes read off the calls,
 * `opaque` true when one of them passes a detail no shape can be read from, `noBubble` true when the
 * calls pass `{ bubbles: false }`.
 */
function scanEmitDetails(node, sourceFile, into = new Map()) {
    const visit = (n) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'emit'
            && n.arguments.length >= 1 && ts.isStringLiteralLike(n.arguments[0]) && !n.arguments[0].text.startsWith('__')) {
            const name = n.arguments[0].text;
            const entry = into.get(name) ?? { shapes: new Set(), opaque: false, noBubble: false };
            if (!isNoDetail(n.arguments[1])) {
                const shape = detailShape(n.arguments[1], sourceFile);
                if (shape) entry.shapes.add(shape); else entry.opaque = true;
            }
            if (passesNoBubble(n.arguments[2])) entry.noBubble = true;
            into.set(name, entry);
        }
        ts.forEachChild(n, visit);
    };
    visit(node);
    return into;
}

/**
 * The non-component `.ts` files beside a component: where a component that grew split its logic
 * (pdx-data-grid emits `pdx-selection-change` from grid-selection.ts, not from pdx-data-grid.ts).
 */
function helperFiles(file) {
    const dir = dirname(file);
    // analyzeFile is handed its text, and a test may hand it a path that exists nowhere
    // (gen-manifest-eol.test.ts): no directory, no helpers.
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts') && !/^pdx-/.test(f))
        .map(f => join(dir, f));
}

/**
 * What `ctx.expose({ a, b, … })` puts on the element, reachable through a ref: each name, and
 * whether it is a getter. Walks the AST (not a regex): method bodies routinely contain commas
 * and nested braces, which a text split mis-parses (dropping all but the simplest key).
 *
 * A getter (`get isOpen() { … }`) is a value, not a function: listed as a method, it would tell a
 * reader to write `el.isOpen()`, which throws "is not a function".
 *
 * The same question, one step along: an exposed OBJECT is not callable either. `pdx-scroll-area`
 * exposes `scrollArea: { scrollTo, scrollBy, … }`; called a method, the names a caller actually
 * needs would appear nowhere. So the scan asks what a property's value is, not only its name.
 */
function scanExposedMethods(sourceFile) {
    const names = new Map();
    const visit = (node) => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'expose' &&
            node.arguments.length > 0 &&
            ts.isObjectLiteralExpression(node.arguments[0])
        ) {
            for (const prop of node.arguments[0].properties) {
                // method(){}, getter, `name: fn`, and shorthand `name` are all real keys;
                // spreads (`...api`) carry no static name, so they're skipped.
                const nameNode = prop.name;
                if (!nameNode) continue;
                const key = ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) ? nameNode.text : null;
                if (key && /^[a-zA-Z_$][\w$]*$/.test(key)) {
                    // The JSDoc written on the property, when there is one, before the table of
                    // well-known NAMES: a sentence written above the method reaches the manifest,
                    // and the component that knows better overrides a name in the table.
                    const description = jsdocDescription(prop) || names.get(key)?.description || '';
                    const object = ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)
                        ? prop.initializer
                        : names.get(key)?.object ?? null;
                    // The parameters, where the property carries a function. A name alone leaves a
                    // reader guessing: `startEdit(rowId, field)` edits a cell and `startEdit(rowId)`
                    // the whole row, and the difference is the argument. A shorthand
                    // (`goTo`) names a function declared elsewhere in the setup — resolved below.
                    const params = parametersOf(prop, sourceFile) ?? names.get(key)?.params ?? null;
                    names.set(key, {
                        name: key, description, object, params,
                        getter: ts.isGetAccessorDeclaration(prop) || names.get(key)?.getter === true,
                    });
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return [...names.values()];
}

/**
 * The parameters of an exposed property, where it carries a function: a method, an arrow or a
 * function expression. Null when the property is something else — a shorthand naming a function
 * declared elsewhere, an object, a call — so the caller can fall back rather than print `()` on a
 * method that takes arguments.
 */
function parametersOf(prop, sourceFile) {
    const named = ts.isShorthandPropertyAssignment(prop) ? prop.name.text
        : ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer) ? prop.initializer.text : null;
    const fn = ts.isMethodDeclaration(prop) ? prop
        : ts.isPropertyAssignment(prop) && (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
            ? prop.initializer
            : named ? declaredFunction(named, sourceFile) : null;
    if (!fn) return null;
    return functionParameters(fn, sourceFile);
}
/**
 * The shape of an exposed object, as a reader would call it: `{ scrollTo(opts), getViewport() }`.
 * Each key with its parameter names, because the whole point of publishing it is that
 * `el.scrollArea.scrollTo(...)` is reachable and `el.scrollArea()` is not.
 */
function objectShape(object, sourceFile) {
    const parts = [];
    for (const prop of object.properties) {
        const key = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null;
        if (!key) continue;
        const fn = ts.isMethodDeclaration(prop) ? prop
            : ts.isPropertyAssignment(prop) && (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
                ? prop.initializer : null;
        parts.push(fn ? `${key}(${fn.parameters.map(p => p.name.getText(sourceFile)).join(', ')})` : key);
    }
    return `{ ${parts.join(', ')} }`;
}

// ─── Per-file extraction ────────────────────────────────────────────

export function analyzeFile(file, text, categories) {
    // A component written in .pdx (#1003): read from the compiler's description of it.
    if (file.endsWith('.pdx')) return analyzePdxFile(file, text, categories);
    // LF before anything is read out of the source. TypeScript hands back JSDoc prose with the
    // file's own terminators, so on a Windows checkout every multi-line description would reach the
    // JSON as a literal `\r\n` INSIDE the string value — content as far as git is concerned, which
    // is why `text eol=lf` in .gitattributes cannot reach it (it rewrites terminators, not escapes).
    // The manifest would then differ by who built it last, and could not be verified by rebuilding.
    // Normalising here rather than in main() is deliberate: this function owns the source-text →
    // data step, so the invariant holds for every caller.
    const sourceFile = ts.createSourceFile(file, normalizeEol(text), ts.ScriptTarget.Latest, /*setParentNodes*/ true);
    // ALL of them, not one per file: `pdx-toggle-group` is declared beside `pdx-toggle` in the same
    // module, and reading only the first would leave it out of the manifest, the site's index,
    // llms.txt and auto-import, while importing the module registers both.
    return findComponentCalls(sourceFile).map(found =>
        analyzeComponent(found, { file, text, sourceFile, categories, shared: findComponentCalls(sourceFile).length > 1 }));
}

/**
 * One component's manifest module.
 *
 * `shared` says the file declares more than one. Two of the scans below are file-wide — emitted
 * events read the raw text, exposed methods walk the whole tree — and attributing one component's
 * events to its neighbour would put wrong data in the manifest, which is worse than the gap this
 * fixes. So in a shared file both are narrowed to the component's own statement. A file with a
 * single component keeps the file-wide reading.
 */
function analyzeComponent(found, { file, text, sourceFile, categories, shared }) {
    const { statement, tag, optionsObj } = found;
    const scanText = shared ? statement.getText(sourceFile) : text;
    const scanNode = shared ? statement : sourceFile;
    const cat = categories[tag] || { category: 'Other', order: 999 };
    const models = extractModels(optionsObj, sourceFile);
    // A variant axis is a String prop typed with its values (#512); it replaces a prop of its name.
    const { axes: variants, descriptions } = extractVariants(optionsObj, sourceFile);
    const variantProps = variants.map(v => ({
        name: v.name, type: v.values.map(x => `'${x}'`).join(' | '), runtime: 'string', default: `'${v.default}'`,
        iconName: false, description: descriptions.get(v.name) ?? describeProp(v.name),
    }));
    const props = [
        ...extractProps(optionsObj, sourceFile, tag).filter(p => !variants.some(v => v.name === p.name)),
        ...variantProps, ...models,
    ];
    // A type parameter (#651) types the array prop it is inferred from as `T[]`: what the editor infers
    // `T` from, at a parent's `:items`, to type the snippets that use it. Its DataSource prop (#853) is
    // typed `DataSource<T>`, written as core's, so `:source` infers it too.
    const generics = extractGenerics(optionsObj, sourceFile);
    for (const g of generics) {
        const from = g.from && props.find(p => p.name === g.from);
        if (from) from.type = `${g.name}[]`;
        const source = g.source && props.find(p => p.name === g.source);
        if (source) source.type = `import('@pdxui/core').DataSource<${g.name}> | null`;
    }
    const tags = jsdocTags(statement);

    // Events: JSDoc @fires (authoritative) merged with heuristic emit() scan.
    //
    // The detail of each is read off the emit calls — in the component's own statement when the file
    // declares more than one component, otherwise in the file AND its helper files, since a component
    // that grew emits from them too. A typed `@fires name {Type}` wins: it is what a detail the
    // calls cannot show (a value, a call) is declared with.
    const helpers = shared ? [] : helperFiles(file).map(f => {
        const helperText = normalizeEol(readFileSync(f, 'utf-8'));
        return { text: helperText, sourceFile: ts.createSourceFile(f, helperText, ts.ScriptTarget.Latest, true) };
    });
    const emitted = scanEmitDetails(scanNode, sourceFile);
    for (const h of helpers) scanEmitDetails(h.sourceFile, h.sourceFile, emitted);
    // Roles are read with the comments blanked out, in the component's own statement when the file
    // declares more than one.
    const cleanText = withoutComments(sourceFile);
    const roleText = shared ? cleanText.slice(statement.getStart(sourceFile), statement.getEnd()) : cleanText;
    // What ctx.expose({...}) puts on the element: methods, getters, and objects with their keys.
    const methods = scanExposedMethods(scanNode).map(({ name, getter, description, object, params }) => (
        object ? { name, kind: 'object', objectType: objectShape(object, sourceFile), description }
            : getter ? { name, kind: 'getter', description }
                : { name, kind: 'method', params, description }));

    return assembleModule({
        file, tag, category: cat, tags, description: jsdocDescription(statement), props,
        models: models.map(m => m.name),
        generics: generics.map(g => (g.extends ? `${g.name} extends ${g.extends}` : g.name)),
        formAssociated: hasFormModel(optionsObj, sourceFile),
        variants,
        declaredEvents: extractDescriptorEvents(optionsObj, sourceFile),
        emitted,
        emittedNames: [...scanEmittedEvents(scanText), ...emitted.keys()],
        roles: scanRoles([roleText, ...helpers.map(h => withoutComments(h.sourceFile))].join('\n')),
        renderedSlots: scanSlots(scanText),
        slotSignatures: extractSlotSignatures(optionsObj, sourceFile),
        parts: stringArrayField(optionsObj, sourceFile, 'parts'),
        states: stringArrayField(optionsObj, sourceFile, 'states'),
        methods,
        // The interfaces this module exports, so a reader of `items: array` can see what an item is.
        // sourceFile, not scanNode: interfaces are module-level, and a file declaring two components
        // shares them. scanNode narrows to one component() statement for those files.
        shapes: scanExportedShapes(sourceFile, file),
        // The contexts it provides and reads (#498), in its own statement or file and its helpers.
        contexts: scanContexts([scanNode, ...helpers.map(h => h.sourceFile)], new Set(props.map(p => p.name))),
    });
}

// ─── Main ───────────────────────────────────────────────────────────

/**
 * The context tokens a component provides and injects (#498), read off its `provide(token, …)` and
 * `inject(token, …)` calls. A token is an identifier that starts upper-case (`DataSourceContext`); a
 * lower-case identifier named like one of the props is the token that prop carries, listed as `:prop`
 * (`<pdx-provide :token>`); anything else (a key taken from a map) is not knowable here, and is left
 * out. An inject is optional when it passes a fallback, its third argument.
 */
function scanContexts(nodes, propNames) {
    const provides = [];
    const injects = [];
    const visit = (n) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.arguments.length > 0 && ts.isIdentifier(n.arguments[0])) {
            const fn = n.expression.text;
            const arg = n.arguments[0].text;
            const token = /^[A-Z]/.test(arg) ? arg : propNames.has(arg) ? `:${arg}` : null;
            if (token && fn === 'provide' && !provides.includes(token)) provides.push(token);
            if (token && fn === 'inject' && !injects.some(i => i.token === token)) injects.push({ token, optional: n.arguments.length >= 3 });
        }
        ts.forEachChild(n, visit);
    };
    for (const node of nodes) visit(node);
    return { provides, injects };
}

/**
 * The whole manifest, built from the sources, without writing anything.
 *
 * Exported so a test can regenerate it in memory and compare it against the committed file. That
 * comparison is the point: `custom-elements.json` is COMMITTED, not built on demand — the
 * compiler's auto-import, the LSP's index, the site's llms.txt and the behaviour helpers all read
 * the file that is in the repo — and it can drift from the sources in silence: a default, a missing
 * event, an event order. A test that only READS the manifest agrees with whatever was committed; it
 * is its own oracle.
 *
 * The walk lives here rather than in the test on purpose. A second implementation of "which files
 * are components" would drift from this one, and the check would end up comparing the generator
 * against a copy of itself.
 */
export function buildManifest() {
    const categories = parseCategories();
    const files = collectComponentFiles(SRC).sort();
    const modules = [];
    let skipped = 0;
    for (const file of files) {
        const text = readFileSync(file, 'utf-8');
        const mods = analyzeFile(file, text, categories);
        if (mods.length) modules.push(...mods);
        else skipped++;
    }
    // Each component's tokens, read from the design CSS (#154), after any `@cssprop` its source documents.
    const decls = modules.map((m) => m.declarations[0]);
    const tokens = componentTokens(decls.map((d) => d.tagName.replace(/^pdx-/, '')), join(UI_ROOT, '..', 'design', 'src'));
    for (const d of decls) {
        const found = tokens.get(d.tagName.replace(/^pdx-/, '')) ?? [];
        const props = [...(d.cssProperties ?? []), ...found.filter((t) => !(d.cssProperties ?? []).some((p) => p.name === t.name))];
        if (props.length) d.cssProperties = props;
    }
    return { manifest: { schemaVersion: '1.0.0', readme: '', modules }, skipped };
}

/** Where the committed manifest lives — one definition, shared by the writer and the test. */
export const MANIFEST_PATH = join(UI_ROOT, 'custom-elements.json');

// Behind a main() so importing this file cannot rewrite custom-elements.json — the same reason
// gen-exports.mjs keeps computeExports pure. The tests exercise analyzeFile and buildManifest.
function main() {
    const { manifest, skipped } = buildManifest();
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

    const { modules } = manifest;
    const totalProps = modules.reduce((n, m) => n + m.declarations[0].attributes.length, 0);
    const withEvents = modules.filter(m => m.declarations[0].events).length;
    console.log(`[gen-manifest] ${modules.length} components, ${totalProps} props, ${withEvents} with events. Skipped ${skipped} files (no component() call).`);
    const undescribed = modules.flatMap(m => (m.declarations[0].members ?? [])
        .filter(x => x.kind === 'method' && !x.description)
        .map(x => `${m.declarations[0].tagName}.${x.name}()`));
    if (undescribed.length) console.log(`[gen-manifest] ${undescribed.length} exposed methods have no description (a JSDoc on the expose): ${undescribed.slice(0, 8).join(', ')}${undescribed.length > 8 ? ', …' : ''}`);
    console.log(`[gen-manifest] → ${relative(process.cwd(), MANIFEST_PATH)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
