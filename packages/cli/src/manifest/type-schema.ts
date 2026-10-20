// The JSON schema of a TypeScript type, from its text as written (#502): the input an agent sends to an
// `@action`. Only what the text says by itself is read — `string`, `number`, `boolean`, `T[]`,
// `Array<T>`, and object literal types `{ a: T; b?: U }` built of those. A name the text cannot
// resolve (an interface, an import) is `{}`, the schema that accepts anything: the generator reads one
// file, without a type checker.

/** A JSON schema, as far as these types need. */
export type JsonSchema =
    | Record<string, never>
    | { type: 'string' | 'number' | 'boolean' }
    | { type: 'array'; items: JsonSchema }
    | { type: 'object'; properties: Record<string, JsonSchema>; required?: string[] };

/** `text` split at its top-level `separators`, outside brackets and strings. */
function splitTopLevel(text: string, separators: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
        else if (c === '}' || c === ')' || c === ']' || c === '>') depth--;
        else if (depth === 0 && separators.includes(c)) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out.map((s) => s.trim()).filter(Boolean);
}

/** The JSON schema of the type written as `text`; `{}` for what the text alone cannot say. */
export function typeToSchema(text: string | null | undefined): JsonSchema {
    const t = (text ?? '').trim();
    if (t === 'string' || t === 'number' || t === 'boolean') return { type: t };
    if (t.endsWith('[]')) return { type: 'array', items: typeToSchema(t.slice(0, -2)) };
    if (t.startsWith('Array<') && t.endsWith('>')) return { type: 'array', items: typeToSchema(t.slice(6, -1)) };
    if (t.startsWith('{') && t.endsWith('}')) {
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];
        for (const member of splitTopLevel(t.slice(1, -1), ';,')) {
            const colon = member.indexOf(':');
            if (colon < 0) return {};
            const rawKey = member.slice(0, colon).trim();
            const optional = rawKey.endsWith('?');
            const key = (optional ? rawKey.slice(0, -1) : rawKey).trim();
            if (!/^[A-Za-z_$][\w$]*$/.test(key)) return {};
            properties[key] = typeToSchema(member.slice(colon + 1));
            if (!optional) required.push(key);
        }
        return { type: 'object', properties, ...(required.length ? { required } : {}) };
    }
    return {};
}
