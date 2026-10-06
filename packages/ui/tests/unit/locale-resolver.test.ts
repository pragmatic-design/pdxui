// One locale resolver for the components that format or parse numbers and dates.
//
// An empty `locale` means the same thing in every one of them: the prop, then the page's language
// (the nearest `lang`), then the browser, then 'en'. Without one rule, a lang="it" page reads «2,5»
// as 25 in one component and as 2.5 in another.
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveLocale } from '../../src/shared/locale';
import '../../src/number-input/pdx-number-input';
import '../../src/date-picker/pdx-date-picker';

type NumberInput = HTMLElement & { value: number };

async function frames(n: number): Promise<void> {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
}

async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

/** `tag` with `attrs`, inside a `<div lang>` when `lang` is given. */
function mountIn(lang: string | null, tag: string, attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (lang === null) { document.body.appendChild(el); return el; }
    const wrap = document.createElement('div');
    wrap.setAttribute('lang', lang);
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    return el;
}

async function typeAndCommit(el: HTMLElement, text: string): Promise<HTMLInputElement> {
    const input = await until(() => el.querySelector('input'), 'the inner input');
    await until(() => (input.onkeydown ? input : null), 'the input handlers');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    return input;
}

beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
});

describe('resolveLocale', () => {
    it('the prop wins over the page language', () => {
        const el = mountIn('it', 'span');
        expect(resolveLocale(el, 'en-GB')).toBe('en-GB');
    });

    it('the page language wins over the browser', () => {
        const el = mountIn('it', 'span');
        expect(resolveLocale(el, '')).toBe('it');
    });

    it('the nearest lang wins over a farther one', () => {
        const outer = document.createElement('div');
        outer.setAttribute('lang', 'de');
        const inner = document.createElement('div');
        inner.setAttribute('lang', 'fr-CA');
        const el = document.createElement('span');
        inner.appendChild(el);
        outer.appendChild(inner);
        document.body.appendChild(outer);
        expect(resolveLocale(el, '')).toBe('fr-CA');
    });

    it('no lang anywhere: the browser language', () => {
        const el = mountIn(null, 'span');
        expect(resolveLocale(el, '')).toBe(navigator.language);
    });

    it('an empty or invalid lang is skipped, not handed to Intl', () => {
        const el = mountIn('', 'span');
        expect(resolveLocale(el, '')).toBe(navigator.language);
        const bad = mountIn('not a tag!', 'span');
        expect(resolveLocale(bad, '')).toBe(navigator.language);
    });
});

describe('pdx-number-input reads the page language', () => {
    it('lang="it", no locale: «2,5» is 2.5, and it shows «2,5»', async () => {
        const el = mountIn('it', 'pdx-number-input', { step: '0.1' }) as NumberInput;
        const input = await typeAndCommit(el, '2,5');
        expect(el.value, 'the comma was read as a thousands separator').toBe(2.5);
        expect(input.value).toBe('2,5');
    });

    it('lang="it": «1.234,5» is 1234.5', async () => {
        const el = mountIn('it', 'pdx-number-input', { step: '0.1' }) as NumberInput;
        await typeAndCommit(el, '1.234,5');
        expect(el.value).toBe(1234.5);
    });

    it('control — lang="en": «2.5» is 2.5 and «2,500» is 2500', async () => {
        const a = mountIn('en', 'pdx-number-input', { step: '0.1' }) as NumberInput;
        await typeAndCommit(a, '2.5');
        expect(a.value).toBe(2.5);
        const b = mountIn('en', 'pdx-number-input') as NumberInput;
        await typeAndCommit(b, '2,500');
        expect(b.value).toBe(2500);
    });

    it('the prop still wins: locale="en-US" inside lang="it" reads «2,500» as 2500', async () => {
        const el = mountIn('it', 'pdx-number-input', { locale: 'en-US' }) as NumberInput;
        await typeAndCommit(el, '2,500');
        expect(el.value).toBe(2500);
    });
});

describe('pdx-number-input free mode: the step follows the digit under the cursor, grouping or not', () => {
    // Formatting with Intl everywhere brings grouping separators to the default case. A cursor
    // step that took the first "," or "." as the decimal point would step "1,234.5" by 1 instead of
    // 1000 with the cursor after the "1" — and "1.234,5" the same with a locale set.
    async function stepAt(lang: string, value: string, cursor: number): Promise<number> {
        const el = mountIn(lang, 'pdx-number-input', { controls: 'none', step: '0.1', value }) as NumberInput;
        const input = await until(() => el.querySelector('input'), 'the inner input');
        await until(() => (input.onkeydown ? input : null), 'the input handlers');
        await frames(2);
        input.setSelectionRange(cursor, cursor);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        return el.value;
    }

    it('lang="en", «1,234.5», cursor after the 1: +1000', async () => {
        expect(await stepAt('en', '1234.5', 1)).toBe(2234.5);
    });

    it('lang="it", «12.345,5», cursor after the 1: +10000', async () => {
        // Italian groups from five digits on (1234,5 has no separator), so the case needs 12345.
        expect(await stepAt('it', '12345.5', 1)).toBe(22345.5);
    });

    it('control — cursor right after the decimal point: +0.1', async () => {
        // «1,234.5»: position 6 is between "." and "5".
        expect(await stepAt('en', '1234.5', 6)).toBeCloseTo(1234.6, 5);
    });
});

describe('pdx-date-picker reads the page language', () => {
    async function monthTitle(el: HTMLElement): Promise<string> {
        const trigger = await until(() => el.querySelector('.pdx-date-picker-trigger') as HTMLElement | null, 'the trigger');
        trigger.click();
        await frames(3);
        const title = await until(() => el.querySelector('.pdx-cal-title') as HTMLElement | null, 'the calendar title');
        return title.textContent ?? '';
    }

    it('lang="it", no locale: September is «settembre»', async () => {
        const el = mountIn('it', 'pdx-date-picker', { value: '2026-09-11' });
        expect((await monthTitle(el)).toLowerCase()).toContain('settembre');
    });

    it('control — locale="en" inside lang="it": «September»', async () => {
        const el = mountIn('it', 'pdx-date-picker', { value: '2026-09-11', locale: 'en' });
        expect(await monthTitle(el)).toContain('September');
    });
});
