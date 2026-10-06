// Bound prop names on known components — resolved against the props the component declares.
//
// The template rewrite emits every bound name in kebab-case, because the HTML parser lowercases
// attribute names, and core camelCases it back when it binds. That round trip works for
// `:withBorder` and `:with-border`, and silently fails for `:withborder`: with no hyphen there is no
// capital to restore, so core assigns `el.withborder` — an expando — and the component never sees
// the value. It is also the form an attribute table prints.
//
// When the compiler knows the tag's declared props (the UI manifest, through `ctx.propsOf`), a name
// that matches one case- and hyphen-insensitively is emitted as that prop and flagged, and a name
// that matches none is PDX_UNKNOWN_PROP. Without that knowledge nothing is guessed.

import type { CompileContext } from './compile-context';
import { levenshtein, onlyNear } from './edit-distance';

/**
 * The bound names the TEMPLATE ENGINE routes itself, before it falls through to a property
 * binding — `bindAttribute` in `@pdxui/core`'s `renderer/template.ts`.
 *
 * They are not props and must never be measured against a component's declared ones. A name
 * missing here, such as `:show`, draws PDX_UNKNOWN_PROP on every `<pdx-*>` that uses it — *"the value
 * lands on an element property nothing reads"*, with a hint proposing `:size`, which would break the
 * screen. The binding works; only the check would not know it.
 *
 * `class` and `style` are here for their `.x` forms (`:class.active`, `:style.color`): the rewrite
 * passes the ROOT name to `boundPropName`.
 *
 * ⚠️ This list and the runtime's branches are asserted equal by
 * `tests/template-directives-lockstep.test.ts`, which reads core's source — the compiler may not
 * import from core. Adding a branch there without adding the name here fails that test.
 */
export const TEMPLATE_DIRECTIVES = new Set(['class', 'style', 'ref', 'show']);

/**
 * Names every element accepts, so they are never component props to check: global HTML
 * attributes and the DOM properties a template binds directly. `aria-*` and `data-*` are matched
 * by prefix. The template engine's own directives are `TEMPLATE_DIRECTIVES` above.
 */
const ELEMENT_NAMES = new Set([
    'id', 'title', 'hidden', 'slot', 'part', 'lang', 'dir', 'role', 'tabindex',
    'inert', 'draggable', 'contenteditable', 'spellcheck', 'translate', 'accesskey', 'autofocus',
    'enterkeyhint', 'inputmode', 'popover', 'is', 'nonce', 'key',
    'textcontent', 'innerhtml', 'innertext',
]);

/** Folds a bound name to its comparison key: `with-border`, `withBorder`, `withborder` → `withborder`. */
function foldName(name: string): string {
    return name.replace(/-/g, '').toLowerCase();
}

/** kebab-case → camelCase, the name core binds (`with-border` → `withBorder`). */
function kebabToCamel(name: string): string {
    return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The name to bind for a prop written as `name` on `tagName` — the caller kebab-cases it. A name
 * that matches a declared prop only once case and hyphens are ignored becomes that prop
 * (PDX_PROP_NAME_CASE); a name that matches none draws PDX_UNKNOWN_PROP with the closest declared
 * name. Unknown tags, element-wide names, and compiles without a props lookup return `name` as is.
 */
export function boundPropName(tagName: string, name: string, ctx: CompileContext): string {
    const props = ctx.propsOf?.(tagName);
    const lower = name.toLowerCase();
    if (!props || TEMPLATE_DIRECTIVES.has(lower) || ELEMENT_NAMES.has(lower)
        || lower.startsWith('aria-') || lower.startsWith('data-')) {
        return name;
    }
    if (props.has(kebabToCamel(name))) return name;

    const key = foldName(name);
    const declared = [...props].find((p) => foldName(p) === key);
    if (declared) {
        ctx.warnings.push({
            code: 'PDX_PROP_NAME_CASE',
            severity: 'warn',
            message: `<${tagName}> has no prop "${name}"; it was bound as "${declared}".`,
            hint: `Write :${declared} — the lowercase form only reaches the prop because the compiler knows ${tagName}.`,
            suggestion: declared,
        });
        return declared;
    }

    const closest = closestProp(key, props);
    // The fix renames only when one declared prop is within 2 edits; the hint still
    // names the nearest within 3.
    const only = onlyNear(name, props, 2, foldName);
    ctx.warnings.push({
        code: 'PDX_UNKNOWN_PROP',
        severity: 'warn',
        message: `<${tagName}> has no prop "${name}": the value lands on an element property nothing reads.`,
        hint: closest ? `Did you mean :${closest}?` : `Declared props: ${[...props].join(', ')}.`,
        ...(only ? { suggestion: only } : {}),
    });
    return name;
}

// Match: the tag and the bound name in the two messages above — `<pdx-app-layout> has no prop "withBordr"`.
// Groups: [1]=tag [2]=name. Kept beside the messages it reads.
const BOUND_NAME_MESSAGE = /^<([\w-]+)> has no prop "([^"]+)"/;

/**
 * The 1-based line and column, in `source`, of the attribute a PDX_UNKNOWN_PROP or
 * PDX_PROP_NAME_CASE is about — the first `:name=` / `::name=` inside a `<tag` element — or null.
 * The rewrite that finds them works on tag strings with no position, and `pdx check` and the
 * editor need one.
 */
export function locateBoundName(source: string, message: string): { line: number; column: number } | null {
    const m = BOUND_NAME_MESSAGE.exec(message);
    if (!m) return null;
    const [, tag, name] = m;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match: `<tag` … `:name=` before the tag closes (no `>` in between). Groups: [1]=up to the colon.
    // Case-sensitive: `:withborder` is the one flagged, not a correct `:withBorder` elsewhere.
    const re = new RegExp(`(<${escape(tag)}\\b[^>]*?\\s)::?${escape(name)}\\s*=`);
    const found = re.exec(source);
    if (!found) return null;
    const offset = found.index + found[1].length;
    const before = source.slice(0, offset);
    const line = before.split('\n').length;
    return { line, column: offset - before.lastIndexOf('\n') };
}

/** The declared prop nearest to a folded name, within an edit distance of 3, or null. */
function closestProp(key: string, props: ReadonlySet<string>): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const p of props) {
        const dist = levenshtein(key, foldName(p));
        if (dist < bestDist) { bestDist = dist; best = p; }
    }
    return bestDist <= 3 ? best : null;
}
