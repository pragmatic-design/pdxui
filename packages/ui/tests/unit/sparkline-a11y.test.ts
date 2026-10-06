// pdx-sparkline has a text alternative a screen reader can read.
//
// A bare <canvas> with no role, no name and no fallback is announced as nothing, or "canvas", for a
// component whose whole job is a value trend (WCAG 1.1.1).
import { describe, it, expect, beforeEach } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/chart/pdx-sparkline';

const name = (el: HTMLElement): string => el.getAttribute('aria-label') ?? '';

describe('pdx-sparkline — role and accessible name', () => {
    beforeEach(() => { cleanup(); clearComponentStrings(); });

    it('data [1, 2, 3]: role="img" and a name that states the series and the last value', async () => {
        const el = await mount('pdx-sparkline', { data: '1,2,3' });
        await tick(20);
        expect(el.getAttribute('role')).toBe('img');
        expect(name(el)).toContain('1, 2, 3');
        expect(name(el)).toContain('3');
    });

    it('the name follows the data: [1, 2, 5] names 5', async () => {
        const el = await mount('pdx-sparkline', { data: '1,2,3' });
        await tick(20);
        el.setAttribute('data', '1,2,5');
        await tick(20);
        expect(name(el)).toContain('5');
        expect(name(el)).not.toContain('1, 2, 3');
    });

    it('a label prop wins over the generated name', async () => {
        const el = await mount('pdx-sparkline', { data: '4.1,4.3,4.6', label: 'Weight, last 6 months' });
        await tick(20);
        expect(name(el)).toBe('Weight, last 6 months');
    });

    it('a long series is summarised, not read out value by value', async () => {
        const data = Array.from({ length: 40 }, (_, i) => String(i + 1)).join(',');
        const el = await mount('pdx-sparkline', { data });
        await tick(20);
        expect(name(el)).toContain('40');
        expect(name(el).length).toBeLessThan(120);
    });

    it('the words come from the string registry, so an app translates them', async () => {
        setComponentStrings('sparkline', { summary: 'Andamento: {values}, ultimo {last}' });
        const el = await mount('pdx-sparkline', { data: '1,2,3' });
        await tick(20);
        expect(name(el)).toBe('Andamento: 1, 2, 3, ultimo 3');
    });
});
