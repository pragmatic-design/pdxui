// pdx-number-input hears its keys from its first render, not from the next frame (#1107).
//
// It bound its inner <input> — the value shown, the key, input and blur handlers — in the frame after its
// first render. Until that frame came the field ignored what was typed, and the frame then wrote its
// value over it: on a busy page, the first keys in a number field created on the spot were lost.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from './helpers';
import '../../src/number-input/pdx-number-input';

type NumberInput = HTMLElement & { value: number | null };

const frame = window.requestAnimationFrame;

beforeEach(cleanup);
afterEach(() => { window.requestAnimationFrame = frame; });

describe('a number input created while frames come late', () => {
    it('shows its value and takes the typed number before the next frame', async () => {
        // No frame comes during this test: what the field does, it does without one.
        window.requestAnimationFrame = () => 0;
        const el = document.createElement('pdx-number-input') as NumberInput;
        el.value = 30;
        document.body.appendChild(el);
        await new Promise((r) => setTimeout(r, 0)); // the helpers' tick() waits for a frame, and none comes
        const input = el.querySelector('input')!;
        expect(input.value, 'the value is not shown until a frame').toBe('30');

        input.value = '40';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(el.value, 'the typed number did not reach the model').toBe(40);
        expect(input.value).toBe('40');
    });
});
