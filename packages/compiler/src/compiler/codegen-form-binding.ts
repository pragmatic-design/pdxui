// Form-binding auto-wire — detects <pdx-form :form="xxx"> in template HTML and
// injects bindings on child form controls that have a `name` attribute.
//
// This pass runs BEFORE rewriteHtmlBindings, operating on the raw HTML nodes.
// It modifies HtmlNode.content strings to add :value, @pdx-change, @pdx-blur
// on form controls, and :error, :touched, :warning on pdx-form-field wrappers.
//
// Rules:
//   1. Only affects elements INSIDE <pdx-form :form="xxx"> ... </pdx-form>
//   2. Only affects elements with a `name="yyy"` attribute
//   3. Never overwrites existing explicit bindings (:value, @pdx-change, etc.)
//   4. The form variable name is extracted from the :form binding

import type { TemplateNode, HtmlNode } from '../parser/template';
import { jsQuote } from './js-literal';

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
        this.checked = new Set(['pdx-checkbox', 'pdx-switch']);
        this.textInput = new Set([
            'pdx-input', 'pdx-textarea', 'pdx-password-input',
            'pdx-search-input', 'pdx-masked-input',
        ]);
        this.eventName = {
            'pdx-input': 'pdx-input', 'pdx-textarea': 'pdx-input',
            'pdx-password-input': 'pdx-input', 'pdx-search-input': 'pdx-input',
            'pdx-masked-input': 'pdx-input', 'pdx-number-input': 'pdx-change',
            'pdx-segmented': 'change', 'pdx-toggle': 'pressedchange',
        };
        this.valueExpr = {
            'pdx-checkbox': 'e.detail?.checked', 'pdx-switch': 'e.detail?.checked',
            'pdx-toggle': 'e.detail?.pressed', 'pdx-slider': 'e.detail?.value',
            'pdx-rating': 'e.detail?.value', 'pdx-segmented': 'e.detail?.value',
        };
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
const DEFAULT_VALUE_EXPR = 'e.detail?.value ?? e.target?.value';

// ─── Main Entry ───────────────────────────────────────────────

/**
 * Walk all template AST nodes, find <pdx-form> blocks, and inject
 * form bindings on child controls. Modifies HtmlNode.content in-place.
 */
export function applyFormBindings(nodes: TemplateNode[], inherited?: FormCtx): void {
    let formVar = inherited?.formVar ?? null;
    let depth = inherited?.depth ?? 0;
    let groupPath = inherited?.groupPath ? [...inherited.groupPath] : [];
    const base = inherited?.base;

    for (const node of nodes) {
        if (node.type === 'html') {
            const html = node as HtmlNode;
            html.content = processHtmlContent(html.content, { formVar, depth, groupPath, base });
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
            const ctx: FormCtx = { formVar, depth, groupPath: [...groupPath], base };
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
export function applyInjectedFormBindings(nodes: TemplateNode[]): boolean {
    const base = { formVar: INJECTED, depth: 1 };
    applyFormBindings(nodes, { formVar: INJECTED, depth: 1, groupPath: [], base });
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

/** `form.fields.x`, as a binding reaches it: the setup's form, or the injected one. */
function fieldRef(formVar: string, fieldPath: string): string {
    // A name that is not an identifier — a dotted path, or one with a hyphen — is a quoted key.
    const field = /^[A-Za-z_$][\w$]*$/.test(fieldPath) ? `fields.${fieldPath}` : `fields[${jsQuote(fieldPath)}]`;
    return formVar === INJECTED ? `${INJECTED_REF}?.${field}` : `ctx.${formVar}.${field}`;
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
                    // Extract form variable name from :form="xxx"
                    const formMatch = tagStr.match(/:form=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/);
                    if (formMatch) {
                        formVar = formMatch[1] ?? formMatch[2] ?? formMatch[3];
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
                    result += maybeInjectBindings(tagStr, tagName, formVar, groupPath);
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

function getFormState(content: string, formVar: string | null, depth: number, groupPath: string[], base?: FormCtx['base']): FormCtx {
    // Re-scan to track pdx-form and pdx-field-group open/close across HtmlNode boundaries
    let fv = formVar;
    let d = depth;
    const baseDepth = base?.depth ?? 0;
    const gp = [...groupPath];
    const openRegex = /<pdx-form\s[^>]*:form=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)[^>]*>/g;
    const closeRegex = /<\/pdx-form>/g;
    const groupOpenRegex = /<pdx-field-group\s[^>]*name=(?:"([^"]+)"|'([^']+)'|`([^`]+)`)[^>]*>/g;
    const groupCloseRegex = /<\/pdx-field-group>/g;
    let m;
    while ((m = openRegex.exec(content)) !== null) { fv = m[1] ?? m[2] ?? m[3]; d++; }
    while (closeRegex.exec(content) !== null) {
        d = Math.max(baseDepth, d - 1);
        if (d === baseDepth) { fv = base?.formVar ?? null; gp.length = 0; }
    }
    while ((m = groupOpenRegex.exec(content)) !== null) { if (fv) gp.push(m[1] ?? m[2] ?? m[3]); }
    while (groupCloseRegex.exec(content) !== null) { if (gp.length > 0) gp.pop(); }
    return { formVar: fv, depth: d, groupPath: gp, base };
}

// ─── Binding Injection ────────────────────────────────────────

/**
 * If the tag is a form control or form-field with a `name` attribute,
 * inject the appropriate bindings. Never overwrite existing bindings.
 */
function maybeInjectBindings(tagStr: string, tagName: string, formVar: string, groupPath: string[]): string {
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

    if (FORM_CONTROL_TAGS.has(tagName)) {
        return injectControlBindings(result, tagName, formVar, resolvedPath);
    }

    return result;
}

/**
 * Inject :error, :touched, :warning on <pdx-form-field> if not already present.
 * Uses .pdx binding syntax (:prop="expr") — rewriteHtmlBindings converts to interpolations.
 */
function injectFormFieldBindings(tagStr: string, formVar: string, fieldPath: string): string {
    let injected = '';
    // Bracket notation for a dotted path (`fields['customer.name']`), dot notation otherwise.
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
 * Inject :value (or :checked), @pdx-change, @pdx-blur on form controls.
 * Uses .pdx binding syntax — rewriteHtmlBindings converts to interpolations.
 */
function injectControlBindings(tagStr: string, tagName: string, formVar: string, fieldPath: string): string {
    let injected = '';
    const f = fieldRef(formVar, fieldPath);

    // Value binding — skip reactive :value for text inputs (causes controlled-input loop)
    const isChecked = CHECKED_CONTROLS.has(tagName);
    const isTextInput = TEXT_INPUT_CONTROLS.has(tagName);

    if (!isTextInput) {
        const valueProp = isChecked ? ':checked' : ':value';
        if (!tagStr.includes(valueProp + '=')) {
            injected += ` ${valueProp}=$` + `{() => ${f}?.value()}`;
        }
    }

    // Change event binding — inject as pre-rewritten template interpolation
    // Use __pdx_form_change_N pattern: the actual handler is already a final expression
    const eventName = EVENT_NAME[tagName] || 'pdx-change';
    if (!tagStr.includes(`@${eventName}=`)) {
        const valueExpr = VALUE_EXPR[tagName] || DEFAULT_VALUE_EXPR;
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
