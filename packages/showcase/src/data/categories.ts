// Categories across tickets, customers and assets: a lookup managed in Settings.
//
// A record holds category CODES (`categories: string[]`); what a code is called, in each language,
// what colour it wears and which kinds of record may carry it live here — so renaming one renames it
// on every record at once, and deactivating one stops it being offered without taking it off the
// records that have it. Deactivated, never deleted.
import { signal, getLocale } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';

export type CategoryTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
export const CATEGORY_TONES: CategoryTone[] = ['primary', 'success', 'warning', 'danger', 'info', 'muted'];

export type CategoryEntity = 'tickets' | 'customers' | 'assets';
export const CATEGORY_ENTITIES: CategoryEntity[] = ['tickets', 'customers', 'assets'];

/** What a category is, apart from the row the store keeps it in. */
interface CategoryData {
    /** Stable: generated from the first English name, and what a record stores. */
    code: string;
    label: { en: string; it: string };
    color: CategoryTone;
    appliesTo: CategoryEntity[];
    active: boolean;
}

export interface Category extends StoredRow, CategoryData {
    id: number;
}

const SEED: CategoryData[] = [
    { code: 'hardware', label: { en: 'Hardware', it: 'Hardware' }, color: 'primary', appliesTo: ['tickets', 'assets'], active: true },
    { code: 'network', label: { en: 'Network', it: 'Rete' }, color: 'info', appliesTo: ['tickets', 'assets'], active: true },
    { code: 'software', label: { en: 'Software', it: 'Software' }, color: 'success', appliesTo: ['tickets'], active: true },
    { code: 'billing', label: { en: 'Billing', it: 'Fatturazione' }, color: 'warning', appliesTo: ['tickets', 'customers'], active: true },
    { code: 'key-account', label: { en: 'Key account', it: 'Cliente strategico' }, color: 'danger', appliesTo: ['customers'], active: true },
    { code: 'public-sector', label: { en: 'Public sector', it: 'Pubblica amministrazione' }, color: 'muted', appliesTo: ['customers'], active: true },
    { code: 'peripherals', label: { en: 'Peripherals', it: 'Periferiche' }, color: 'primary', appliesTo: ['assets'], active: true },
    { code: 'on-site', label: { en: 'On site', it: 'In sede' }, color: 'info', appliesTo: ['tickets'], active: true },
];

const store = createMemoryStore<Category>({
    seed: () => SEED.map((c, i) => ({ ...c, id: i + 1, label: { ...c.label }, appliesTo: [...c.appliesTo] })),
    create: (values, id) => ({
        id,
        code: String(values.code ?? ''),
        label: { en: values.label?.en ?? '', it: values.label?.it ?? '' },
        color: values.color ?? 'muted',
        appliesTo: values.appliesTo ?? [],
        active: true,
    }),
    refusal: 'The server refused: a category is deactivated, not deleted.',
    bulkRefusal: 'The server refused this one: it is on records.',
});

/** Bumped on every write: every screen reading categories reads them again. */
const version = signal(0);

/** Every category, reactively, in the order they were made. */
export function categories(): readonly Category[] {
    version();
    return store.all().slice().sort((a, b) => a.id - b.id);
}

export function categoryByCode(code: string): Category | undefined {
    return categories().find((c) => c.code === code);
}

/** The ones a record of this kind may be given: active, and applying to it. */
export function categoriesFor(entity: CategoryEntity): Category[] {
    return categories().filter((c) => c.active && c.appliesTo.includes(entity));
}

/** A category's name in the page's language, falling back to English. */
export function categoryLabel(code: string): string {
    const c = categoryByCode(code);
    if (!c) return code;
    const locale = getLocale()().slice(0, 2) as 'en' | 'it';
    return c.label[locale] || c.label.en;
}

/** The badge tones by code, for a grid column: a deactivated one is muted wherever it still is. */
export function categoryTones(): Record<string, string> {
    return Object.fromEntries(categories().map((c) => [c.code, c.active ? c.color : 'muted']));
}

/** Options for a picker: the active ones that apply, named in the page's language. */
export function categoryOptions(entity: CategoryEntity): { value: string; label: string }[] {
    return categoriesFor(entity).map((c) => ({ value: c.code, label: categoryLabel(c.code) }));
}

/** A code from the first English name: lower case, dashes, and unique. */
function codeFor(name: string): string {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
    const taken = new Set(store.all().map((c) => c.code));
    let code = base;
    for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
    return code;
}

export async function createCategory(values: { label: { en: string; it: string }; color: CategoryTone; appliesTo: CategoryEntity[] }): Promise<Category> {
    const row = await store.transport.create({ ...values, code: codeFor(values.label.en) });
    version.set((v) => v + 1);
    return row;
}

export async function updateCategory(row: Category): Promise<Category> {
    const saved = await store.transport.update(row);
    version.set((v) => v + 1);
    return saved;
}

export const resetCategories = (): void => { store.reset(); version.set((v) => v + 1); };
