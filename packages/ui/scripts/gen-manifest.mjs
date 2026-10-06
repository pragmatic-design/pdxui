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
//   - summary/description   ← JSDoc on the component() statement
//
// Usage: node scripts/gen-manifest.mjs   (writes packages/ui/custom-elements.json)

import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(__dirname, '..');
const SRC = join(UI_ROOT, 'src');

/** CRLF (and lone CR) → LF. Every piece of prose that reaches the manifest goes through this. */
export function normalizeEol(text) {
    return text.replace(/\r\n?/g, '\n');
}

// Curated descriptions for component-specific props (keyed 'tag:prop'). JSDoc still wins; this fills
// props whose meaning is too component-specific to auto-derive from the name.
// Normalised on read for the same reason as the component sources: this file is edited by hand and
// carries multi-line descriptions, so a Windows checkout would feed CRLF straight into the JSON.
let PROP_DESC = {};
try { PROP_DESC = JSON.parse(normalizeEol(readFileSync(join(UI_ROOT, 'prop-descriptions.json'), 'utf8'))); } catch { /* optional */ }

// ─── Categories + order (from the section comments of src/index.ts) ──────

/** Parse src/index.ts: maps tag → { category, order } from the barrel's sections. */
function parseCategories() {
    const map = {};
    let category = 'Other';
    let order = 0;
    let text = '';
    try { text = readFileSync(join(SRC, 'index.ts'), 'utf-8'); } catch { return map; }
    for (const line of text.split(/\r?\n/)) {
        const tier = /^\/\/\s*Tier\s*[^:]*:\s*(.+?)\s*$/.exec(line);
        if (tier) { category = tier[1]; continue; }
        if (/^\/\/\s*Infrastructure/.test(line)) { category = 'Infrastructure'; continue; }
        const imp = /^import\s+'\.\/[^/]+\/(pdx-[\w-]+)'/.exec(line);
        if (imp) map[imp[1]] = { category, order: order++ };
    }
    return map;
}

// ─── File discovery ─────────────────────────────────────────────────

/** Recursively collect every pdx-*.ts under src/. */
const SKIP_DIRS = new Set();

function collectComponentFiles(dir) {
    const out = [];
    for (const item of readdirSync(dir)) {
        if (SKIP_DIRS.has(item)) continue;
        const full = join(dir, item);
        if (statSync(full).isDirectory()) out.push(...collectComponentFiles(full));
        else if (/^pdx-.*\.ts$/.test(item)) out.push(full);
    }
    return out;
}

// ─── AST helpers ────────────────────────────────────────────────────

const TYPE_MAP = { String: 'string', Number: 'number', Boolean: 'boolean', Array: 'array', Object: 'object' };

