// Form-binding auto-wire of a form SECTION — a component whose script calls useForm()/tryUseForm():
// its form controls that have a `name` attribute are wired to the form above it, looked up at event
// time. Inside `<pdx-form :form>` nothing is wired by name since #128 (a control binds through its
// model, `::value="f.x"`; the name wiring there is PDX_REMOVED_FORM, `language/form-name-binding.ts`),
// and a section keeps this until #613 gives it an explicit binding.
//
// This pass runs BEFORE rewriteHtmlBindings, operating on the raw HTML nodes.
// It modifies HtmlNode.content strings to add the control's model (:value, :checked), its model's
// event (@value-change, @checked-change) and @pdx-blur on form controls, and :error, :touched,
// :warning on pdx-form-field wrappers.
//
// Rules:
//   1. Only in a section, and not inside a `<pdx-form :form>` the section draws itself
//   2. Only affects elements with a `name="yyy"` attribute
//   3. Never overwrites existing explicit bindings (:value, @value-change, `::`, etc.)

import type { TemplateNode, HtmlNode } from '../parser/template';
import { jsQuote } from './js-literal';
import { isSpace, openTags, type OpenTag } from '../text-scan';
import type { ModelEventLookup } from './compile-context';

// ─── Known Form Controls ──────────────────────────────────────

/** Per-instance form control registry. Avoids global mutation across plugin instances. */
export class FormControlRegistry {
    readonly tags: Set<string>;
    readonly checked: Set<string>;
    readonly textInput: Set<string>;
    readonly eventName: Record<string, string>;
    readonly valueExpr: Record<string, string>;

    constructor() {
        this.tags = new Set([
            'pdx-input', 'pdx-textarea', 'pdx-checkbox', 'pdx-switch',
            'pdx-radio', 'pdx-radio-group', 'pdx-checkbox-group',
            'pdx-select', 'pdx-slider', 'pdx-rating', 'pdx-number-input',
            'pdx-password-input', 'pdx-search-input', 'pdx-masked-input',
            'pdx-otp-input', 'pdx-pin-input', 'pdx-segmented',
            'pdx-tag-input', 'pdx-color-picker', 'pdx-autocomplete',
            'pdx-toggle', 'pdx-date-picker', 'pdx-time-picker',
        ]);
        // Every library value control declares a model (#125): the binding reads its model, its event
        // and its prop from the manifest (`modelEventOf`). These hold only what
        // `registerCompilerFormControl` registers for a custom control.
        this.checked = new Set();
        // The text fields declare their model too (#479); they stay here because the binding writes no
        // reactive `:value` to a field the user is typing in.
        this.textInput = new Set([
            'pdx-input', 'pdx-textarea', 'pdx-password-input',
            'pdx-search-input', 'pdx-masked-input',
        ]);
        this.eventName = {};
        this.valueExpr = {};
    }

    register(tagName: string, config?: { valueEvent?: string; valueExpr?: string; checked?: boolean; textInput?: boolean }): void {
        const tag = tagName.toLowerCase();
        this.tags.add(tag);
        if (config?.checked) this.checked.add(tag);
        if (config?.textInput) this.textInput.add(tag);
        if (config?.valueEvent) this.eventName[tag] = config.valueEvent;
        if (config?.valueExpr) this.valueExpr[tag] = config.valueExpr;
    }
}

// Default singleton for backward compat (registerCompilerFormControl API)
const _defaultRegistry = new FormControlRegistry();

/**
 * Register a custom element tag as a form control for compiler auto-wiring.
 * Note: mutates a global singleton. For per-instance isolation, use FormControlRegistry directly.
 */
export function registerCompilerFormControl(
    tagName: string,
    config?: { valueEvent?: string; valueExpr?: string; checked?: boolean; textInput?: boolean },
): void {
    _defaultRegistry.register(tagName, config);
}

