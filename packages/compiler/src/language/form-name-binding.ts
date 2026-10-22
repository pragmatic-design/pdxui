// A control bound to a form field by its `name` is removed (#128, step 4).
//
// Inside `<pdx-form :form="f">`, a library control with `name="email"` was wired to `f.email` by the
// compiler, and `<pdx-form-field name="email">` took its error from it: nothing in the template said
// so. Now the control binds through its model, `::value="f.email"`, and the field says which field
// it shows, `:field="f.email"`. `pdx migrate` writes both. The control's model is the one its manifest
// lists; a control with no manifest entry, or with more than one model (`pdx-checkbox`: `checked` and
// `indeterminate`), is flagged. The control keeps its `name` — what a native form submits and what a
// test selects — written as the full path inside a `<pdx-field-group>`, as the compiler wrote it.
//
// A form SECTION — a component that calls `useForm()` / `tryUseForm()` — keeps its wiring until #613
// gives it an explicit way to name the form it inherits; so does a `<pdx-form>` without `:form`.

import { parseSFC } from '../parser/sfc';
import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';

/**
 * The library's value controls, as the alpha wiring knew them (`codegen-form-binding.ts`): what the
 * compiler reports without the manifest. With it (`pdx migrate`), any tag that lists a model counts.
 */
const VALUE_CONTROLS = new Set([
    'pdx-input', 'pdx-textarea', 'pdx-checkbox', 'pdx-switch', 'pdx-radio', 'pdx-radio-group',
    'pdx-checkbox-group', 'pdx-select', 'pdx-slider', 'pdx-rating', 'pdx-number-input',
    'pdx-password-input', 'pdx-search-input', 'pdx-masked-input', 'pdx-otp-input', 'pdx-pin-input',
    'pdx-segmented', 'pdx-tag-input', 'pdx-color-picker', 'pdx-autocomplete', 'pdx-toggle',
    'pdx-date-picker', 'pdx-time-picker',
]);

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** One place the old form is used: where its `name="…"` is, and what it becomes. */
interface Use {
    /** The offset of the ` name="…"` attribute (its leading space included) in the file. */
    at: number;
    /** The attribute's text as written. */
    attr: string;
    /** The tag, for a finding. */
    tag: string;
    /** The form, and the field's full path. */
    form: string;
    path: string;
    /** `pdx-form-field`, or a control. */
    kind: 'field' | 'control';
}

/** `f.email`, or `f['customer.email']` for a path that is not an identifier. */
function fieldExpr(form: string, path: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(path) ? `${form}.${path}` : `${form}['${path}']`;
}

/** The value of a static attribute in a tag's attribute text, or undefined. */
function attrValue(attrs: string, name: string): string | undefined {
    // Match: ` name="value"` / ` name='value'`, the name not the tail of a longer one. Groups: [1] [2]
    const m = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
    return m ? (m[1] ?? m[2]) : undefined;
}

/** The models a tag declares, from the manifest; null when nothing lists it. */
function modelsOf(tag: string, context?: LanguageChangeContext): string[] | null {
    const models = context?.modelsOf?.(tag);
    return models ? [...models] : null;
}

/** Whether a tag is a value control the wiring reached. */
function isControl(tag: string, context?: LanguageChangeContext): boolean {
    return VALUE_CONTROLS.has(tag) || (modelsOf(tag, context)?.length ?? 0) > 0;
}

/** A tag of the markup, opening or closing: where its `<` is, its name, and what lies before its `>`. */
interface Tag { index: number; closing: boolean; tag: string; attrs: string }

/**
 * Every tag of `markup`, in order, the `>` found outside quoted values. One pass (#70: a crafted file
 * must not cost quadratic time): where the markup runs out inside a tag — no `>`, a quote that never
 * closes — the scan stops, since no later `<` can find a `>` either.
 */
function* tagsOf(markup: string): Generator<Tag> {
    let i = markup.indexOf('<');
    while (i !== -1) {
        const closing = markup[i + 1] === '/';
        const nameStart = i + (closing ? 2 : 1);
        if (!/[A-Za-z]/.test(markup[nameStart] ?? '')) { i = markup.indexOf('<', i + 1); continue; }
        let j = nameStart + 1;
        while (j < markup.length && /[\w-]/.test(markup[j])) j++;
        const nameEnd = j;
        let end = -1;
        while (j < markup.length) {
            const ch = markup[j];
            if (ch === '>') { end = j; break; }
            if (ch === '"' || ch === "'") {
                const q = markup.indexOf(ch, j + 1);
                if (q === -1) break;
                j = q + 1;
                continue;
            }
            j++;
        }
        if (end === -1) return;
        yield { index: i, closing, tag: markup.slice(nameStart, nameEnd).toLowerCase(), attrs: markup.slice(nameEnd, end) };
        i = markup.indexOf('<', end + 1);
    }
}

