import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/input/pdx-input';

describe('pdx-input', () => {
    beforeEach(cleanup);

    it('renders an input element', async () => {
        const el = await mount('pdx-input');
        const input = el.querySelector('input');
        expect(input).toBeTruthy();
    });

    it('syncs value prop to input', async () => {
        const el = await mount('pdx-input', { value: 'hello' });
        await tick();
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input?.value).toBe('hello');
    });

    it('value="" clears the input (not blocked by truthy check)', async () => {
        const el = await mount('pdx-input', { value: 'hello' });
        await tick();
        (el as any).value = '';
        await tick();
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input?.value).toBe('');
    });

    it('placeholder prop sets input placeholder', async () => {
        const el = await mount('pdx-input', { placeholder: 'Search...' });
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input?.placeholder).toBe('Search...');
    });

    it('disabled prop disables the input', async () => {
        const el = await mount('pdx-input', { disabled: '' });
        await tick();
        const input = el.querySelector('input') as HTMLInputElement;
        expect(input?.disabled || el.querySelector('.pdx-input-wrap')?.classList.contains('pdx-disabled')).toBeTruthy();
    });

    it('emits pdx-input on user input', async () => {
        const el = await mount('pdx-input');
        let emitted = false;
        el.addEventListener('pdx-input', () => { emitted = true; });

        const input = el.querySelector('input') as HTMLInputElement;
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(emitted).toBe(true);
    });
});