// Aliases for backward compat — point to default registry
const FORM_CONTROL_TAGS = _defaultRegistry.tags;
const CHECKED_CONTROLS = _defaultRegistry.checked;
const TEXT_INPUT_CONTROLS = _defaultRegistry.textInput;
const EVENT_NAME = _defaultRegistry.eventName;
const VALUE_EXPR = _defaultRegistry.valueExpr;
/**
 * A control whose model is not known — a compile without the component registry, which reads it from
 * the manifest — is bound by the beta convention: the `value` model's event and its `detail.value`.
 * The alpha `pdx-change` was the fallback until #125; no library control emits it any more.
 */
const DEFAULT_EVENT = 'value-change';
const DEFAULT_VALUE_EXPR = 'e.detail?.value';

// ─── Main Entry ───────────────────────────────────────────────

/**
 * Walk all template AST nodes, find <pdx-form> blocks, and inject
 * form bindings on child controls. Modifies HtmlNode.content in-place.
 */
export function applyFormBindings(nodes: TemplateNode[], inherited?: FormCtx, modelEventOf?: ModelEventLookup | null): void {
    let formVar = inherited?.formVar ?? null;
    let depth = inherited?.depth ?? 0;
    let groupPath = inherited?.groupPath ? [...inherited.groupPath] : [];
    const base = inherited?.base;
    const lookup = modelEventOf ?? inherited?.modelEventOf ?? null;

    for (const node of nodes) {
        if (node.type === 'html') {
            const html = node as HtmlNode;
            html.content = processHtmlContent(html.content, { formVar, depth, groupPath, base, modelEventOf: lookup });
            const state = getFormState(html.content, formVar, depth, groupPath, base);
            formVar = state.formVar;
            depth = state.depth;
            groupPath = state.groupPath;
        } else {
            // Recurse into control-flow blocks, propagating form context
            const n = node as {
                body?: TemplateNode[]; elseBody?: TemplateNode[]; emptyBody?: TemplateNode[];
                catchBody?: TemplateNode[]; loading?: TemplateNode[]; error?: TemplateNode[];
                errorBody?: TemplateNode[]; placeholder?: TemplateNode[]; defaultBody?: TemplateNode[];
                cases?: { body?: TemplateNode[] }[];
            };
            const ctx: FormCtx = { formVar, depth, groupPath: [...groupPath], base, modelEventOf: lookup };
            if (n.body) applyFormBindings(n.body, ctx);
            if (n.elseBody) applyFormBindings(n.elseBody, ctx);
            if (n.emptyBody) applyFormBindings(n.emptyBody, ctx);
            if (n.catchBody) applyFormBindings(n.catchBody, ctx);
            if (n.loading) applyFormBindings(n.loading, ctx);
            if (n.error) applyFormBindings(n.error, ctx);
            if (n.errorBody) applyFormBindings(n.errorBody, ctx);
            if (n.placeholder) applyFormBindings(n.placeholder, ctx);
            if (n.cases) for (const c of n.cases) if (c.body) applyFormBindings(c.body, ctx);
            if (n.defaultBody) applyFormBindings(n.defaultBody, ctx);
        }
    }
}

/**
 * `formVar` is the name of the form in the setup (`ctx.<name>`), or {@link INJECTED}: the form above
 * this component, looked up by `tryUseForm(ctx.el)` in each binding. `base` is what a closing
 * `</pdx-form>` returns to — the injected form, for a section that also draws a form of its own.
 */
interface FormCtx {
    formVar: string | null;
    depth: number;
    groupPath: string[];
    base?: { formVar: string | null; depth: number };
    /** The event of a component's first model (#478); null without a component registry. */
    modelEventOf?: ModelEventLookup | null;
}

/**
 * The form above this component. A section written as its own `.pdx` declares it by
 * calling `useForm()` or `tryUseForm()`, and its named controls are wired to it like the controls of
 * the file that holds `<pdx-form>`. The binding looks the form up itself, every time: a child can set
 * up before its `<pdx-form>`, and `tryUseForm(el)` subscribes to the forms being
 * provided, so a binding that found none runs again when one appears.
 */
export const INJECTED = '@injected-form';

/**
 * Wire the named controls of a template that is a SECTION of a form rendered above it — the whole
 * template counts as inside that form. Returns whether any binding was written, so the caller
 * imports `tryUseForm`.
 */
