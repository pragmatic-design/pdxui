// The catalogue says what an event carries, what a component renders, and which icon names exist.
//
// Without them an agent pays for three gaps with browser measurements: event payloads
// (pdx-tag-input's list is `detail.tags`, not `detail.value`), rendered roles (pdx-select's trigger
// is a combobox; pdx-transfer's rows are options, not checkboxes), and pdx-icon's names (in
// pragmatic-icons.ts; the lucide file is an empty registrar). The detail shapes and roles come from the manifest, the icon names from the
// icon file: this checks they reach the pages an agent reads.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaText } from './skill-pages';

const REPO = join(__dirname, '../../..');
// The area index and its component pages.
const page = (area: string) => areaText(area);

/** One component's entry: from its heading to the next component heading. */
function entry(area: string, tag: string): string {
    const text = page(area);
    const start = text.indexOf(`### \`<${tag}>\``);
    expect(start, `${tag} is not in pdxui-${area}`).toBeGreaterThan(-1);
    const rest = text.slice(start + 4);
    const end = rest.search(/^### `</m);
    return end === -1 ? rest : rest.slice(0, end);
}

describe('events carry their detail', () => {
    it('pdx-tag-input says its list is detail.tags', () => {
        expect(entry('inputs', 'pdx-tag-input')).toContain('`pdx-change` → `detail: { tags }`');
    });

    it('a detail declared with a typed @fires shows up too — pdx-button-group passes a string', () => {
        expect(entry('display', 'pdx-button-group')).toContain('`pdx-change` → `detail: string`');
    });
});

describe('interactive components say what they render', () => {
    it('pdx-select: a combobox either way, and which element it is', () => {
        // Every select is a combobox, searchable or not, and with `searchable` that is the search
        // input.
        const e = entry('inputs', 'pdx-select');
        expect(e).toMatch(/\*\*Renders:\*\*.*`combobox`/);
        expect(e).not.toMatch(/\*\*Renders:\*\*.*`button`/);
        expect(e, 'which element, not just the list').toMatch(/search input when `searchable`/);
        expect(e, 'where the highlighted option is').toContain('aria-activedescendant');
    });

    it('pdx-transfer: options with a presentational check, no checkbox', () => {
        const e = entry('inputs', 'pdx-transfer');
        expect(e).toMatch(/\*\*Renders:\*\*.*`option`/);
        expect(e).toContain('span.pdx-transfer-check');
    });
});

describe('pdx-icon lists its names', () => {
    it('every built-in name, read from the file that defines them', () => {
        const src = readFileSync(join(REPO, 'packages/ui/src/icon/pragmatic-icons.ts'), 'utf-8');
        const names = [...src.matchAll(/^ {4}'([a-z0-9-]+)':/gm)].map(m => m[1]);
        expect(names.length, 'the extractor found the set').toBeGreaterThan(300);
        const e = entry('display', 'pdx-icon');
        const missing = names.filter(n => !e.includes('`' + n + '`'));
        expect(missing, 'built-in icon names the catalogue does not list').toEqual([]);
        expect(e).toContain(`**Built-in names** (${names.length},`);
    });

    it('and says the lucide set is a registrar the app fills', () => {
        expect(entry('display', 'pdx-icon')).toContain('registerLucideIcons');
    });
});
