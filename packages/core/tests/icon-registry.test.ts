import { describe, it, expect, beforeEach } from 'vitest';
import {
    registerIconSet, resolveIcon, getDefaultIconSet,
    setDefaultIconSet, hasIconSet, clearIconSets,
} from '../src/component/icon-registry';

beforeEach(() => {
    clearIconSets();
});

describe('registerIconSet', () => {
    it('registers an icon set', () => {
        registerIconSet('lucide', () => '<svg></svg>');
        expect(hasIconSet('lucide')).toBe(true);
    });

    it('first registered set becomes default', () => {
        registerIconSet('heroicons', () => '<svg></svg>');
        registerIconSet('lucide', () => '<svg></svg>');
        expect(getDefaultIconSet()).toBe('heroicons');
    });
});

describe('resolveIcon', () => {
    it('resolves from default set', async () => {
        registerIconSet('test', (name) => `<svg data-icon="${name}"></svg>`);
        const result = await resolveIcon('check');
        expect(result).toBe('<svg data-icon="check"></svg>');
    });

    it('resolves from specific set', async () => {
        registerIconSet('set-a', () => 'A');
        registerIconSet('set-b', () => 'B');
        expect(await resolveIcon('icon', 'set-b')).toBe('B');
    });

    it('returns null for unregistered set', async () => {
        expect(await resolveIcon('icon', 'nope')).toBeNull();
    });

    it('returns null when no sets registered', async () => {
        expect(await resolveIcon('icon')).toBeNull();
    });

    it('handles async resolvers', async () => {
        registerIconSet('async', async (name) => {
            return `<svg>${name}</svg>`;
        });
        const result = await resolveIcon('arrow');
        expect(result).toBe('<svg>arrow</svg>');
    });

    it('handles resolver errors gracefully', async () => {
        registerIconSet('broken', () => { throw new Error('fail'); });
        const result = await resolveIcon('icon');
        expect(result).toBeNull();
    });

    it('handles SVGElement return', async () => {
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        registerIconSet('elements', () => svgEl);
        const result = await resolveIcon('icon');
        expect(result).toBe(svgEl);
    });
});

describe('setDefaultIconSet', () => {
    it('changes the default set', async () => {
        registerIconSet('a', () => 'A');
        registerIconSet('b', () => 'B');
        setDefaultIconSet('b');
        expect(getDefaultIconSet()).toBe('b');
        expect(await resolveIcon('x')).toBe('B');
    });

    it('ignores setting unregistered set', () => {
        registerIconSet('a', () => 'A');
        setDefaultIconSet('nope');
        expect(getDefaultIconSet()).toBe('a');
    });
});

describe('clearIconSets', () => {
    it('removes all sets and resets default', () => {
        registerIconSet('a', () => 'A');
        registerIconSet('b', () => 'B');
        clearIconSets();
        expect(hasIconSet('a')).toBe(false);
        expect(hasIconSet('b')).toBe(false);
        expect(getDefaultIconSet()).toBeNull();
    });
});