export function applyInjectedFormBindings(nodes: TemplateNode[], modelEventOf?: ModelEventLookup | null): boolean {
    const base = { formVar: INJECTED, depth: 1 };
    applyFormBindings(nodes, { formVar: INJECTED, depth: 1, groupPath: [], base }, modelEventOf);
    return collectHtml(nodes).includes(INJECTED_REF);
}

/** The expression that reaches the injected form from a binding. */
const INJECTED_REF = 'tryUseForm(ctx.el)';

/** The HTML of every node, control-flow bodies included, in the shape `applyFormBindings` walks. */
function collectHtml(nodes: TemplateNode[]): string {
    let out = '';
    for (const node of nodes) {
        if (node.type === 'html') { out += (node as HtmlNode).content; continue; }
        const n = node as {
            body?: TemplateNode[]; elseBody?: TemplateNode[]; emptyBody?: TemplateNode[];
            catchBody?: TemplateNode[]; loading?: TemplateNode[]; error?: TemplateNode[];
            errorBody?: TemplateNode[]; placeholder?: TemplateNode[]; defaultBody?: TemplateNode[];
            cases?: { body?: TemplateNode[] }[];
        };
        for (const part of [n.body, n.elseBody, n.emptyBody, n.catchBody, n.loading, n.error, n.errorBody, n.placeholder, n.defaultBody]) {
            if (part) out += collectHtml(part);
        }
        if (n.cases) for (const c of n.cases) if (c.body) out += collectHtml(c.body);
    }
    return out;
}

/** `form.x`, a field as a member of its form (#128), as a binding reaches it: the setup's form, or the injected one. */
function fieldRef(formVar: string, fieldPath: string): string {
    // A name that is not an identifier — a dotted path, or one with a hyphen — is a quoted key.
    const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(fieldPath);
    if (formVar === INJECTED) return isIdentifier ? `${INJECTED_REF}?.${fieldPath}` : `${INJECTED_REF}?.[${jsQuote(fieldPath)}]`;
    return isIdentifier ? `ctx.${formVar}.${fieldPath}` : `ctx.${formVar}[${jsQuote(fieldPath)}]`;
}

/**
 * Process a single HTML content string, injecting form bindings.
 */
function processHtmlContent(content: string, ctx: FormCtx): string {
    let result = '';
    let i = 0;
    let formVar = ctx.formVar;
    let depth = ctx.depth;
    const groupPath = ctx.groupPath;
    const baseDepth = ctx.base?.depth ?? 0;

    while (i < content.length) {
        // Look for tags
        if (content[i] === '<') {
            const isClose = content[i + 1] === '/';
            const tagEnd = content.indexOf('>', i);
            if (tagEnd === -1) { result += content[i]; i++; continue; }

            const tagStr = content.slice(i, tagEnd + 1);
            const isSelfClosing = tagStr.endsWith('/>');

            if (isClose) {
                // Closing tag
                const tagName = extractTagName(tagStr.slice(2));
                if (tagName === 'pdx-form' && depth > baseDepth) {
                    depth--;
                    // Back to what was outside this form: nothing, or the injected one.
                    if (depth === baseDepth) { formVar = ctx.base?.formVar ?? null; groupPath.length = 0; }
                }
                // Pop field-group path on closing tag
                if (tagName === 'pdx-field-group' && groupPath.length > 0) {
                    groupPath.pop();
                }
                result += tagStr;
            } else {
                // Opening tag
                const tagName = extractTagName(tagStr.slice(1));

                if (tagName === 'pdx-form') {
                    // A `<pdx-form :form>` inside a section is a form of its own, whose controls bind
                    // through their models (#128): nothing inside it is wired by name.
                    const formMatch = tagStr.match(/:form=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/);
                    if (formMatch) {
                        formVar = null;
                        depth++;
                    }
                    result += tagStr;
                } else if (formVar && depth > 0) {
                    // Track <pdx-field-group name="xxx"> for path prefixing
                    if (tagName === 'pdx-field-group' && !isSelfClosing) {
                        const groupNameMatch = tagStr.match(/\bname=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/);
                        if (groupNameMatch) {
                            groupPath.push(groupNameMatch[1] ?? groupNameMatch[2] ?? groupNameMatch[3]);
                        }
                    }
                    // Inside a pdx-form — check if this tag needs binding
                    result += maybeInjectBindings(tagStr, tagName, formVar, groupPath, ctx.modelEventOf ?? null);
                    if (!isSelfClosing && tagName === 'pdx-form') depth++;
                } else {
                    result += tagStr;
                }
            }
            i = tagEnd + 1;
        } else {
            result += content[i];
            i++;
        }
    }

    return result;
}

