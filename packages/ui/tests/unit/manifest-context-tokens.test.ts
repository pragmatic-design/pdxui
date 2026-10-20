// The library's manifest records the context tokens each component provides and injects (#498).
//
// Nothing said that `<pdx-list>` reads the nearest `<pdx-data-source>` above it: an agent reading
// custom-elements.json could not tell. Each component that provides or injects a token lists it in
// `x-pdx-context`; a token given through a prop (the `token` of `<pdx-provide>` and
// `<pdx-data-source>`) is listed as that prop, `:token`.
//
// The committed manifest is what the generator produces (gen-manifest-fresh.test.ts), so reading it
// checks the generator.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ContextField = { provides?: string[]; injects?: { token: string; optional: boolean }[] };
type Decl = { tagName?: string; customElement?: boolean; 'x-pdx-context'?: ContextField };

const cem = JSON.parse(readFileSync(join(__dirname, '../../custom-elements.json'), 'utf-8')) as {
    modules: { declarations?: Decl[] }[];
};
const components = cem.modules.flatMap(m => m.declarations ?? []).filter(d => d.customElement && d.tagName);
const contextOf = (tag: string): ContextField | undefined => components.find(c => c.tagName === tag)?.['x-pdx-context'];

describe('context tokens in the manifest', () => {
    it('pdx-list injects DataSourceContext, optionally: it reads it with a fallback', () => {
        expect(contextOf('pdx-list')?.injects).toEqual([{ token: 'DataSourceContext', optional: true }]);
    });

    it('pdx-data-source provides DataSourceContext, and the token its prop names', () => {
        expect(contextOf('pdx-data-source')?.provides).toEqual([':token', 'DataSourceContext']);
    });

    it('pdx-error-boundary provides ErrorContext; pdx-provide provides the token its prop names', () => {
        expect(contextOf('pdx-error-boundary')?.provides).toEqual(['ErrorContext']);
        expect(contextOf('pdx-provide')?.provides).toEqual([':token']);
    });

    it('control — a component that neither provides nor injects has no field', () => {
        expect(contextOf('pdx-button')).toBeUndefined();
    });
});
