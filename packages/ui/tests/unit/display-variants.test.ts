// The surfaces, navigation and display components declare their axes (#632): reflected on the host,
// where the design CSS's `@variant` rules key on them, and no longer assembled into classes.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/card/pdx-card';
import '../../src/fieldset/pdx-fieldset';
import '../../src/tabs/pdx-tabs';
import '../../src/description-list/pdx-description-list';
import '../../src/statistic/pdx-statistic';
import '../../src/wizard/pdx-wizard';
import '../../src/nav-menu/pdx-nav-menu';
import '../../src/kbd/pdx-kbd';
import '../../src/avatar-group/pdx-avatar-group';

const attrs = (el: Element, names: string[]) => names.map((n) => el.getAttribute(n));
const classesLike = (el: Element | null | undefined, pattern: RegExp) => [...(el?.classList ?? [])].filter((c) => pattern.test(c));

describe('pdx-card\'s variant', () => {
    beforeEach(cleanup);

    it('is reflected, default by default, and draws from the host, its root keeping its base classes', async () => {
        const plain = await mount('pdx-card');
        const card = await mount('pdx-card', { variant: 'outline' });
        expect([plain.getAttribute('variant'), card.getAttribute('variant')]).toEqual(['default', 'outline']);
        const root = card.querySelector(':scope > [data-part="root"]');
        expect(root?.classList.contains('pdx-surface-card')).toBe(true);
        expect(classesLike(root, /^pdx-card-(default|outline|elevated|flat)$/)).toEqual([]);
    });
});

describe('pdx-fieldset\'s variant and size', () => {
    beforeEach(cleanup);

    it('are reflected, bordered and md by default, and leave no class on the fieldset', async () => {
        const plain = await mount('pdx-fieldset', { legend: 'A' });
        const fs = await mount('pdx-fieldset', { legend: 'B', variant: 'filled', size: 'sm' });
        await tick(50);
        expect([...attrs(plain, ['variant', 'size']), ...attrs(fs, ['variant', 'size'])]).toEqual(['bordered', 'md', 'filled', 'sm']);
        const root = fs.querySelector(':scope > [data-part="root"]');
        expect(root?.classList.contains('pdx-fieldset')).toBe(true);
        expect(classesLike(root, /^pdx-fieldset-(filled|plain|sm|lg)$/)).toEqual([]);
    });
});

describe('pdx-tabs\'s variant', () => {
    beforeEach(cleanup);

    function tabs(variant?: string): HTMLElement {
        const el = document.createElement('pdx-tabs');
        if (variant) el.setAttribute('variant', variant);
        el.innerHTML = '<div role="tablist"><button data-tab="a">A</button><button data-tab="b">B</button></div>'
            + '<div data-tab-panel="a">A</div><div data-tab-panel="b">B</div>';
        document.body.appendChild(el);
        return el;
    }

    it('is reflected, line by default, and puts no class on the host', async () => {
        const plain = tabs();
        const pills = tabs('pills');
        await tick(50);
        expect([plain.getAttribute('variant'), pills.getAttribute('variant')]).toEqual(['line', 'pills']);
        expect(classesLike(pills, /^pdx-tabs-(card|pills)$/)).toEqual([]);
        expect(pills.querySelector('.pdx-tab-indicator'), 'pills draw no indicator').toBeNull();
    });
});

describe('pdx-description-list\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, and leaves no size class on the list', async () => {
        const plain = await mount('pdx-description-list');
        const dl = document.createElement('pdx-description-list');
        dl.setAttribute('size', 'sm');
        (dl as unknown as { items: unknown }).items = [{ label: 'A', value: '1' }];
        document.body.appendChild(dl);
        await tick(50);
        expect([plain.getAttribute('size'), dl.getAttribute('size')]).toEqual(['md', 'sm']);
        const root = dl.querySelector(':scope > [data-part="root"]');
        expect(root?.classList.contains('pdx-dl')).toBe(true);
        expect(classesLike(root, /^pdx-dl-(sm|md|lg)$/)).toEqual([]);
    });
});