/**
 * The value of the last `name="…"` (or `'…'`, or a backquoted value) in an opening tag whose name is
 * followed by whitespace, as `<tag\s[^>]*name=(?:"([^"]+)"|…)[^>]*>` found it: the greedy `[^>]*`
 * made it the last one, and the name may end a longer one (`data-name=`). Undefined when there is none.
 */
function lastAttributeValue(tag: OpenTag, name: string): string | undefined {
    const attrs = tag.attrs;
    if (!isSpace(attrs[0])) return undefined;
    const needle = name + '=';
    // Per quote, the position after which it does not close again.
    const noClose: Record<string, number> = {};
    let value: string | undefined;
    for (let p = attrs.indexOf(needle); p !== -1; p = attrs.indexOf(needle, p + 1)) {
        const q = attrs[p + needle.length];
        if (q !== '"' && q !== "'" && q !== '`') continue;
        const open = p + needle.length + 1;
        if (open >= (noClose[q] ?? Infinity)) continue;
        const close = attrs.indexOf(q, open);
        if (close === -1) { noClose[q] = open; continue; }
        if (close > open) value = attrs.slice(open, close);
    }
    return value;
}

function getFormState(content: string, formVar: string | null, depth: number, groupPath: string[], base?: FormCtx['base']): FormCtx {
    // Re-scan to track pdx-form and pdx-field-group open/close across HtmlNode boundaries
    let fv = formVar;
    let d = depth;
    const baseDepth = base?.depth ?? 0;
    const gp = [...groupPath];
    const closeRegex = /<\/pdx-form>/g;
    const groupCloseRegex = /<\/pdx-field-group>/g;
    // The tags are scanned, and the attribute read inside each one: a pattern spanning the whole tag
    // took quadratic time on `<pdx-form` repeated without its `>` (#70).
    for (const tag of openTags(content, 'pdx-form')) {
        const value = lastAttributeValue(tag, ':form');
        if (value !== undefined) { fv = null; d++; }
    }
    while (closeRegex.exec(content) !== null) {
        d = Math.max(baseDepth, d - 1);
        if (d === baseDepth) { fv = base?.formVar ?? null; gp.length = 0; }
    }
    for (const tag of openTags(content, 'pdx-field-group')) {
        const value = lastAttributeValue(tag, 'name');
        if (value !== undefined && fv) gp.push(value);
    }
    while (groupCloseRegex.exec(content) !== null) { if (gp.length > 0) gp.pop(); }
    return { formVar: fv, depth: d, groupPath: gp, base };
}

// ─── Binding Injection ────────────────────────────────────────

/**
 * If the tag is a form control or form-field with a `name` attribute,
 * inject the appropriate bindings. Never overwrite existing bindings.
 */
function maybeInjectBindings(tagStr: string, tagName: string, formVar: string, groupPath: string[], modelEventOf: ModelEventLookup | null): string {
    // Extract name attribute (static only — name="xxx", not :name="...")
    const nameMatch = tagStr.match(/\bname=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/);
    if (!nameMatch) return tagStr;
    const fieldName = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3];

    // Resolve full dotted path: if inside <pdx-field-group name="customer">,
    // a field name="email" becomes "customer.email"
    const resolvedPath = groupPath.length > 0
        ? [...groupPath, fieldName].join('.')
        : fieldName;

    // Don't inject bindings on the field-group's own name — it's for path scoping only
    if (tagName === 'pdx-field-group') return tagStr;

    // Rewrite name attribute to full dotted path so DOM queries and
    // syncDomValues can find the control (e.g., name="email" → name="customer.email")
    let result = tagStr;
    if (resolvedPath !== fieldName) {
        // Replace using the exact matched attribute text (any quote style).
        result = result.replace(nameMatch[0], `name="${resolvedPath}"`);
    }

    if (tagName === 'pdx-form-field') {
        return injectFormFieldBindings(result, formVar, resolvedPath);
    }

    // A control bound with `::<model>="f.x"` (#128) is wired by that binding: the implicit one would
    // write the field a second time on every change.
    if (FORM_CONTROL_TAGS.has(tagName) && !/\s::[\w-]/.test(result)) {
        return injectControlBindings(result, tagName, formVar, resolvedPath, modelEventOf?.(tagName) ?? null);
    }

    return result;
}

