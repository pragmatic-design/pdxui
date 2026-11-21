// A component moved to .pdx (#1210) whose $effect waits a frame keeps working when the effect runs again.
//
// `onNextFrame` needs the setup's scope: inside an `$effect` it works on the first run, at setup, and
// throws on every later one ("called outside component setup()"), so what the effect does after a
// prop changes is lost. pdx-button-group passed a variant set after the mount to no button, and
// pdx-chip threw on every new label. Their TypeScript versions waited with requestAnimationFrame.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/button/pdx-button';
import '../../src/button-group/pdx-button-group.pdx';
import '../../src/chip/pdx-chip.pdx';

const unhandled = (spy: { mock: { calls: unknown[][] } }): string[] =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.includes('Unhandled effect error'));

describe('an effect that waits a frame, run again after the mount (#1210)', () => {
    let error: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { cleanup(); error = vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { error.mockRestore(); });

    it("pdx-button-group passes a variant set after the mount to its buttons", async () => {
        const group = document.createElement('pdx-button-group');
        group.innerHTML = '<pdx-button>A</pdx-button><pdx-button>B</pdx-button>';
        document.body.appendChild(group);
        await tick(30);
        group.setAttribute('variant', 'primary');
        group.setAttribute('size', 'sm');
        await tick(30);
        expect([...group.querySelectorAll('pdx-button')].map((b) => [b.getAttribute('variant'), b.getAttribute('size')]))
            .toEqual([['primary', 'sm'], ['primary', 'sm']]);
        expect(unhandled(error)).toEqual([]);
    });

    it('pdx-chip reads its text again after a new label, with no error', async () => {
        const chip = document.createElement('pdx-chip');
        chip.setAttribute('removable', '');
        chip.textContent = 'Rome';
        document.body.appendChild(chip);
        await tick(30);
        chip.setAttribute('label', 'Milan');
        await tick(30);
        expect(chip.querySelector('.pdx-chip-remove')?.getAttribute('aria-label')).toContain('Milan');
        expect(unhandled(error)).toEqual([]);
    });
});
