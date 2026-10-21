// What a handler's `$event` is, as the template projection types it (#122, #479).

import type { ResolveType } from './template-projection';

/**
 * The type of `$event` in the handler of `@event` written on `tag`, or null for a name that is not a
 * handler. The event the component declares, or `PdxEvent` — a DOM event by its name,
 * `CustomEvent<any>` for any other. On a component, `currentTarget` is the component's element, with
 * its props, models and methods (#479): a text field's commit is read as `$event.currentTarget.value`.
 */
export function handlerEventType(name: string, tag: string, resolveType: ResolveType | undefined): string | null {
    if (!/^@[^@]/.test(name)) return null;
    const event = name.replace(/^@/, '').split('.')[0];
    const base = resolveType?.(tag, '@' + event) ?? `PdxEvent<${JSON.stringify(event)}, ${JSON.stringify(tag.toLowerCase())}>`;
    const host = tag.includes('-') ? resolveType?.(tag, '$host') ?? null : null;
    return host ? `PdxOn<${base}, ${host}>` : base;
}