/**
 * Inject :error, :touched, :warning on <pdx-form-field> if not already present.
 * Uses .pdx binding syntax (:prop="expr") — rewriteHtmlBindings converts to interpolations.
 */
function injectFormFieldBindings(tagStr: string, formVar: string, fieldPath: string): string {
    let injected = '';
    // Bracket notation for a dotted path (`f['customer.name']`), dot notation otherwise.
    const f = fieldRef(formVar, fieldPath);

    if (!tagStr.includes(':error=')) {
        injected += ` :error=$` + `{() => ${f}?.error()}`;
    }
    if (!tagStr.includes(':touched=')) {
        injected += ` :touched=$` + `{() => ${f}?.touched()}`;
    }
    if (!tagStr.includes(':warning=')) {
        injected += ` :warning=$` + `{() => ${f}?.warning()}`;
    }

    if (!injected) return tagStr;
    return insertBeforeClose(tagStr, injected);
}

/**
 * Inject the model (:value, :checked), its event (@value-change, @checked-change) and @pdx-blur on
 * form controls.
 * Uses .pdx binding syntax — rewriteHtmlBindings converts to interpolations.
 */
function injectControlBindings(tagStr: string, tagName: string, formVar: string, fieldPath: string, model: { model: string; event: string } | null): string {
    let injected = '';
    const f = fieldRef(formVar, fieldPath);

    // Value binding — skip reactive :value for text inputs (causes controlled-input loop)
    const isChecked = CHECKED_CONTROLS.has(tagName);
    const isTextInput = TEXT_INPUT_CONTROLS.has(tagName);

    if (!isTextInput) {
        // The model is the prop the field's value goes to: `checked` on a checkbox, `pressed` on a toggle.
        const valueProp = model ? `:${model.model}` : (isChecked ? ':checked' : ':value');
        if (!tagStr.includes(valueProp + '=')) {
            injected += ` ${valueProp}=$` + `{() => ${f}?.value()}`;
        }
    }

    // Change event binding — inject as pre-rewritten template interpolation
    // Use __pdx_form_change_N pattern: the actual handler is already a final expression
    // A control that lists models is bound to its first model's event, whose detail is `{ value }`
    // (#478); the table holds what `registerCompilerFormControl` registered for a custom control.
    const eventName = model ? model.event : (EVENT_NAME[tagName] || DEFAULT_EVENT);
    if (!tagStr.includes(`@${eventName}=`)) {
        const valueExpr = model ? 'e.detail.value' : (VALUE_EXPR[tagName] || DEFAULT_VALUE_EXPR);
        // Inject as already-rewritten: @event=${handler} (no quotes = no rewrite)
        injected += ` @${eventName}=$` + `{(e) => ${f}?.onChange(${valueExpr})}`;
    }

    // Blur event binding
    if (!tagStr.includes('@pdx-blur=')) {
        injected += ` @pdx-blur=$` + `{() => ${f}?.onBlur()}`;
    }

    if (!injected) return tagStr;
    return insertBeforeClose(tagStr, injected);
}

// ─── Helpers ──────────────────────────────────────────────────

function extractTagName(s: string): string {
    const m = s.match(/^([\w-]+)/);
    return m ? m[1].toLowerCase() : '';
}

function insertBeforeClose(tagStr: string, attrs: string): string {
    if (tagStr.endsWith('/>')) {
        return tagStr.slice(0, -2) + attrs + ' />';
    }
    return tagStr.slice(0, -1) + attrs + '>';
}