/** Every use of the old form in a .pdx file's template, in order. A section's template has none. */
function usesOf(text: string, context?: LanguageChangeContext): Use[] {
    const sfc = parseSFC(text);
    const template = sfc.template;
    if (!template || template.src) return [];
    // A section keeps its wiring (#613).
    if (/\b(?:useForm|tryUseForm)\s*\(/.test(sfc.script?.content ?? '')) return [];
    const uses: Use[] = [];
    /** The forms open around a tag: each with its field-group path. `null` is a form with no `:form`. */
    const forms: { form: string | null; groups: string[] }[] = [];
    for (const t of tagsOf(template.content)) {
        const { closing, tag, attrs } = t;
        const selfClosing = attrs.trimEnd().endsWith('/');
        const top = forms[forms.length - 1];
        if (tag === 'pdx-form') {
            if (closing) forms.pop();
            else if (!selfClosing) forms.push({ form: attrValue(attrs, ':form') ?? top?.form ?? null, groups: [] });
            continue;
        }
        if (tag === 'pdx-field-group') {
            if (!top) continue;
            if (closing) top.groups.pop();
            else if (!selfClosing) top.groups.push(attrValue(attrs, 'name') ?? '');
            continue;
        }
        if (closing || !top?.form) continue;
        const name = attrValue(attrs, 'name');
        if (!name || /[{}$]/.test(name)) continue;
        const kind = tag === 'pdx-form-field' ? 'field' : isControl(tag, context) ? 'control' : null;
        if (!kind) continue;
        // Already bound: the field says `:field`, the control has a `::` binding.
        if (kind === 'field' && /(?:^|\s):field=/.test(attrs)) continue;
        if (kind === 'control' && /(?:^|\s)::[\w-]/.test(attrs)) continue;
        // Match: the `name` attribute with the one space before it — not a run of spaces, which a
        // `\s+` would retry from each of. Groups: none
        const attrMatch = /\sname=(?:"[^"]*"|'[^']*')/.exec(attrs)!;
        const path = [...top.groups.filter(Boolean), name].join('.');
        uses.push({
            at: template.start + t.index + 1 + tag.length + attrMatch.index,
            attr: attrMatch[0], tag, form: top.form, path, kind,
        });
    }
    return uses;
}

/** What the use is rewritten to, or null when it is a person's to rewrite. */
function rewrite(use: Use, context?: LanguageChangeContext): string | null {
    const expr = fieldExpr(use.form, use.path);
    if (use.kind === 'field') return ` :field="${expr}"`;
    const models = modelsOf(use.tag, context);
    if (!models || models.length !== 1) return null;
    const [model] = models;
    return ` name="${use.path}" ::${model}="${expr}"`;
}

export const formNameBinding: LanguageChange = {
    id: 'form-name-binding',
    kind: 'removed',
    scope: 'pdx',
    issue: 128,
    message: 'a control is bound to its form field through its model, `::value="f.email"`, and `<pdx-form-field>` names its field, `:field="f.email"` — no longer by `name` inside `<pdx-form :form>`.',
    detect(text, context) {
        return usesOf(text, context).map((u): LanguageChangeFinding => {
            const models = modelsOf(u.tag, context);
            const note = u.kind === 'control' && models && models.length > 1
                ? `\`<${u.tag}>\` has ${models.length} models (${models.join(', ')}): write the one the field holds, \`::<model>="${fieldExpr(u.form, u.path)}"\`.`
                : u.kind === 'control' && !models
                    ? `No manifest lists \`<${u.tag}>\`'s model: write \`::<model>="${fieldExpr(u.form, u.path)}"\`.`
                    : undefined;
            return { line: lineAt(text, u.at), found: `<${u.tag}${u.attr}>`, ...(note ? { note } : {}) };
        });
    },
    fix(text, context) {
        let out = text;
        for (const u of usesOf(text, context).reverse()) {
            const next = rewrite(u, context);
            if (next !== null) out = out.slice(0, u.at) + next + out.slice(u.at + u.attr.length);
        }
        return out;
    },
};