describe('pdx-statistic\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, and puts no size class on the host', async () => {
        const plain = await mount('pdx-statistic', { title: 'A', value: '1' });
        const big = await mount('pdx-statistic', { title: 'B', value: '2', size: 'lg' });
        await tick(50);
        expect([plain.getAttribute('size'), big.getAttribute('size')]).toEqual(['md', 'lg']);
        // No class of its own on the host at all since #291: statistic.css draws the tag.
        expect(big.getAttribute('class')).toBeNull();
        expect(classesLike(big, /^pdx-statistic-(sm|lg)$/)).toEqual([]);
    });
});

describe('pdx-wizard\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, and leaves no size class on its stepper, its root part', async () => {
        const wizard = (size?: string) => {
            const el = document.createElement('pdx-wizard');
            if (size) el.setAttribute('size', size);
            for (const label of ['One', 'Two']) {
                const step = document.createElement('div');
                step.setAttribute('data-wizard-step', '');
                step.setAttribute('data-label', label);
                el.appendChild(step);
            }
            document.body.appendChild(el);
            return el;
        };
        const plain = wizard();
        const small = wizard('sm');
        await tick(100);
        expect([plain.getAttribute('size'), small.getAttribute('size')]).toEqual(['md', 'sm']);
        const root = small.querySelector(':scope > [data-part="root"]');
        expect(root?.classList.contains('pdx-stepper')).toBe(true);
        expect(root?.classList.contains('pdx-stepper-sm')).toBe(false);
    });
});

describe('pdx-nav-menu\'s looks', () => {
    beforeEach(cleanup);

    it('reflects size, indicator, chevron and actions with their defaults, and puts no class for them on the host', async () => {
        const plain = await mount('pdx-nav-menu');
        const looks = await mount('pdx-nav-menu', { size: 'sm', indicator: 'border', chevron: 'end', actions: 'overlay' });
        await tick(50);
        const names = ['size', 'indicator', 'chevron', 'actions'];
        expect(attrs(plain, names)).toEqual(['md', 'fill', 'start', 'inline']);
        expect(attrs(looks, names)).toEqual(['sm', 'border', 'end', 'overlay']);
        expect(classesLike(looks, /^pdx-nav-(size|indicator|chevron|actions)-/)).toEqual([]);
    });
});

describe('pdx-kbd\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, and leaves no size class on the combo, its root part', async () => {
        const plain = await mount('pdx-kbd', { keys: 'Ctrl+K' });
        const big = await mount('pdx-kbd', { keys: 'Ctrl+K', size: 'lg' });
        expect([plain.getAttribute('size'), big.getAttribute('size')]).toEqual(['md', 'lg']);
        const root = big.querySelector(':scope > [data-part="root"]');
        expect(root?.className).toBe('pdx-kbd-combo');
    });
});

describe('pdx-avatar-group\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, still reaches its avatars, and leaves no size class on the overflow badge', async () => {
        const group = (size?: string) => {
            const el = document.createElement('pdx-avatar-group');
            if (size) el.setAttribute('size', size);
            el.setAttribute('max', '1');
            (el as unknown as { items: unknown }).items = [{ name: 'Ann' }, { name: 'Bob' }];
            document.body.appendChild(el);
            return el;
        };
        const plain = group();
        const big = group('xl');
        await tick(50);
        expect([plain.getAttribute('size'), big.getAttribute('size')]).toEqual(['md', 'xl']);
        expect(big.querySelector('pdx-avatar')?.getAttribute('size')).toBe('xl');
        const badge = big.querySelector('.pdx-avatar-group-overflow');
        expect(badge).not.toBeNull();
        expect(classesLike(badge, /^pdx-avatar-size-/)).toEqual([]);
    });
});
