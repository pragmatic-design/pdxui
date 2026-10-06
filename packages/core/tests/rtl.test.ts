// Coverage (5): rtl — direction signal + logical-property helpers.

import { describe, it, expect, afterEach } from 'vitest';
import {
    direction, isRTL, setDirection,
    inlineStart, inlineEnd, flipPlacement, rtlTransformX,
} from '../src/i18n/rtl';

describe('rtl', () => {
    afterEach(() => setDirection('ltr'));

    it('defaults to ltr', () => {
        expect(direction()).toBe('ltr');
        expect(isRTL()).toBe(false);
    });

    it('setDirection updates the reactive signals and <html dir>', () => {
        setDirection('rtl');
        expect(direction()).toBe('rtl');
        expect(isRTL()).toBe(true);
        expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    });

    it('inlineStart/inlineEnd flip with direction', () => {
        expect(inlineStart()).toBe('left');
        expect(inlineEnd()).toBe('right');
        setDirection('rtl');
        expect(inlineStart()).toBe('right');
        expect(inlineEnd()).toBe('left');
    });

    it('flipPlacement swaps start/end only in rtl', () => {
        expect(flipPlacement('top-start')).toBe('top-start'); // ltr: unchanged
        setDirection('rtl');
        expect(flipPlacement('top-start')).toBe('top-end');
        expect(flipPlacement('bottom-end')).toBe('bottom-start');
        expect(flipPlacement('left')).toBe('left'); // no start/end token
    });

    it('rtlTransformX negates in rtl', () => {
        expect(rtlTransformX(10)).toBe(10);
        setDirection('rtl');
        expect(rtlTransformX(10)).toBe(-10);
    });
});
