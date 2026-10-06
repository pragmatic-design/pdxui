// LSP — manifest-driven completion/hover/definition + tag-context.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { getTagContext } from '../src/utils/tag-context';
import { enumValues, type ManifestComponent } from '../src/utils/manifest-index';
import { getTagAttributeCompletions } from '../src/capabilities/completion';
import { getComponentHover } from '../src/capabilities/hover';
import { resolveComponentDefinition } from '../src/capabilities/definition';

const button: ManifestComponent = {
    tag: 'pdx-button',
    description: 'A button.',
    filePath: 'C:/proj/packages/ui/src/button/pdx-button.ts',
    attributes: [
        { name: 'variant', type: "'primary' | 'ghost'", default: "'primary'", description: 'Visual variant.' },
        { name: 'size', type: "'sm' | 'md'", description: 'Size.' },
    ],
    events: [{ name: 'pdx-click', type: 'CustomEvent', description: 'Fired on click.' }],
    slots: [],
};
const manifest = new Map([[button.tag, button]]);

describe('tag-context', () => {
    it('detects the tag and attribute-name position', () => {
        const src = '<template><pdx-button var</template>';
        const ctx = getTagContext(src, { line: 0, character: 25 });
        expect(ctx?.tag).toBe('pdx-button');
        expect(ctx?.onTagName).toBe(false);
        expect(ctx?.inValue).toBeNull();
    });

    it('detects being inside an attribute value', () => {
        const src = '<pdx-button variant="pr">';
        const ctx = getTagContext(src, { line: 0, character: 22 }); // inside "pr|"
        expect(ctx?.tag).toBe('pdx-button');
        expect(ctx?.inValue).toBe('variant');
    });

    it('returns null outside any open tag', () => {
        expect(getTagContext('<pdx-button></pdx-button> text', { line: 0, character: 27 })).toBeNull();
    });
});

describe('manifest completion', () => {
    it('suggests attributes and events in attribute-name position', () => {
        const ctx = { tag: 'pdx-button', tagStart: 0, onTagName: false, inValue: null, attrToken: null, namePrefix: '' };
        const items = getTagAttributeCompletions(button, ctx);
        const labels = items.map(i => i.label);
        expect(labels).toContain('variant');
        expect(labels).toContain('size');
        expect(labels).toContain('@pdx-click');
    });

    it('suggests enum values inside an attribute value', () => {
        const ctx = { tag: 'pdx-button', tagStart: 0, onTagName: false, inValue: 'variant', attrToken: null, namePrefix: '' };
        const items = getTagAttributeCompletions(button, ctx);
        expect(items.map(i => i.label).sort()).toEqual(['ghost', 'primary']);
    });
});

describe('manifest hover', () => {
    it('shows attribute type/default/description', () => {
        const ctx = { tag: 'pdx-button', tagStart: 0, onTagName: false, inValue: null, attrToken: 'variant', namePrefix: '' };
        const h = getComponentHover(button, ctx) as any;
        expect(h.contents.value).toContain('variant');
        expect(h.contents.value).toContain("'primary' | 'ghost'");
    });

    it('shows component summary on the tag name', () => {
        const ctx = { tag: 'pdx-button', tagStart: 0, onTagName: true, inValue: null, attrToken: null, namePrefix: '' };
        const h = getComponentHover(button, ctx) as any;
        expect(h.contents.value).toContain('pdx-button');
        expect(h.contents.value).toContain('Props:');
    });
});

describe('component definition', () => {
    it('resolves a tag to its source file via the manifest', () => {
        const loc = resolveComponentDefinition('pdx-button', manifest, []);
        expect(loc?.uri).toContain('pdx-button.ts');
    });
    it('returns null for an unknown tag', () => {
        expect(resolveComponentDefinition('pdx-nope', manifest, [])).toBeNull();
    });

    it('jumps to the actual declaration LINE in the real source (not line 0)', () => {
        const root = join(__dirname, '..', '..', '..');
        const real = new Map([['pdx-button', {
            ...button, filePath: join(root, 'packages', 'ui', 'src', 'button', 'pdx-button.ts'),
        }]]);
        // tag → component('pdx-button' (line 20 → 0-based 19)
        const tagLoc = resolveComponentDefinition('pdx-button', real, []);
        expect(tagLoc!.range.start.line).toBeGreaterThan(0);
        // member → the `variant:` field, on a later line than the component declaration
        const memberLoc = resolveComponentDefinition('pdx-button', real, [], 'variant');
        expect(memberLoc!.range.start.line).toBeGreaterThan(tagLoc!.range.start.line);
    });
});

describe('enumValues', () => {
    it('extracts string-literal union members', () => {
        expect(enumValues("'a' | 'b' | 'c'")).toEqual(['a', 'b', 'c']);
        expect(enumValues('number')).toEqual([]);
    });
});
