// Tests for Animation Ecosystem: stagger, sequencing, keyframes, spring.

import { describe, it, expect } from 'vitest';
import { keyframes } from '../src/renderer/keyframes';
import { spring } from '../src/renderer/spring';
import type { TransitionOptions } from '../src/renderer/helpers';

// ─── keyframes() ─────────────────────────────────────────────────

describe('keyframes()', () => {
    it('creates an AnimationConfig with defaults', () => {
        const bounce = keyframes('bounce', [
            { offset: 0, transform: 'translateY(0)' },
            { offset: 0.5, transform: 'translateY(-20px)' },
            { offset: 1, transform: 'translateY(0)' },
        ]);

        expect(bounce.name).toBe('bounce');
        expect(bounce.keyframes).toHaveLength(3);
        expect(bounce.options.duration).toBe(300);
        expect(bounce.options.easing).toBe('ease');
        expect(bounce.options.fill).toBe('forwards');
    });

    it('merges custom options with defaults', () => {
        const config = keyframes('fade', [
            { opacity: 0 },
            { opacity: 1 },
        ], { duration: 500, easing: 'ease-out' });

        expect(config.options.duration).toBe(500);
        expect(config.options.easing).toBe('ease-out');
        expect(config.options.fill).toBe('forwards'); // default preserved
    });
});

// ─── spring() ─────────────────────────────────────────────────────

describe('spring()', () => {
    it('returns a CSS linear() string', () => {
        const ease = spring();
        expect(ease).toMatch(/^linear\(/);
        expect(ease).toMatch(/\)$/);
    });

    it('starts at 0 and ends at 1', () => {
        const ease = spring({ stiffness: 300, damping: 20 });
        const match = ease.match(/linear\((.+)\)/);
        expect(match).not.toBeNull();

        const values = match![1].split(',').map(s => parseFloat(s.trim()));
        expect(values[0]).toBe(0);
        expect(values[values.length - 1]).toBe(1);
    });

    it('generates reasonable number of sample points', () => {
        const ease = spring({ precision: 30 });
        const match = ease.match(/linear\((.+)\)/);
        const values = match![1].split(',');
        // 30 steps + start(0) + end(1) = ~32 points
        expect(values.length).toBeGreaterThanOrEqual(20);
        expect(values.length).toBeLessThanOrEqual(60);
    });

    it('higher stiffness = faster convergence to 1', () => {
        const stiff = spring({ stiffness: 500, damping: 25, precision: 20 });
        const soft = spring({ stiffness: 100, damping: 25, precision: 20 });

        const stiffValues = stiff.match(/linear\((.+)\)/)![1].split(',').map(s => parseFloat(s.trim()));
        const softValues = soft.match(/linear\((.+)\)/)![1].split(',').map(s => parseFloat(s.trim()));

        // Stiffer spring should reach near-1 earlier (at ~30% of samples)
        const stiffMidpoint = stiffValues[Math.floor(stiffValues.length * 0.3)];
        const softMidpoint = softValues[Math.floor(softValues.length * 0.3)];
        expect(stiffMidpoint).toBeGreaterThan(softMidpoint);
    });

    it('custom config accepted', () => {
        const ease = spring({ stiffness: 200, damping: 15, mass: 2 });
        expect(ease).toMatch(/^linear\(/);
    });
});

// ─── TransitionOptions interface ──────────────────────────────────

describe('TransitionOptions', () => {
    it('accepts stagger and mode properties', () => {
        const opts: TransitionOptions = {
            enter: 'fade-in',
            exit: 'fade-out',
            stagger: 50,
            mode: 'out-in',
        };

        expect(opts.stagger).toBe(50);
        expect(opts.mode).toBe('out-in');
    });
});