/** tag `pdx-badge` → class-ish name `PdxBadge`. */
function tagToName(tag) {
    return tag.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** First JSDoc description text on a node (the prose before any @tag), or ''. */
function jsdocDescription(node) {
    const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
    for (const d of docs) {
        if (typeof d.comment === 'string' && d.comment.trim()) return d.comment.trim();
    }
    return '';
}

/** All JSDoc @tags on a node as { tag, text }. */
function jsdocTags(node) {
    const out = [];
    for (const t of ts.getJSDocCommentsAndTags(node)) {
        if (ts.isJSDoc(t) && t.tags) {
            for (const tag of t.tags) {
                const text = typeof tag.comment === 'string'
                    ? tag.comment
                    : (tag.comment?.map(c => c.text).join('') ?? '');
                out.push({ tag: tag.tagName.text, text: text.trim() });
            }
        }
    }
    return out;
}

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

/** Split a JSDoc tag body "name - description" (or "name description") into {name, description}. */
function splitNameDesc(text) {
    const m = text.match(/^(\S+)\s*-\s*(.*)$/s) || text.match(/^(\S+)\s+(.*)$/s);
    if (m) return { name: m[1], description: m[2].trim() };
    return { name: text.trim(), description: '' };
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
        if (!ts.isPropertyAssignment(decl) || !ts.isObjectLiteralExpression(decl.initializer)) continue;
        const name = decl.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        let type = 'string';
        let def;
        let enumType = null;   // an `enum: [...]` field → string-literal union (drives playground dropdown + IntelliSense)
        for (const field of decl.initializer.properties) {
            if (!ts.isPropertyAssignment(field)) continue;
            const key = field.name.getText(sourceFile);
            if (key === 'type') {
                const t = field.initializer.getText(sourceFile);
                type = TYPE_MAP[t] ?? t.toLowerCase();
            } else if (key === 'default') {
                def = field.initializer.getText(sourceFile);
            } else if (key === 'enum' && ts.isArrayLiteralExpression(field.initializer)) {
                const lits = field.initializer.elements.filter(e => ts.isStringLiteralLike(e)).map(e => `'${e.text}'`);
                if (lits.length >= 2) enumType = lits.join(' | ');
            }
        }
        // A declared `default: null` on a primitive is part of the type: the prop can hold null, and
        // does until someone sets it (pdx-number-input's empty value).
        if (def === 'null' && !enumType && (type === 'number' || type === 'string')) type += ' | null';
        // `@type number | 'auto'` on the prop's JSDoc wins over the runtime constructor. A prop that
        // accepts two shapes has to be DECLARED as one of them — `columns` is String so the word
        // survives the attribute — and without this the catalogue would say `string` beside prose
        // promising a number, leaving an agent no way to know which one the code believes.
        const declaredType = jsdocDeclaredType(decl, sourceFile);
        props.push({ name, type: declaredType || enumType || type, default: def, description: jsdocDescription(decl) || PROP_DESC[`${tag}:${name}`] || describeProp(name) });
    }
    return props;
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
 * `@fires name {Type} - description` → { name, type, description }. The type is optional and may
 * itself contain braces (`{{ value, hex }}`), so it is read by matching them, not by a regex.
 */
function parseFires(text) {
    const m = text.match(/^(\S+)\s*/);
    if (!m) return { name: text.trim(), type: '', description: '' };
    const name = m[1];
    let rest = text.slice(m[0].length);
    let type = '';
    if (rest.startsWith('{')) {
        let depth = 0, i = 0;
        for (; i < rest.length; i++) {
            if (rest[i] === '{') depth++;
            else if (rest[i] === '}' && --depth === 0) break;
        }
        type = rest.slice(1, i).trim();
        rest = rest.slice(i + 1).trim();
    }
    return { name, type, description: rest.replace(/^-\s*/, '').trim() };
}

/**
 * The ARIA roles a component renders — what a test or a measuring script targets. Read from
 * `role="x"`, `setAttribute('role', 'x')`, and every quoted role inside a bound
 * `role="${() => cond ? 'a' : 'b'}"`: pdx-select's trigger is a combobox only when searchable, a
 * button otherwise, and measuring code that does not know that fails on half the selects.
 *
 * A role the component only LOOKS FOR is not one it renders: `role="x"` inside an attribute selector
 * (`querySelector('[role="heading"]')`) is skipped, and `text` comes with its comments blanked out
 * (`withoutComments`). Otherwise pdx-popover would publish a heading it only queries, and pdx-label
 * and pdx-form-field a combobox, a radiogroup and a group.
 */
function scanRoles(text) {
    const roles = new Set();
    for (const m of text.matchAll(/(?<!\[)\brole=(["'])([\w-]+)\1/g)) roles.add(m[2]);
    // A literal, or the values of an expression up to the `);` that ends the statement:
    // `setAttribute('role', ctx.mode() === 'single' ? 'radiogroup' : 'group');`.
    for (const m of text.matchAll(/setAttribute\(\s*['"]role['"]\s*,\s*['"]([\w-]+)['"]\s*\)/g)) roles.add(m[1]);
    for (const m of text.matchAll(/setAttribute\(\s*['"]role['"]\s*,\s*(.*?)\)\s*;/g)) {
        for (const r of valueLiterals(m[1])) roles.add(r);
    }
    for (const m of text.matchAll(/(?<!\[)\brole="\$\{([^}]*)\}"/g)) {
        for (const r of valueLiterals(m[1])) roles.add(r);
    }
    return [...roles].sort();
}

/** The quoted words of an expression that are values it yields, not operands of a comparison
 *  (`mode === 'single' ? 'radiogroup' : 'group'` yields radiogroup and group, not single). */
function valueLiterals(expr) {
    const out = [];
    for (const q of expr.matchAll(/(['"])([\w-]+)\1/g)) {
        const before = expr.slice(0, q.index).trimEnd();
        const after = expr.slice(q.index + q[0].length).trimStart();
        // Parentheses between the word and the operator do not make it a value: `(x || 'both') === 'none'`.
        if (/[=!]=\s*\(*$/.test(before) || /^[\s)]*[=!]==?/.test(after)) continue;
        out.push(q[2]);
    }
    return out;
}

/**
 * The file's text with every comment replaced by spaces (newlines kept). The comment ranges come from
 * the parsed tree, so `//` inside a string or a template — a URL in markup — is text, not a comment:
 * a regex cannot tell them apart. A comment quoting `role="button"` would give pdx-select a false
 * button role.
 */
function withoutComments(sourceFile) {
    const text = sourceFile.getFullText();
    const chars = text.split('');
    const blank = ({ pos, end }) => { for (let i = pos; i < end; i++) if (chars[i] !== '\n') chars[i] = ' '; };
    const visit = (node) => {
        for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) blank(r);
        for (const r of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) blank(r);
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return chars.join('');
}

/**
 * The slots a component renders: `<slot>` is the default one (name ''), `<slot name="x">` a named
 * one. A tool that shows a component needs to know whether its children are content or ignored —
 * `<pdx-badge value="5">badge</pdx-badge>` looks right, while the badge renders its value and drops
 * the text. A name bound at runtime is not a name this can read, and
 * is left out rather than guessed.
 */
function scanSlots(text) {
    const names = new Set();
    for (const m of text.matchAll(/<slot\b([^>]*)>/g)) {
        const attrs = m[1];
        const named = attrs.match(/\bname=(["'])([\w-]+)\1/);
        if (named) names.add(named[2]);
        else if (!/\bname=/.test(attrs)) names.add('');
    }
    return [...names].sort();
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

// Universal prop names with a constant meaning across components — safe to auto-describe when the
// component supplies no JSDoc. Component-specific props are left blank (semantics vary too much).
const UNIVERSAL_PROPS = {
    size: 'Size of the control (e.g. sm, md, lg).',
    disabled: 'Disables interaction and dims the control.',
    readonly: 'Makes the value read-only — visible but not editable.',
    loading: 'Shows a loading / busy state.',
    error: 'Marks the control as invalid.',
    value: 'The current value.',
    placeholder: 'Placeholder text shown while empty.',
    name: 'Form field name, submitted with the form.',
    label: 'Visible label text.',
    required: 'Marks the field as required.',
    checked: 'Whether it is checked / on.',
    open: 'Whether it is open.',
    variant: 'Visual variant.',
    clearable: 'Shows a clear button to reset the value.',
    ariaLabel: 'Accessible name when there is no visible label.',
    min: 'Minimum allowed value.',
    max: 'Maximum allowed value.',
    step: 'Increment step.',
    orientation: 'Layout orientation — horizontal or vertical.',
    placement: 'Position relative to the anchor element.',
    bordered: 'Adds a border.',
    rounded: 'Rounds the corners.',
    separator: 'The separator between items.',
    description: 'Secondary descriptive text.',
    clickable: 'Whether items are clickable.',
    closeOnEscape: 'Close when the Escape key is pressed.',
    labelPosition: 'Where the label sits relative to the control.',
    success: 'Applies the success state styling.',
    warning: 'Applies the warning state styling.',
    icon: 'Icon to display.',
    color: 'Colour of the component.',
    items: 'The data items to render.',
    source: 'The data source to render from.',
    selected: 'The currently selected item(s).',
    multiple: 'Allow selecting more than one.',
    closable: 'Shows a close affordance.',
    fullWidth: 'Stretches to the full width of its container.',
    locale: 'BCP-47 locale used for formatting.',
};
function describeProp(name) { return UNIVERSAL_PROPS[name] || ''; }

/** A conventional description for a pdx-* event when no @fires JSDoc supplies one. Event names follow
 *  a tight convention, so this is safe (unlike prop descriptions, which we never auto-generate). */
function describeEvent(name) {
    const n = name.replace(/^pdx-/, '');
    const map = {
        change: 'Fired when the value changes.',
        input: 'Fired on each input as the user types.',
        open: 'Fired when it opens.',
        close: 'Fired when it closes.',
        toggle: 'Fired when toggled open or closed.',
        select: 'Fired when an item is selected.',
        clear: 'Fired when the value is cleared.',
        focus: 'Fired when it receives focus.',
        blur: 'Fired when it loses focus.',
        submit: 'Fired when the form is submitted.',
        reset: 'Fired when the form is reset.',
        dismiss: 'Fired when dismissed.',
        confirm: 'Fired when confirmed.',
        cancel: 'Fired when cancelled.',
        navigate: 'Fired on navigation.',
        search: 'Fired when a search is performed.',
        create: 'Fired when a new item is created.',
        remove: 'Fired when an item is removed.',
        sort: 'Fired when the sort order changes.',
        expand: 'Fired when expanded.',
        collapse: 'Fired when collapsed.',
        load: 'Fired when content has loaded.',
        error: 'Fired when an error occurs.',
    };
    if (map[n]) return map[n];
    if (n.endsWith('-change')) return `Fired when the ${n.replace(/-change$/, '').replace(/-/g, ' ')} changes.`;
    if (n.endsWith('-click')) return `Fired when the ${n.replace(/-click$/, '').replace(/-/g, ' ')} is clicked.`;
    return `Fired on \`${name}\`.`;
}

/**
 * The interfaces a component's own module exports, with their fields.
 *
 * A prop of type `array` or `object` tells a reader nothing: an array of WHAT? "items · array · The
 * data items to render" on `pdx-breadcrumb` leads a reader to pass `[{ label }]` without learning
 * that `BreadcrumbItem` also has `href` — and to ship a breadcrumb that renders and does not
 * navigate. No error, nothing to notice.
 *
 * The shapes are read from the source rather than declared a second time on the prop: every
 * array/object prop would be one more place to keep in sync, and a shape that drifts from its interface is worse than
 * one that is merely absent.
 */
function interfacesIn(sourceFile) {
    const out = [];
    for (const st of sourceFile.statements) {
        if (!ts.isInterfaceDeclaration(st)) continue;
        if (!st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        const fields = st.members
            .filter(m => ts.isPropertySignature(m) && m.name)
            .map(m => {
                const name = m.name.getText(sourceFile);
                const optional = m.questionToken ? '?' : '';
                const type = m.type ? m.type.getText(sourceFile).replace(/\s+/g, ' ') : 'unknown';
                return `${name}${optional}: ${type}`;
            });
        if (fields.length) out.push({ name: st.name.getText(sourceFile), fields });
    }
    return out;
}

function scanExportedShapes(sourceFile, componentFile) {
    const shapes = interfacesIn(sourceFile);
    const seen = new Set(shapes.map(s => s.name));

    // A component split across a folder keeps its types next door: `pdx-data-grid` declares no
    // interfaces of its own, and `ColumnDef` lives in `data-grid/grid-context.ts`. Take the
    // siblings' exported interfaces too, but only the ones this component actually NAMES — a folder
    // like data-grid/ exports dozens, and a wall of unrelated types is as unreadable as none.
    const text = sourceFile.getFullText();
    let siblings = [];
    try { siblings = readdirSync(dirname(componentFile)).filter(f => f.endsWith('.ts') && !f.startsWith('pdx-')); }
    catch { /* no folder, no siblings */ }
    for (const sib of siblings) {
        const full = join(dirname(componentFile), sib);
        const sf = ts.createSourceFile(full, normalizeEol(readFileSync(full, 'utf8')), ts.ScriptTarget.Latest, true);
        for (const shape of interfacesIn(sf)) {
            if (seen.has(shape.name)) continue;
            if (!new RegExp(`\\b${shape.name}\\b`).test(text)) continue;
            seen.add(shape.name);
            shapes.push(shape);
        }
    }
    return shapes;
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
 * The function a name refers to, declared in the same file: `ctx.expose({ goTo })` is the common
 * form, and its parameters live on `function goTo(targetIndex)` in the setup. Only a declaration
 * or a `const x = (…) => …` is followed — resolving further is a type checker's job, and this is
 * a generator.
 */
function declaredFunction(name, sourceFile) {
    let found = null;
    const visit = (node) => {
        if (found) return;
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) { found = node; return; }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
            && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            found = node.initializer; return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
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
    return fn.parameters.map(p => ({
        name: p.name.getText(sourceFile),
        ...(p.type ? { type: { text: p.type.getText(sourceFile) } } : {}),
        ...(p.questionToken || p.initializer ? { optional: true } : {}),
    }));
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

function describeMethod(name) {
    const map = {
        open: 'Opens it.', close: 'Closes it.', toggle: 'Toggles it open/closed.',
        show: 'Shows it.', hide: 'Hides it.', clear: 'Clears the value.', reset: 'Resets to the initial state.',
        focus: 'Moves focus to it.', blur: 'Removes focus from it.', submit: 'Submits it.',
        refresh: 'Reloads its data.', reload: 'Reloads its data.', validate: 'Runs validation and returns the result.',
        scrollTo: 'Scrolls to the given target.', next: 'Advances to the next item.', prev: 'Goes to the previous item.',
    };
    // No sentence for a method nobody described: "Imperative `expand()` method (call via a ref)." says
    // nothing the name does not. An empty description is honest, and the
    // count printed at the end of the run is the list to write.
    return map[name] || '';
}

// ─── Per-file extraction ────────────────────────────────────────────

export function analyzeFile(file, text, categories) {
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
    const props = extractProps(optionsObj, sourceFile, tag);
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
    const detailOf = (name, declared) => {
        if (declared) return declared;
        const e = emitted.get(name);
        return e && !e.opaque && e.shapes.size ? [...e.shapes].join(' | ') : undefined;
    };
    const events = [];
    const seenEvents = new Set();
    const addEvent = (name, description, declared) => {
        if (seenEvents.has(name)) return;
        const detail = detailOf(name, declared);
        // An event kept on the component says so: an app listening on an ancestor does not get it.
        const said = description || describeEvent(name);
        const text = emitted.get(name)?.noBubble ? `${said.replace(/\.?\s*$/, '.')} Does not bubble.` : said;
        events.push({ name, type: { text: 'CustomEvent' }, description: text, ...(detail ? { detail } : {}) });
        seenEvents.add(name);
    };
    for (const t of tags.filter(t => t.tag === 'fires' || t.tag === 'event')) {
        const { name, type, description } = parseFires(t.text);
        addEvent(name, description, type);
    }
    for (const name of scanEmittedEvents(scanText)) addEvent(name, '', '');
    for (const name of emitted.keys()) addEvent(name, '', '');
    // Roles are read with the comments blanked out, in the component's own statement when the file
    // declares more than one.
    const cleanText = withoutComments(sourceFile);
    const roleText = shared ? cleanText.slice(statement.getStart(sourceFile), statement.getEnd()) : cleanText;
    const roles = scanRoles([roleText, ...helpers.map(h => withoutComments(h.sourceFile))].join('\n'));

    // `@slot - desc` (leading dash, no name) is the default slot → empty name per CEM.
    const slots = tags.filter(t => t.tag === 'slot').map(t => {
        const s = splitNameDesc(t.text);
        return s.name === '-' ? { name: '', description: s.description } : s;
    });
    // …and every slot the component renders, documented or not.
    for (const name of scanSlots(scanText)) {
        if (!slots.some(s => s.name === name)) slots.push({ name, description: name ? '' : 'The content placed inside the element.' });
    }
    const cssParts = tags.filter(t => t.tag === 'csspart').map(t => splitNameDesc(t.text));
    const cssProperties = tags.filter(t => t.tag === 'cssprop' || t.tag === 'cssproperty').map(t => splitNameDesc(t.text));
    const summary = tags.find(t => t.tag === 'summary')?.text || '';
    const description = jsdocDescription(statement);

    const className = tagToName(tag);
    // Object/Array/Function props are PROP-ONLY in core (PROP_ONLY_TYPES) — set via JS
    // property, never reflected as an HTML attribute. They are fields, not attributes.
    const PROP_ONLY = new Set(['object', 'array', 'function']);
    const members = props.map(p => ({
        kind: 'field', name: p.name, ...(p.description ? { description: p.description } : {}),
        type: { text: p.type }, ...(p.default !== undefined ? { default: p.default } : {}),
        ...(PROP_ONLY.has(p.type) ? {} : { attribute: p.name.toLowerCase() }),
    }));
    // What ctx.expose({...}) puts on the element: methods to call through a ref, and getters to read
    // (a read-only field in the Custom Elements Manifest schema, with no attribute).
    const methods = scanExposedMethods(scanNode).map(({ name, getter, description, object, params }) => {
        // An object is not callable: publishing it as a method tells a reader to write
        // `el.scrollArea()`, which throws. It is a readonly field, like a getter, and its TYPE
        // carries the keys — they are the API, and they would appear nowhere else.
        if (object) {
            return {
                kind: 'field', name, readonly: true, type: { text: objectShape(object, sourceFile) },
                description: description || `Read-only, via a ref: \`el.${name}\`.`,
            };
        }
        if (getter) {
            return { kind: 'field', name, readonly: true, description: description || `Read-only, via a ref: \`el.${name}\`.` };
        }
        return { kind: 'method', name, ...(params ? { parameters: params } : {}), description: description || describeMethod(name) };
    });
    // The interfaces this module exports, so a reader of `items: array` can see what an item is.
    // sourceFile, not scanNode: interfaces are module-level, and a file declaring two components
    // shares them. scanNode narrows to one component() statement for those files.
    const shapes = scanExportedShapes(sourceFile, file);
    for (const mm of methods) members.push(mm);
    const attributes = props.filter(p => !PROP_ONLY.has(p.type)).map(p => ({
        name: p.name.toLowerCase(), fieldName: p.name,
        ...(p.description ? { description: p.description } : {}),
        type: { text: p.type }, ...(p.default !== undefined ? { default: p.default } : {}),
    }));

    return {
        kind: 'javascript-module',
        path: relative(UI_ROOT, file).replace(/\\/g, '/'),
        declarations: [{
            kind: 'class', customElement: true, name: className, tagName: tag,
            category: cat.category, order: cat.order,
            ...(summary ? { summary } : {}), ...(description ? { description } : {}),
            members,
            ...(events.length ? { events } : {}),
            ...(roles.length ? { roles } : {}),
            attributes,
            ...(shapes.length ? { shapes } : {}),
            ...(slots.length ? { slots } : {}),
            ...(cssParts.length ? { cssParts } : {}),
            ...(cssProperties.length ? { cssProperties } : {}),
        }],
        exports: [{
            kind: 'custom-element-definition', name: tag,
            declaration: { name: className, module: relative(UI_ROOT, file).replace(/\\/g, '/') },
        }],
    };
}

// ─── Main ───────────────────────────────────────────────────────────

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
