// What the two readers of the manifest share (#1003): gen-manifest.mjs reads a TypeScript
// component() from its descriptor, manifest-pdx.mjs reads a .pdx from the compiler's description.
// Each reader extracts what its source declares; this module turns it into one CEM module, so a
// component reads the same whichever language it is written in. JSDoc is parsed here for both: a
// .pdx's doc comments go through the same TypeScript JSDoc reading as a component()'s.

import ts from 'typescript';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UI_ROOT = join(__dirname, '..');

/** CRLF (and lone CR) → LF. Every piece of prose that reaches the manifest goes through this. */
export function normalizeEol(text) {
    return text.replace(/\r\n?/g, '\n');
}

// Curated descriptions for component-specific props (keyed 'tag:prop'). JSDoc still wins; this fills
// props whose meaning is too component-specific to auto-derive from the name.
// Normalised on read for the same reason as the component sources: this file is edited by hand and
// carries multi-line descriptions, so a Windows checkout would feed CRLF straight into the JSON.
export let PROP_DESC = {};
try { PROP_DESC = JSON.parse(normalizeEol(readFileSync(join(UI_ROOT, 'prop-descriptions.json'), 'utf8'))); } catch { /* optional */ }

/** tag `pdx-badge` → class-ish name `PdxBadge`. */
export function tagToName(tag) {
    return tag.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

// ─── JSDoc ──────────────────────────────────────────────────────────

/** First JSDoc description text on a node (the prose before any @tag), or ''. */
export function jsdocDescription(node) {
    const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
    for (const d of docs) {
        if (typeof d.comment === 'string' && d.comment.trim()) return d.comment.trim();
    }
    return '';
}

/** All JSDoc @tags on a node as { tag, text }. */
export function jsdocTags(node) {
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
 * A doc comment as written (`/** … *\/`), read as TypeScript reads the JSDoc above a declaration:
 * { description, tags }. It is put above a declaration of its own and read off it, so a .pdx's doc
 * comment and a component()'s are one reading.
 */
export function readDocComment(comment) {
    if (!comment) return { description: '', tags: [] };
    const sf = ts.createSourceFile('doc.ts', `${normalizeEol(comment)}\nvar __doc__;`, ts.ScriptTarget.Latest, true);
    const statement = sf.statements[0];
    return { description: jsdocDescription(statement), tags: jsdocTags(statement) };
}

/** Split a JSDoc tag body "name - description" (or "name description") into {name, description}. */
export function splitNameDesc(text) {
    const m = text.match(/^(\S+)\s*-\s*(.*)$/s) || text.match(/^(\S+)\s+(.*)$/s);
    if (m) return { name: m[1], description: m[2].trim() };
    return { name: text.trim(), description: '' };
}

/**
 * `@fires name {Type} - description` → { name, type, description }. The type is optional and may
 * itself contain braces (`{{ value, hex }}`), so it is read by matching them, not by a regex.
 */
export function parseFires(text) {
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

/** The event a model dispatches, as core names it: `selectedId` → `selected-id-change`. */
export function modelEventName(name) {
    return `${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}-change`;
}

// ─── Scans over markup and code ─────────────────────────────────────

/**
 * The ARIA roles a component renders — what a test or a measuring script targets. Read from
 * `role="x"`, `setAttribute('role', 'x')`, and every quoted role inside a bound
 * `role="${() => cond ? 'a' : 'b'}"`, or a .pdx's `:role="cond ? 'a' : 'b'"`: pdx-select's trigger is a
 * combobox only when searchable, a button otherwise, and measuring code that does not know that fails
 * on half the selects.
 *
 * A role the component only LOOKS FOR is not one it renders: `role="x"` inside an attribute selector
 * (`querySelector('[role="heading"]')`) is skipped, and `text` comes with its comments blanked out
 * (`withoutComments`). Otherwise pdx-popover would publish a heading it only queries, and pdx-label
 * and pdx-form-field a combobox, a radiogroup and a group.
 */
export function scanRoles(text) {
    const roles = new Set();
    for (const m of text.matchAll(/(?<![[:])\brole=(["'])([\w-]+)\1/g)) roles.add(m[2]);
    // A literal, or the values of an expression up to the `);` that ends the statement:
    // `setAttribute('role', ctx.mode() === 'single' ? 'radiogroup' : 'group');`.
    for (const m of text.matchAll(/setAttribute\(\s*['"]role['"]\s*,\s*['"]([\w-]+)['"]\s*\)/g)) roles.add(m[1]);
    for (const m of text.matchAll(/setAttribute\(\s*['"]role['"]\s*,\s*(.*?)\)\s*;/g)) {
        for (const r of valueLiterals(m[1])) roles.add(r);
    }
    for (const m of text.matchAll(/(?<!\[)\brole="\$\{([^}]*)\}"/g)) {
        for (const r of valueLiterals(m[1])) roles.add(r);
    }
    // A .pdx binding: `:role="inputInTrigger ? null : 'combobox'"`. Match: `:role="…"`. Groups: [1]=the expression
    for (const m of text.matchAll(/(?<![\w-]):role="([^"]*)"/g)) {
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
export function withoutComments(sourceFile) {
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
export function scanSlots(text) {
    const names = new Set();
    for (const m of text.matchAll(/<slot\b([^>]*)>/g)) {
        const attrs = m[1];
        const named = attrs.match(/\bname=(["'])([\w-]+)\1/);
        if (named) names.add(named[2]);
        else if (!/\bname=/.test(attrs)) names.add('');
    }
    return [...names].sort();
}

// ─── Exported shapes ────────────────────────────────────────────────

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

/**
 * The shapes a component's module exports, and those of its folder's `.ts` files that it names.
 * `sourceFile` is the component's code; `text`, what it is searched for the names in (its whole
 * source: for a .pdx, the template too).
 */
export function scanExportedShapes(sourceFile, componentFile, text = sourceFile.getFullText()) {
    const shapes = interfacesIn(sourceFile);
    const seen = new Set(shapes.map(s => s.name));

    // A component split across a folder keeps its types next door: `pdx-data-grid` declares no
    // interfaces of its own, and `ColumnDef` lives in `data-grid/grid-context.ts`. Take the
    // siblings' exported interfaces too, but only the ones this component actually NAMES — a folder
    // like data-grid/ exports dozens, and a wall of unrelated types is as unreadable as none.
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

// ─── Functions ──────────────────────────────────────────────────────

/**
 * The function a name refers to, declared in the same file: `ctx.expose({ goTo })` is the common
 * form, and its parameters live on `function goTo(targetIndex)` in the setup. Only a declaration
 * or a `const x = (…) => …` is followed — resolving further is a type checker's job, and this is
 * a generator.
 */
export function declaredFunction(name, sourceFile) {
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

/** A function's parameters as the manifest lists them: name, its type when written, optional when it may be left out. */
export function functionParameters(fn, sourceFile) {
    return fn.parameters.map(p => ({
        name: p.name.getText(sourceFile),
        ...(p.type ? { type: { text: p.type.getText(sourceFile) } } : {}),
        ...(p.questionToken || p.initializer ? { optional: true } : {}),
    }));
}

// ─── Descriptions by name ───────────────────────────────────────────

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
export function describeProp(name) { return UNIVERSAL_PROPS[name] || ''; }

/** A conventional description for a pdx-* event when no @fires JSDoc supplies one. Event names follow
 *  a tight convention, so this is safe (unlike prop descriptions, which we never auto-generate). */
export function describeEvent(name) {
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

export function describeMethod(name) {
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

// ─── The module ─────────────────────────────────────────────────────

/**
 * One component's CEM module, from what a reader extracted. Every field below is decided here, once,
 * for both languages.
 *
 * - `props`: the plain props, then the variant props, then the models, each { name, type, runtime,
 *   default?, description, iconName?, required? }; `models` the names of the models.
 * - `tags`: the component's JSDoc tags as { tag, text }; `description`, its prose.
 * - `declaredEvents`: name → { detail?, noBubble, description }, in declaration order.
 * - `emitted`: name → { shapes, opaque, noBubble } read off emit calls; `emittedNames`, the names
 *   in the order they were found (after the declared ones, the models' and the `@fires` tags).
 * - `renderedSlots`: the slot names the markup renders; `slotSignatures`: name → signature.
 * - `parts`, `states`: the descriptor's names, described by `@csspart` / `@cssstate` tags.
 * - `methods`: { name, kind: 'method' | 'getter' | 'object', params?, objectType?, description }.
 */
export function assembleModule(d) {
    const { file, tag, category, tags, props, models } = d;
    const detailOf = (name, declared) => {
        if (declared) return declared;
        const e = d.emitted.get(name);
        return e && !e.opaque && e.shapes.size ? [...e.shapes].join(' | ') : undefined;
    };
    const events = [];
    const seenEvents = new Set();
    const addEvent = (name, description, declared) => {
        if (seenEvents.has(name)) return;
        const detail = detailOf(name, declared);
        // An event kept on the component says so: an app listening on an ancestor does not get it.
        const said = description || describeEvent(name);
        const noBubble = d.emitted.get(name)?.noBubble || d.declaredEvents.get(name)?.noBubble;
        const text = noBubble ? `${said.replace(/\.?\s*$/, '.')} Does not bubble.` : said;
        events.push({ name, type: { text: 'CustomEvent' }, description: text, ...(detail ? { detail } : {}) });
        seenEvents.add(name);
    };
    // The descriptor's `events` first: its type argument is the detail's declared type (#123).
    for (const [name, e] of d.declaredEvents) addEvent(name, e.description, e.detail);
    // Each model's event (#124): dispatched when the component writes it, never bubbling.
    for (const m of props.filter(p => p.model)) addEvent(modelEventName(m.name), `Fired when the component writes \`${m.name}\`. Does not bubble.`, `{ value: ${m.type} }`);
    for (const t of tags.filter(t => t.tag === 'fires' || t.tag === 'event')) {
        const { name, type, description } = parseFires(t.text);
        addEvent(name, description, type);
    }
    for (const name of d.emittedNames) addEvent(name, '', '');

    // `@slot - desc` (leading dash, no name) is the default slot → empty name per CEM.
    const slots = tags.filter(t => t.tag === 'slot').map(t => {
        const s = splitNameDesc(t.text);
        return s.name === '-' ? { name: '', description: s.description } : s;
    });
    // …and every slot the component renders, documented or not.
    for (const name of d.renderedSlots) {
        if (!slots.some(s => s.name === name)) slots.push({ name, description: name ? '' : 'The content placed inside the element.' });
    }
    // …and the descriptor's declared slots with their signatures (#491).
    for (const [name, signature] of d.slotSignatures) {
        const known = slots.find(s => s.name === name);
        if (known) known.signature = signature;
        else slots.push({ name, description: '', signature });
    }
    const cssParts = tags.filter(t => t.tag === 'csspart').map(t => splitNameDesc(t.text));
    // The descriptor's `parts` (#134), each reached as `[data-part="name"]`; a `@csspart` describes it.
    for (const name of d.parts) {
        if (!cssParts.some(p => p.name === name)) cssParts.push({ name, description: `The element reached as \`[data-part="${name}"]\`.` });
    }
    const cssProperties = tags.filter(t => t.tag === 'cssprop' || t.tag === 'cssproperty').map(t => splitNameDesc(t.text));
    // The states (#132), described by a `@cssstate name - text` tag on the component, as for `@csspart`.
    const statesDescribed = new Map(tags.filter(t => t.tag === 'cssstate').map(t => {
        const s = splitNameDesc(t.text);
        return [s.name, s.description];
    }));
    const cssStates = d.states.map(name => ({ name, description: statesDescribed.get(name) || `Matched with \`:state(${name})\`.` }));
    // The capabilities (#292): `@capability <name> - <what it does>`, what an agent's page card says the
    // component can do — sortable, filterable, selectable, editable (library.md, «Accessibility»).
    const capabilities = tags.filter(t => t.tag === 'capability').map(t => splitNameDesc(t.text));
    // The alpha events the component no longer emits (#478): `@alphaevent <name>`, and how each alpha
    // `detail.<field>` reads in the beta, `@alphadetail <field> <expression>`. The compiler reports a
    // listener on one as a removed form; `pdx migrate` rewrites it with the detail map.
    const alphaEvents = tags.filter(t => t.tag === 'alphaevent').map(t => t.text.trim()).filter(Boolean);
    const alphaDetail = {};
    for (const t of tags.filter(t => t.tag === 'alphadetail')) {
        // Match: `<field> <expression>`. Groups: [1]=the field [2]=the expression
        const m = /^(\S+)\s+(\S[\s\S]*)$/.exec(t.text.trim());
        if (m) alphaDetail[m[1]] = m[2].trim();
    }
    // The alpha event that was the commit, apart from the live one (#479): `pdx migrate` moves a
    // listener on it to the inner input's native `change`, not to the model's event.
    const alphaCommit = tags.find(t => t.tag === 'alphacommit')?.text.trim() || '';
    // An alpha event that is now a declared event of another name (#481), `@alpharename <alpha> <new>`:
    // a picker's query, which is not its model.
    const alphaRename = {};
    for (const t of tags.filter(t => t.tag === 'alpharename')) {
        // Match: `<alpha event> <new event>`. Groups: [1]=the alpha event [2]=the new one
        const m = /^(\S+)\s+(\S+)$/.exec(t.text.trim());
        if (m) alphaRename[m[1]] = m[2];
    }
    const summary = tags.find(t => t.tag === 'summary')?.text || '';
    const description = d.description;

    const className = tagToName(tag);
    // Object/Array/Function props are PROP-ONLY in core (PROP_ONLY_TYPES) — set via JS
    // property, never reflected as an HTML attribute. They are fields, not attributes.
    const PROP_ONLY = new Set(['object', 'array', 'function']);
    const members = props.map(p => ({
        kind: 'field', name: p.name, ...(p.description ? { description: p.description } : {}),
        type: { text: p.type }, ...(p.default !== undefined ? { default: p.default } : {}),
        ...(PROP_ONLY.has(p.runtime) ? {} : { attribute: p.name.toLowerCase() }),
        ...(p.iconName ? { iconName: true } : {}),
        // A prop the host must set (`prop.required<T>()`): a use without it is PDX_PROP_REQUIRED (#130).
        ...(p.required ? { required: true } : {}),
    }));
    // What the component puts on the element: methods to call through a ref, and getters to read
    // (a read-only field in the Custom Elements Manifest schema, with no attribute).
    for (const m of d.methods) {
        // An object is not callable: publishing it as a method tells a reader to write
        // `el.scrollArea()`, which throws. It is a readonly field, like a getter, and its TYPE
        // carries the keys — they are the API, and they would appear nowhere else.
        if (m.kind === 'object') {
            members.push({ kind: 'field', name: m.name, readonly: true, type: { text: m.objectType }, description: m.description || `Read-only, via a ref: \`el.${m.name}\`.` });
        } else if (m.kind === 'getter') {
            members.push({ kind: 'field', name: m.name, readonly: true, description: m.description || `Read-only, via a ref: \`el.${m.name}\`.` });
        } else {
            members.push({ kind: 'method', name: m.name, ...(m.params ? { parameters: m.params } : {}), description: m.description || describeMethod(m.name) });
        }
    }
    const attributes = props.filter(p => !PROP_ONLY.has(p.runtime)).map(p => ({
        name: p.name.toLowerCase(), fieldName: p.name,
        ...(p.description ? { description: p.description } : {}),
        type: { text: p.type }, ...(p.default !== undefined ? { default: p.default } : {}),
    }));
    const path = relative(UI_ROOT, file).replace(/\\/g, '/');
    const { contexts } = d;

    return {
        kind: 'javascript-module',
        path,
        declarations: [{
            kind: 'class', customElement: true, name: className, tagName: tag,
            category: category.category, order: category.order,
            ...(summary ? { summary } : {}), ...(description ? { description } : {}),
            // Its type parameters (#651), as a .pdx's `@generic` records them: the editor types a
            // parent's snippet with them, inferred from the props that use them.
            ...(d.generics.length ? { generics: d.generics } : {}),
            members,
            // The props `::x` may bind (#124): the compiler's resolver reads them from here.
            ...(models.length ? { models } : {}),
            // Takes part in a form through a model declared `{ form: true }` (#135).
            ...(d.formAssociated ? { formAssociated: true } : {}),
            // The variant axes (#512): the design build checks its `@variant` rules against them, and
            // certification generates one scenario per value.
            ...(d.variants.length ? { variants: d.variants } : {}),
            ...(alphaEvents.length ? { alphaEvents } : {}),
            ...(Object.keys(alphaDetail).length ? { alphaDetail } : {}),
            ...(alphaCommit ? { alphaCommit } : {}),
            ...(Object.keys(alphaRename).length ? { alphaRename } : {}),
            ...(events.length ? { events } : {}),
            ...(d.roles.length ? { roles: d.roles } : {}),
            attributes,
            ...(d.shapes.length ? { shapes: d.shapes } : {}),
            ...(slots.length ? { slots } : {}),
            ...(cssParts.length ? { cssParts } : {}),
            ...(cssProperties.length ? { cssProperties } : {}),
            ...(cssStates.length ? { cssStates } : {}),
            // What the component offers to do, which an agent's page card reads (#292).
            ...(capabilities.length ? { capabilities } : {}),
            ...(contexts.provides.length || contexts.injects.length ? {
                'x-pdx-context': {
                    ...(contexts.provides.length ? { provides: contexts.provides } : {}),
                    ...(contexts.injects.length ? { injects: contexts.injects } : {}),
                },
            } : {}),
        }],
        exports: [{
            kind: 'custom-element-definition', name: tag,
            declaration: { name: className, module: path },
        }],
    };
}
